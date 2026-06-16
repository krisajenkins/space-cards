import { ScheduleAt, Timestamp } from "spacetimedb";
import { MINUTE } from "./constants";
import { RESOLVERS } from "./resolvers";

// ──────────────────────────────────────────────────────────────────────────
// Engine helpers
// ──────────────────────────────────────────────────────────────────────────
export function holeCards(ctx: any, verbCardId: bigint): any[] {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return [];
  return [...ctx.db.card.boardId.filter(verb.boardId)]
    .filter(
      (c: any) =>
        c.location.tag === "slotted" &&
        c.location.value.verbCardId === verbCardId,
    )
    .sort(
      (a: any, b: any) =>
        a.location.value.slotIndex - b.location.value.slotIndex,
    );
}

export function outputCount(ctx: any, verbCardId: bigint): number {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return 0;
  return [...ctx.db.card.boardId.filter(verb.boardId)].filter(
    (c: any) =>
      c.location.tag === "output" && c.location.value.verbCardId === verbCardId,
  ).length;
}

// A verb is ready to run when every required hole is filled AND — if it has any
// holes at all — at least one of them is filled. The second clause is what lets
// a hole-less verb (You, Seed) fire while self-contained, yet stops a verb with
// optional holes from firing on nothing: the Market's five wood holes are all
// optional, so it fires whenever any wood is waiting and drains the queue one
// per cycle, but sits idle when empty.
export function verbReady(ctx: any, verbCardId: bigint): boolean {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return false;
  const slots = [...ctx.db.slotDef.defId.filter(verb.defId)];
  const holes = holeCards(ctx, verbCardId);
  const filled = new Set(holes.map((h: any) => h.location.value.slotIndex));
  const requiredFilled = slots
    .filter((s: any) => s.required)
    .every((s: any) => filled.has(s.slotIndex));
  if (!requiredFilled) return false;
  if (slots.length > 0 && holes.length === 0) return false; // has holes, none filled
  return true;
}

// Begin (or re-begin) a run, unless the output tray is full → then stall.
export function tryBeginRun(ctx: any, verbCardId: bigint): void {
  const s = ctx.db.situation.cardId.find(verbCardId);
  const verb = ctx.db.card.id.find(verbCardId);
  if (!s || !verb) return;
  const def = ctx.db.cardDef.defId.find(verb.defId);
  const cap = def ? def.outputCap : 0;
  if (cap > 0 && outputCount(ctx, verbCardId) >= cap) {
    ctx.db.situation.cardId.update({
      ...s,
      state: "stalled",
      endsAt: undefined,
    });
    return;
  }
  const r = RESOLVERS[verb.defId];
  const dur = r ? r.duration(holeCards(ctx, verbCardId)) : MINUTE;
  const endMicros = ctx.timestamp.microsSinceUnixEpoch + dur;
  ctx.db.situation.cardId.update({
    ...s,
    state: "ongoing",
    endsAt: new Timestamp(endMicros),
  });
  ctx.db.situationTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(endMicros),
    verbCardId,
  });
}

// A verb begins a run only when it is idle (assembling) AND on the tabletop.
// The tabletop gate is what makes "grows once planted" work: a no-hole verb
// like a Seed won't run while it sits in an output tray, and repositioning an
// already-running card is a no-op rather than a double-fire.
export function maybeAutostart(ctx: any, verbCardId: bigint): void {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb || verb.location.tag !== "tabletop") return;
  const s = ctx.db.situation.cardId.find(verbCardId);
  if (!s || s.state !== "assembling") return;
  if (verbReady(ctx, verbCardId)) tryBeginRun(ctx, verbCardId);
}

export function spawnCard(
  ctx: any,
  boardId: bigint,
  defId: string,
  x: number,
  y: number,
): any {
  const def = ctx.db.cardDef.defId.find(defId);
  const c = ctx.db.card.insert({
    id: 0n,
    boardId,
    defId,
    location: { tag: "tabletop", value: { x, y } },
  });
  if (def && def.isVerb) {
    ctx.db.situation.insert({
      cardId: c.id,
      boardId,
      state: "assembling",
      endsAt: undefined,
    });
    maybeAutostart(ctx, c.id);
  }
  return c;
}

export function spawnOutput(
  ctx: any,
  boardId: bigint,
  defId: string,
  verbCardId: bigint,
): void {
  const c = ctx.db.card.insert({
    id: 0n,
    boardId,
    defId,
    location: { tag: "output", value: { verbCardId } },
  });
  // A verb produced into a tray (e.g. a Seed) gets run-state like any verb, but
  // we do NOT autostart it: it isn't on the tabletop, so it can't run yet. It
  // begins when the player collects it onto the table — see moveCard.
  const def = ctx.db.cardDef.defId.find(defId);
  if (def && def.isVerb) {
    ctx.db.situation.insert({
      cardId: c.id,
      boardId,
      state: "assembling",
      endsAt: undefined,
    });
  }
}
