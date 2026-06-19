import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "./schema";
import { holeCards, maybeAutostart, spawnCard, tryBeginRun } from "./engine";
import { relayout } from "./layout";
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

// The Workshop's salvaged manuals — every machine and drone you can build. They
// are all seeded so the game is always completable; the tech-tree order is
// enforced by the resource graph, not by withholding the blueprints. See the
// BUILDS map in resolvers.ts.
const BLUEPRINTS = [
  "solar",
  "refinery",
  "fabricator",
  "kiln",
  "electronics_fab",
  "ice_mine",
  "electrolysis",
  "chem_reactor",
  "assembler",
  "rocket",
  "mining_drone",
  "survey_drone",
  "hauler",
  "feeder",
  "fitter",
  "tanker",
  "cargo",
];

// Start a fresh board: the crash site. Survivor + the hand-cranked stations
// (Regolith Field, Wreck, Printer, Workshop), a little bootstrap material, and
// the shelf of blueprints. From here you build a Solar Array, electrify, and
// climb the tech tree to a Rocket. See docs/ESCAPE_THE_MOON.md.
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

  // Tier-0 stations along the top.
  spawnCard(ctx, b.id, "survivor", 40, 40);
  spawnCard(ctx, b.id, "regolith_field", 300, 40);
  spawnCard(ctx, b.id, "wreck", 560, 40);
  spawnCard(ctx, b.id, "printer", 820, 40);
  spawnCard(ctx, b.id, "workshop", 1080, 40);

  // A handful of parts so the first Solar Array build isn't a cold start.
  spawnCard(ctx, b.id, "component", 1080, 320);
  spawnCard(ctx, b.id, "component", 1180, 320);
  spawnCard(ctx, b.id, "scrap", 560, 320);
  spawnCard(ctx, b.id, "scrap", 660, 320);

  // The blueprint shelf, laid out in a grid in the lower band of the table.
  BLUEPRINTS.forEach((target, i) => {
    const x = 40 + (i % 9) * 150;
    const y = 520 + Math.floor(i / 9) * 140;
    spawnCard(ctx, b.id, `blueprint_${target}`, x, y);
  });

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
    maybeAutostart(ctx, verbCardId);
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

    const old = c.location;
    // A card bound to a verb that's mid-run can't be pulled out.
    if (old.tag === "slotted") {
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

    const old = c.location;
    if (old.tag === "slotted") {
      const s = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (s && s.state.tag !== "assembling") {
        throw new SenderError("cannot take a card out of a running verb");
      }
    }

    ctx.db.card.id.update({
      ...c,
      location: { tag: "tabletop", value: { x, y } },
    });

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
