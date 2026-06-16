import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "./schema";
import { holeCards, maybeAutostart, spawnCard, tryBeginRun } from "./engine";
import { requireCaller, requireMember } from "./auth";

// ──────────────────────────────────────────────────────────────────────────
// Reducers
// ──────────────────────────────────────────────────────────────────────────

// Start a fresh board for the caller, seeded with You + Forest + Market + Health.
export const newGame = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  const b = ctx.db.board.insert({
    id: 0n,
    name: "New Game",
    owner: me.id,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    userId: me.id,
    role: "player",
  });
  // Lay the opening table out with room to breathe — the verb cards are wide
  // (trays, sockets), so these are spaced for their real footprints: the three
  // machines along the top, the starting Health beneath You (its source), and
  // the broad Agency in the bottom-left.
  spawnCard(ctx, b.id, "you", 40, 40);
  spawnCard(ctx, b.id, "forest", 360, 40);
  spawnCard(ctx, b.id, "market", 660, 40);
  spawnCard(ctx, b.id, "agency", 40, 480);
  spawnCard(ctx, b.id, "health", 40, 300);
  spawnCard(ctx, b.id, "health", 150, 300);
  spawnCard(ctx, b.id, "health", 260, 300);
});

// Shared gate for slotting card `c` into verb `verb`'s hole `slotIndex`: the
// verb must exist, the hole must exist, accept the card, and be empty. Throws a
// SenderError on any failure. Source-location rules are the caller's to enforce
// (slotCard wants a tabletop card; collectAndSlot allows any source).
//
// Note we DON'T require the verb to be idle: you can top up an empty hole while
// the verb is mid-run, which is what makes the Market an inbox queue (drop more
// wood while it sells). Single-hole verbs are still effectively locked while
// running — their one hole is occupied, so the "hole already filled" check below
// rejects the drop anyway.
function assertSlottable(ctx: any, c: any, verb: any, slotIndex: number): void {
  if (c.boardId !== verb.boardId)
    throw new SenderError("cards are on different boards");
  const def = ctx.db.cardDef.defId.find(verb.defId);
  if (!def || !def.isVerb) throw new SenderError("target is not a verb");
  const s = ctx.db.situation.cardId.find(verb.id);
  if (!s) throw new SenderError("target is not a verb");

  const slot = [...ctx.db.slotDef.defId.filter(verb.defId)].find(
    (sl: any) => sl.slotIndex === slotIndex,
  );
  if (!slot) throw new SenderError("no such hole");
  const cdef = ctx.db.cardDef.defId.find(c.defId);
  const cat = cdef ? cdef.category : "";
  if (!slot.accepts.includes(c.defId) && !slot.accepts.includes(cat))
    throw new SenderError("that card is not accepted here");
  if (
    holeCards(ctx, verb.id).some(
      (h: any) => h.location.value.slotIndex === slotIndex,
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
      if (src && src.state !== "assembling")
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
      if (src && src.state === "stalled")
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
      if (s && s.state !== "assembling") {
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
      if (s && s.state === "stalled") tryBeginRun(ctx, v);
    }

    // Planting: a card just placed on the table may now begin (a no-hole verb
    // like a Seed starts growing the moment it's on the tabletop). Inert cards
    // and verbs with unfilled holes are no-ops inside maybeAutostart.
    maybeAutostart(ctx, cardId);
  },
);
