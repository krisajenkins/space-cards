import { ScheduleAt, Timestamp } from "spacetimedb";
import { MINUTE } from "./constants";
import { RESOLVERS } from "./resolvers";
import { awardAchievements } from "./achievements";
import type { Ctx, Card, SlottedCard } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Engine helpers
// ──────────────────────────────────────────────────────────────────────────
export function holeCards(ctx: Ctx, verbCardId: bigint): SlottedCard[] {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return [];
  return [...ctx.db.card.boardId.filter(verb.boardId)]
    .filter(
      (c): c is SlottedCard =>
        c.location.tag === "slotted" &&
        c.location.value.verbCardId === verbCardId,
    )
    .sort((a, b) => a.location.value.slotIndex - b.location.value.slotIndex);
}

export function outputCount(ctx: Ctx, verbCardId: bigint): number {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return 0;
  return [...ctx.db.card.boardId.filter(verb.boardId)].filter(
    (c) =>
      c.location.tag === "output" && c.location.value.verbCardId === verbCardId,
  ).length;
}

// A verb is ready to run when every required hole is filled AND — if it has any
// holes at all — at least one of them is filled. The second clause is what lets
// a hole-less verb (the Survivor, a drone) fire while self-contained, yet
// stops a verb with optional holes from firing on nothing: a Refinery's raw
// inbox holes are all optional, so it fires whenever raw is waiting and drains
// the queue one per cycle, but sits idle when empty.
export function verbReady(ctx: Ctx, verbCardId: bigint): boolean {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return false;
  const allSlots = [...ctx.db.slotDef.defId.filter(verb.defId)];
  // A drone bay (droneLevel > 0) holds the machine's WORKER, not a consumed input.
  // Every machine that HAS a bay needs that bay occupied to run (Effort or a
  // drone) — emitters (no bay) self-run. Material inputs are the droneLevel-0
  // slots; the bay is excluded from the input checks but required on its own.
  const baySet = new Set(
    allSlots.filter((s) => s.droneLevel > 0).map((s) => s.slotIndex),
  );
  const inputSlots = allSlots.filter((s) => s.droneLevel === 0);
  const allHoles = holeCards(ctx, verbCardId);
  if (
    baySet.size > 0 &&
    !allHoles.some((h) => baySet.has(h.location.value.slotIndex))
  )
    return false; // a bayed machine with no worker is idle
  const inputHoles = allHoles.filter(
    (h) => !baySet.has(h.location.value.slotIndex),
  );
  const filled = new Set(inputHoles.map((h) => h.location.value.slotIndex));
  const requiredFilled = inputSlots
    .filter((s) => s.required)
    .every((s) => filled.has(s.slotIndex));
  if (!requiredFilled) return false;
  if (inputSlots.length > 0 && inputHoles.length === 0) return false; // has input holes, none filled
  // A verb may impose readiness the per-hole `required` flag can't express — an
  // Agency that fires on EITHER of two complete recipes, say. Its `ready` hook
  // has the final say and sees ALL holes (the worker bay included).
  const r = RESOLVERS[verb.defId];
  if (r?.ready && !r.ready(ctx, allHoles, verb)) return false;
  return true;
}

// Begin (or re-begin) a run, unless the output tray is full → then stall.
export function tryBeginRun(ctx: Ctx, verbCardId: bigint): void {
  const s = ctx.db.situation.cardId.find(verbCardId);
  const verb = ctx.db.card.id.find(verbCardId);
  if (!s || !verb) return;
  const def = ctx.db.cardDef.defId.find(verb.defId);
  const cap = def ? def.outputCap : 0;
  if (cap > 0 && outputCount(ctx, verbCardId) >= cap) {
    ctx.db.situation.cardId.update({
      ...s,
      state: { tag: "stalled" },
      endsAt: undefined,
    });
    return;
  }
  const r = RESOLVERS[verb.defId];
  const dur = r ? r.duration(holeCards(ctx, verbCardId)) : MINUTE;
  const endMicros = ctx.timestamp.microsSinceUnixEpoch + dur;
  ctx.db.situation.cardId.update({
    ...s,
    state: { tag: "ongoing" },
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
export function maybeAutostart(ctx: Ctx, verbCardId: bigint): void {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return;
  // A verb runs on the tabletop (the "grows once planted" gate) — with ONE
  // exception: a drone runs while slotted in a machine's bay, that being exactly
  // where it does its work. A drone on the table has no host and stays dormant.
  const def = ctx.db.cardDef.defId.find(verb.defId);
  const baseDrone = !!def && def.category === "drone";
  const runnable =
    verb.location.tag === "tabletop" ||
    (verb.location.tag === "slotted" && baseDrone);
  if (!runnable) return;
  const s = ctx.db.situation.cardId.find(verbCardId);
  if (!s || s.state.tag !== "assembling") return;
  if (verbReady(ctx, verbCardId)) tryBeginRun(ctx, verbCardId);
}

// Record one more of `defId` being created on this board. Called from the two
// birth sites below, so every card that ever exists is counted exactly once.
// See card_history (schema.ts) and the my_card_history view.
export function tally(ctx: Ctx, boardId: bigint, defId: string): void {
  const existing = [
    ...ctx.db.cardHistory.by_board_def.filter([boardId, defId]),
  ][0];
  if (existing) {
    ctx.db.cardHistory.id.update({ ...existing, count: existing.count + 1n });
  } else {
    ctx.db.cardHistory.insert({ id: 0n, boardId, defId, count: 1n });
  }
  // History just changed — re-check milestones that key off it.
  awardAchievements(ctx, boardId);
  // …and nudge any idle Research bench. Research keys off this history rather than
  // its own holes, so a worker parked in its bay won't notice a freshly-met
  // prerequisite on its own — without this, you'd have to lift the Effort out and
  // drop it back to make it fire. maybeAutostart no-ops unless the bench is on the
  // table, idle, has a worker, AND now has something to learn, so it's cheap.
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.defId === "research" && c.location.tag === "tabletop")
      maybeAutostart(ctx, c.id);
  }
}

export function spawnCard(
  ctx: Ctx,
  boardId: bigint,
  defId: string,
  x: number,
  y: number,
): Card {
  const def = ctx.db.cardDef.defId.find(defId);
  tally(ctx, boardId, defId);
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
      state: { tag: "assembling" },
      endsAt: undefined,
    });
    maybeAutostart(ctx, c.id);
  }
  return c;
}

export function spawnOutput(
  ctx: Ctx,
  boardId: bigint,
  defId: string,
  verbCardId: bigint,
): void {
  tally(ctx, boardId, defId);
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
      state: { tag: "assembling" },
      endsAt: undefined,
    });
  }
}
