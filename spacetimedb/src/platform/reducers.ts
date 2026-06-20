import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "./schema";
import {
  holeCards,
  maybeAutostart,
  spawnCard,
  spawnOutput,
  tryBeginRun,
} from "../engine/engine";
import { relayout } from "../engine/layout";
import { requireCaller, requireMember } from "./auth";
import type { Ctx, Card } from "./types";

// Admin-only: drop a card of `defId` onto a board. An operational tool — gift a
// card, or stand up a test scenario without playing the chain by hand. Gated on
// the caller being an admin AND a member of the board.
export const devGrant = spacetimedb.reducer(
  { boardId: t.u64(), defId: t.string(), x: t.f32(), y: t.f32() },
  (ctx, { boardId, defId, x, y }) => {
    const { user: me } = requireCaller(ctx);
    if (!me.isAdmin) throw new SenderError("admin only");
    requireMember(ctx, boardId);
    if (!ctx.db.cardDef.defId.find(defId))
      throw new SenderError("no such card def");
    const c = spawnCard(ctx, boardId, defId, x, y);
    relayout(ctx, boardId, c.id);
  },
);

// Admin-only: re-tidy a whole board (size-aware, overlap-free) with nothing
// pinned. The migration path for a board left messy by an old layout, and a
// handy "clean up the table" operational tool.
export const relayoutBoard = spacetimedb.reducer(
  { boardId: t.u64() },
  (ctx, { boardId }) => {
    const { user: me } = requireCaller(ctx);
    if (!me.isAdmin) throw new SenderError("admin only");
    requireMember(ctx, boardId);
    relayout(ctx, boardId);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Reducers
// ──────────────────────────────────────────────────────────────────────────

// Start a fresh board: the crash site. Four hand-cranked tier-0 stations and
// nothing else — no resources, no blueprints, and NOT the Printer or Workshop.
// You crawl from the wreck with your hands and a Research bench; the Printer and
// then the Workshop are dug out of the Wreck itself (33% each per scavenge while
// you still lack them — see wreckDrop in resolvers.ts), which softens the opening
// and tells the story of saving a few things from the crash. Everything else is
// earned: gather by hand, RESEARCH your first blueprint (the Research bench turns
// Effort into the next plan you've qualified for — see researchTarget in
// resolvers.ts), BUILD it at the Workshop, and climb the tree to a Rocket.
// Blueprints used to be dealt up-front; now the tech tree unfurls through
// research, gated by what you've discovered. See docs/ESCAPE_THE_MOON.md.
export const newGame = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  const b = ctx.db.board.insert({
    id: 0n,
    name: "Crash Site",
    owner: me.id,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    userId: me.id,
    role: { tag: "player" },
  });

  // Tier-0 stations along the top: the Survivor (your hands), the two gatherers,
  // and the Research bench (earns blueprints). The Printer and Workshop are NOT
  // dealt — you salvage them from the Wreck (resolvers.ts, wreckDrop). Rough
  // coordinates — relayout tidies them below.
  const survivor = spawnCard(ctx, b.id, "survivor", 40, 40);
  spawnCard(ctx, b.id, "regolith_field", 540, 40);
  spawnCard(ctx, b.id, "wreck", 300, 40);
  spawnCard(ctx, b.id, "research", 40, 340);

  // Hand the player two Effort to start: seed them into the Survivor's output
  // tray (produced-but-uncollected, exactly as a normal Survivor cycle leaves
  // them — each Effort is its own card row, there is no quantity). The board
  // opens with 2 Effort sitting under the Survivor, ready to crank a station.
  spawnOutput(ctx, b.id, "effort", survivor.id);
  spawnOutput(ctx, b.id, "effort", survivor.id);

  // Tidy the deal: the hand-placed coordinates above are rough; let the
  // size-aware layout space everything cleanly (and account for the stations'
  // full footprints) before the player sees it.
  relayout(ctx, b.id);
});

// Shared gate for slotting card `c` into verb `verb`'s hole `slotIndex`: the
// verb must exist, the hole must exist, accept the card, and be empty. Throws a
// SenderError on any failure. Source-location rules are the caller's to enforce
// (slotCard wants a tabletop card; collectAndSlot allows any source).
//
// Note we DON'T require the verb to be idle: you can top up an empty hole while
// the verb is mid-run, which is what makes a Refinery's raw inbox a queue (drop
// more scrap while it smelts). Single-hole verbs are still effectively locked while
// running — their one hole is occupied, so the "hole already filled" check below
// rejects the drop anyway.
function assertSlottable(
  ctx: Ctx,
  c: Card,
  verb: Card,
  slotIndex: number,
): void {
  if (c.boardId !== verb.boardId)
    throw new SenderError("cards are on different boards");
  const def = ctx.db.cardDef.defId.find(verb.defId);
  if (!def || !def.isVerb) throw new SenderError("target is not a verb");
  const s = ctx.db.situation.cardId.find(verb.id);
  if (!s) throw new SenderError("target is not a verb");

  const slot = [...ctx.db.slotDef.defId.filter(verb.defId)].find(
    (sl) => sl.slotIndex === slotIndex,
  );
  if (!slot) throw new SenderError("no such hole");
  const cdef = ctx.db.cardDef.defId.find(c.defId);
  const cat = cdef ? cdef.category : "";
  if (!slot.accepts.includes(c.defId) && !slot.accepts.includes(cat))
    throw new SenderError("that card is not accepted here");
  // A drone bay (droneLevel > 0) additionally enforces the drone's Mk: the client
  // already greys out under-spec drones, but never trust that — gate it here too.
  if (slot.droneLevel > 0 && (!cdef || cdef.droneLevel < slot.droneLevel))
    throw new SenderError("that drone's Mk is too low for this bay");
  if (
    holeCards(ctx, verb.id).some(
      (h) => h.location.value.slotIndex === slotIndex,
    )
  )
    throw new SenderError("hole already filled");
}

