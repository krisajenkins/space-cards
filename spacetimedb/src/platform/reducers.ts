import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "./schema";
import {
  holeCards,
  maybeAutostart,
  spawnCard,
  spawnOutput,
  tryBeginRun,
  wakeBayDrones,
} from "../engine/engine";
import { relayout, clusterOf } from "../engine/layout";
import {
  OPENING_BOARD_NAME,
  OPENING_STATIONS,
  OPENING_OUTPUTS,
} from "../content/opening";
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
    // A gifted resource is loot a parked drone may want — re-check them.
    wakeBayDrones(ctx, boardId);
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

// Start a fresh board: the crash site. The board + the player's membership are
// platform concerns and live here; the tableau dealt onto it — which tier-0
// stations, the deliberately withheld Printer/Workbench, the starting Effort — is
// content and lives in content/opening.ts. You crawl from the wreck with your
// hands and a Research bench; the Printer and then the Workbench are dug out of
// the Wreck itself (see wreckDrop in resolvers.ts). Everything else is earned:
// gather by hand, RESEARCH a blueprint (researchTarget in resolvers.ts), BUILD
// it at the Workbench, and climb the tree to a Rocket. See docs/ESCAPE_THE_MOON.md.
export const newGame = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  const b = ctx.db.board.insert({
    id: 0n,
    name: OPENING_BOARD_NAME,
    owner: me.id,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    userId: me.id,
    role: { tag: "player" },
  });

  // Deal the opening tableau (content/opening.ts). Spread the stations along the
  // top at rough coordinates — relayout tidies them (size-aware, overlap-free,
  // accounting for full footprints) below. Track the spawned cards by defId so
  // the starting outputs can land in the right station's tray.
  const dealt = new Map<string, Card>();
  OPENING_STATIONS.forEach((defId, i) => {
    dealt.set(
      defId,
      spawnCard(ctx, b.id, defId, 40 + (i % 2) * 260, (i / 2) * 40),
    );
  });

  // Starting outputs: seed each into its host station's tray (produced-but-
  // uncollected, exactly as a normal cycle leaves it — each is its own card row,
  // there is no quantity).
  for (const { def, into } of OPENING_OUTPUTS) {
    const host = dealt.get(into);
    if (host) spawnOutput(ctx, b.id, def, host.id);
  }

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

    // Note before consuming whether this tabletop card was part of a pile — if so
    // the remaining members need to re-fan to close the gap (see below).
    const wasInPile = clusterOf(ctx, c.boardId, c).length > 1;

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });
    // Start the host (a freshly-filled input hole may complete its recipe) and —
    // if the dropped card is itself a drone — start the drone's service loop.
    maybeAutostart(ctx, verbCardId);
    maybeAutostart(ctx, cardId);
    // Pulling one card out of a pile leaves a gap in the fan — relayout so the
    // remaining members re-tighten. Removing a card can't create an overlap, so
    // this is the only reason to relayout on a consume path.
    if (wasInPile) relayout(ctx, c.boardId);
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

    // A tabletop source may belong to a pile; note it before consuming so the rest
    // can re-fan. (output/slotted sources are never in a pile.)
    const wasInPile =
      old.tag === "tabletop" && clusterOf(ctx, c.boardId, c).length > 1;

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
    // If the source was another verb's input hole, that hole just emptied — a
    // parked bay drone there may now have a refill to do. Re-check the board.
    wakeBayDrones(ctx, c.boardId);
    // Re-fan the remaining pile members if this consumed a card out of a pile.
    if (wasInPile) relayout(ctx, c.boardId);
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

    // Dragging a tabletop token that belongs to a PILE drags the WHOLE pile: move
    // every cluster member by the same delta (dragged card's old position → drop
    // point), preserving their relative offsets. They stay adjacent (all shifted
    // equally), so relayout re-clusters and re-fans the pile at the destination.
    // Only tabletop tokens stack — the slotted/output branches fall through to the
    // single-card move below.
    if (old.tag === "tabletop") {
      const pile = clusterOf(ctx, c.boardId, c);
      if (pile.length > 1) {
        const deltaX = x - old.value.x;
        const deltaY = y - old.value.y;
        for (const m of pile) {
          if (m.location.tag !== "tabletop") continue;
          ctx.db.card.id.update({
            ...m,
            location: {
              tag: "tabletop",
              value: {
                x: m.location.value.x + deltaX,
                y: m.location.value.y + deltaY,
              },
            },
          });
        }
        // Pin the dragged card and let the pile re-settle/re-fan at the drop point.
        relayout(ctx, c.boardId, cardId);
        return;
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
    // This card landed loose on the table (fresh loot) and/or vacated an input
    // hole — both can hand a parked bay drone work, so re-check the board. (The
    // pile-drag branch above returns early: it's a pure reposition, no wake.)
    wakeBayDrones(ctx, c.boardId);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Warehouse: house / un-house a factory card. Housing is pure LAYOUT RELIEF — a
// housed verb keeps fully running (its situation/timer ticks, its bay drone feeds
// it, other machines pull from its tray); only the verb's OWN location changes to
// `housed`. Its slotted children + output cards reference it by id and stay put.
// See the `housed` Location variant and engine.ts maybeAutostart.
// ──────────────────────────────────────────────────────────────────────────
const WAREHOUSE_CAPACITY = 6;

// Move a tabletop verb card INTO a warehouse. Asserts membership, same board, a
// real `warehouse` target, a verb source loose on the table (not an inert token,
// blueprint, drone-in-bay, already-housed/slotted/output card, or a warehouse),
// and the 6-card capacity. Then relayout pinned on the warehouse so the freed
// space repacks around it (housed cards drop out of the packing — see layout.ts).
export const houseCard = spacetimedb.reducer(
  { cardId: t.u64(), warehouseCardId: t.u64() },
  (ctx, { cardId, warehouseCardId }) => {
    const c = ctx.db.card.id.find(cardId);
    const wh = ctx.db.card.id.find(warehouseCardId);
    if (!c || !wh) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);
    if (c.boardId !== wh.boardId)
      throw new SenderError("cards are on different boards");
    if (wh.defId !== "warehouse")
      throw new SenderError("target is not a warehouse");
    if (cardId === warehouseCardId)
      throw new SenderError("a warehouse can't house itself");

    const cdef = ctx.db.cardDef.defId.find(c.defId);
    if (!cdef || !cdef.isVerb)
      throw new SenderError("only a verb card can be housed");
    if (c.location.tag !== "tabletop")
      throw new SenderError("card must be loose on the table to house it");

    // Capacity: count what's already in this warehouse.
    const housed = [...ctx.db.card.boardId.filter(c.boardId)].filter(
      (x) =>
        x.location.tag === "housed" &&
        x.location.value.warehouseCardId === warehouseCardId,
    ).length;
    if (housed >= WAREHOUSE_CAPACITY)
      throw new SenderError("warehouse is full");

    ctx.db.card.id.update({
      ...c,
      location: { tag: "housed", value: { warehouseCardId } },
    });
    // The card left the tabletop packing; repack around the (pinned) warehouse so
    // its neighbours reclaim the freed space.
    relayout(ctx, c.boardId, warehouseCardId);
  },
);

// Pull a housed card back out onto the tabletop, next to its warehouse. Asserts
// membership + that the card is actually housed; places it at a small offset from
// the warehouse's tabletop position (falling back to the origin if the warehouse
// has somehow been housed/moved off the table), then relayout pins the unhoused
// card so it keeps that spot and neighbours give way.
export const unhouseCard = spacetimedb.reducer(
  { cardId: t.u64() },
  (ctx, { cardId }) => {
    const c = ctx.db.card.id.find(cardId);
    if (!c) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);
    if (c.location.tag !== "housed")
      throw new SenderError("card is not in a warehouse");

    const wh = ctx.db.card.id.find(c.location.value.warehouseCardId);
    const base =
      wh && wh.location.tag === "tabletop"
        ? { x: wh.location.value.x + 60, y: wh.location.value.y + 60 }
        : { x: 0, y: 0 };

    ctx.db.card.id.update({
      ...c,
      location: { tag: "tabletop", value: base },
    });
    relayout(ctx, c.boardId, cardId);
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Account deletion (GDPR Art. 17 — right to erasure). A player erases themselves
// and everything we hold about them: every board they OWN (with all its cards,
// history, achievements, running situations and timers), their seat on any board,
// every linked sign-in identity, and finally the `user` row carrying their
// email / name / picture. A board owned by SOMEONE ELSE that the caller merely
// spectates is left intact — we only drop the caller's own membership of it.
//
// Irreversible, with no soft-delete: erasure means the rows are gone. After it
// runs the caller's principal is unlinked, so their next reducer fails
// requireCaller — the client signs out and reloads.
// ──────────────────────────────────────────────────────────────────────────

// Hard-delete a board and everything that references it. No DB-enforced FKs, so
// order is only about hygiene: clear the scheduled timers first so none can fire
// completeSituation against a half-deleted board. Each iteration spreads to an
// array first — deleting while iterating the live table is unsafe.
function deleteBoardCascade(ctx: Ctx, boardId: bigint): void {
  const cardIds = new Set(
    [...ctx.db.card.boardId.filter(boardId)].map((c) => c.id),
  );
  // situation_timer carries no boardId — match it by the verb card it targets.
  for (const tm of [...ctx.db.situationTimer.iter()])
    if (cardIds.has(tm.verbCardId))
      ctx.db.situationTimer.scheduledId.delete(tm.scheduledId);
  for (const s of [...ctx.db.situation.boardId.filter(boardId)])
    ctx.db.situation.cardId.delete(s.cardId);
  for (const c of [...ctx.db.card.boardId.filter(boardId)])
    ctx.db.card.id.delete(c.id);
  // card_history / achievement are iterate-and-filter (the by_board_* prefix
  // scans are unsafe under SDK 2.5.0 — see the my_* views for the same reason).
  for (const h of [...ctx.db.cardHistory.iter()])
    if (h.boardId === boardId) ctx.db.cardHistory.id.delete(h.id);
  for (const a of [...ctx.db.achievement.iter()])
    if (a.boardId === boardId) ctx.db.achievement.id.delete(a.id);
  for (const m of [...ctx.db.boardMember.boardId.filter(boardId)])
    ctx.db.boardMember.id.delete(m.id);
  ctx.db.board.id.delete(boardId);
}

export const deleteMyAccount = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);

  // Every board this user owns goes entirely (its membership rows go with it).
  // board has no index on `owner`, but a board count this small iterates cheaply.
  for (const b of [...ctx.db.board.iter()])
    if (b.owner === me.id) deleteBoardCascade(ctx, b.id);

  // Any membership that survived (a board owned by someone else) — drop just the
  // caller's seat, leaving that board and its other members untouched.
  for (const m of [...ctx.db.boardMember.userId.filter(me.id)])
    ctx.db.boardMember.id.delete(m.id);

  // Unlink every sign-in principal, then erase the profile itself.
  for (const id of [...ctx.db.identity.by_user.filter(me.id)])
    ctx.db.identity.id.delete(id.id);
  ctx.db.user.id.delete(me.id);
});

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