// Drop a loose card into a verb's hole.
export const slotCard = spacetimedb.reducer(
  { cardId: t.u64(), verbCardId: t.u64(), slotIndex: t.u32() },
  (ctx, { cardId, verbCardId, slotIndex }) => {
    const c = ctx.db.card.id.find(cardId);
    const verb = ctx.db.card.id.find(verbCardId);
    if (!c || !verb) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);
    if (c.location.tag !== "tabletop")
      throw new SenderError("card is not loose on the table");

    assertSlottable(ctx, c, verb, slotIndex);

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });
    // Start the host (a freshly-filled input hole may complete its recipe) and —
    // if the dropped card is itself a drone — start the drone's service loop.
    maybeAutostart(ctx, verbCardId);
    maybeAutostart(ctx, cardId);
  },
);

// Collect a produced (output) or slotted card and drop it straight into another
// verb's hole — atomically. This is the one-gesture equivalent of moveCard then
// slotCard, but in a single transaction, so the target verb can't slip out of
// `assembling` in the gap. Freeing an output slot may resume a stalled emitter,
// exactly as moveCard's collect path does.
export const collectAndSlot = spacetimedb.reducer(
  { cardId: t.u64(), verbCardId: t.u64(), slotIndex: t.u32() },
  (ctx, { cardId, verbCardId, slotIndex }) => {
    const c = ctx.db.card.id.find(cardId);
    const verb = ctx.db.card.id.find(verbCardId);
    if (!c || !verb) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);

    const cdef = ctx.db.cardDef.defId.find(c.defId);
    const isDrone = !!cdef && cdef.category === "drone";

    const old = c.location;
    // A card bound to a verb that's mid-run can't be pulled out — EXCEPT a drone,
    // which lives in a drone bay (not an input hole) and is freely reassignable
    // even while its host machine is working.
    if (old.tag === "slotted" && !isDrone) {
      const src = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (src && src.state.tag !== "assembling")
        throw new SenderError("cannot take a card out of a running verb");
    }

    assertSlottable(ctx, c, verb, slotIndex);

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });

    // Vacating an output tray can un-stall the verb that produced this card.
    if (old.tag === "output") {
      const src = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (src && src.state.tag === "stalled")
        tryBeginRun(ctx, old.value.verbCardId);
    }

    maybeAutostart(ctx, verbCardId);
    maybeAutostart(ctx, cardId);
  },
);

// Move a card to a tabletop position. Doubles as unslot (from an assembling
// verb) and collect (from an output tray, which can un-stall the verb).
export const moveCard = spacetimedb.reducer(
  { cardId: t.u64(), x: t.f32(), y: t.f32() },
  (ctx, { cardId, x, y }) => {
    const c = ctx.db.card.id.find(cardId);
    if (!c) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);

    const cdef = ctx.db.cardDef.defId.find(c.defId);
    const isDrone = !!cdef && cdef.category === "drone";

    const old = c.location;
    // Drones are exempt: a drone in a bay can be lifted out for reassignment even
    // while its host runs. Any other card locked into a running verb stays put.
    if (old.tag === "slotted" && !isDrone) {
      const s = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (s && s.state.tag !== "assembling") {
        throw new SenderError("cannot take a card out of a running verb");
      }
    }

    ctx.db.card.id.update({
      ...c,
      location: { tag: "tabletop", value: { x, y } },
    });

    // Pulling a drone out of its bay stops its service loop: reset it to idle so
    // the in-flight 2s tick no-ops. On the table it has no host and stays dormant.
    if (old.tag === "slotted" && isDrone) {
      const ds = ctx.db.situation.cardId.find(c.id);
      if (ds)
        ctx.db.situation.cardId.update({
          ...ds,
          state: { tag: "assembling" },
          endsAt: undefined,
        });
    }

    if (old.tag === "output") {
      const v = old.value.verbCardId;
      const s = ctx.db.situation.cardId.find(v);
      if (s && s.state.tag === "stalled") tryBeginRun(ctx, v);
    }

    // Planting: a card just placed on the table may now begin (a no-hole verb
    // like a Seed starts growing the moment it's on the tabletop). Inert cards
    // and verbs with unfilled holes are no-ops inside maybeAutostart.
    maybeAutostart(ctx, cardId);

    // Tidy the board around where the player dropped this card: pin it (it stays
    // exactly where they put it) and let any cards it overlaps give way.
    relayout(ctx, c.boardId, cardId);
  },
);

// Dismiss an achievement toaster: flip its `seen` flag so it stops popping. The
// award itself is one-shot (awardAchievements never re-inserts), so this just
// silences the notification — the earned row stays for stats/UI.
export const markAchievementSeen = spacetimedb.reducer(
  { achievementId: t.u64() },
  (ctx, { achievementId }) => {
    const row = ctx.db.achievement.id.find(achievementId);
    if (!row) return; // already gone — nothing to dismiss
    requireMember(ctx, row.boardId);
    if (row.seen) return;
    ctx.db.achievement.id.update({ ...row, seen: true });
  },
);
