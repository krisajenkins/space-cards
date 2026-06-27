import { DRONE_TICK } from "../content/durations";
import type { Ctx, Card, Effects, SlottedCard } from "../platform/types";
import {
  subsystems,
  researchTree,
  wreckContents,
  recipeSatisfied,
  type Recipe,
} from "../content/recipes";

// ──────────────────────────────────────────────────────────────────────────
// The verb API — the SHARED machinery every verb's behaviour is written against.
// A card's own resolver (in its content/cards/<id>.ts file) is a thin object
// built from these helpers; the generic, cross-card mechanism — the hole
// helpers, the powered-machine shape, the whole drone feeder, and the research /
// wreck / assembler cursors that read content/recipes.ts — lives here.
//
// This is the old engine/resolvers.ts with the per-verb RESOLVERS table removed:
// those entries now live one-per-file under content/cards/, and the RESOLVERS map
// is projected from them in content/cards/index.ts.
//
// We import the recipe getters from content/recipes.ts, which is a sink (it gets
// the card array injected, not imported), so this is a plain one-way edge — no
// import cycle. Still, only read a recipe getter INSIDE a function (at reducer
// time): the cards register themselves at module load, so a top-level read here
// could run before that and throw.
// ──────────────────────────────────────────────────────────────────────────

// Verb behaviour ("code per verb"): duration + resolution decided at runtime from
// whatever is in the holes. `resolve` also receives the verb card itself, so a
// hole-less verb (a drone) can still find its own id / board.
export type Resolver = {
  duration: (holes: SlottedCard[]) => bigint;
  resolve: (ctx: Ctx, holes: SlottedCard[], verb: Card) => Effects;
  // Optional readiness override, consulted by verbReady on top of the generic
  // "required holes filled" check. It's what lets one verb offer a CHOICE of
  // recipes, or gate a powered machine on having BOTH power and an input. Omit
  // for standard verbs.
  ready?: (ctx: Ctx, holes: SlottedCard[], verb: Card) => boolean;
};

export const NOOP: Effects = { consume: [], produce: [], again: false };

// ──────────────────────────────────────────────────────────────────────────
// Small hole helpers. A "hole" is a card slotted into a verb; we routinely ask
// what category it is, count a category, or take N ids of one to consume.
// ──────────────────────────────────────────────────────────────────────────
export function catOf(ctx: Ctx, card: Card): string {
  const d = ctx.db.cardDef.defId.find(card.defId);
  return d ? d.category : "";
}
export function count(ctx: Ctx, holes: SlottedCard[], cat: string): number {
  return holes.filter((h) => catOf(ctx, h) === cat).length;
}
export function take(
  ctx: Ctx,
  holes: SlottedCard[],
  cat: string,
  n: number,
): bigint[] {
  return holes
    .filter((h) => catOf(ctx, h) === cat)
    .slice(0, n)
    .map((h) => h.id);
}
export const hasPower = (holes: SlottedCard[]) =>
  holes.some((h) => h.defId === "power");

// How many cards of `defId` sit in a verb's own output tray. Lets a producer
// see what's piling up unconsumed and steer its next output accordingly.
export const trayCount = (ctx: Ctx, verb: Card, defId: string): number =>
  [...ctx.db.card.boardId.filter(verb.boardId)].filter(
    (c) =>
      c.defId === defId &&
      c.location.tag === "output" &&
      c.location.value.verbCardId === verb.id,
  ).length;

// The slotted INPUT cards — everything a verb actually consumes, excluding any
// drone sitting in its drone bay. Single-input stations (gatherers, the Printer)
// read `inputs(...)[0]`; without this filter a lone drone in the bay would be
// mistaken for the input and consumed.
export const inputs = (ctx: Ctx, holes: SlottedCard[]): SlottedCard[] =>
  holes.filter((h) => catOf(ctx, h) !== "drone");

// The worker in a machine's bay — an Effort (inert) or a mechanical drone (verb),
// both category "drone". `verbReady` already gates a bayed machine on having one,
// so resolvers just need to know how to treat it: a mechanical drone is KEPT and
// lets the machine re-fire continuously; an Effort is CONSUMED (one cycle, then
// the machine idles until you place fresh labour). `workerCost` returns the ids to
// consume (the Effort, or nothing for a drone); `workerIsDrone` is the re-fire flag.
export const theWorker = (
  ctx: Ctx,
  holes: SlottedCard[],
): SlottedCard | undefined => holes.find((h) => catOf(ctx, h) === "drone");
export function workerIsDrone(ctx: Ctx, holes: SlottedCard[]): boolean {
  const w = theWorker(ctx, holes);
  if (!w) return false;
  const d = ctx.db.cardDef.defId.find(w.defId);
  return !!d && d.isVerb;
}
export const workerCost = (ctx: Ctx, holes: SlottedCard[]): bigint[] => {
  const w = theWorker(ctx, holes);
  return w && !workerIsDrone(ctx, holes) ? [w.id] : [];
};

// A power-gated transformer: one Power + one `inputCat` card per cycle → one
// `output`. Re-fires while both are present; consuming the Power leaves the
// required power hole empty, so it idles the moment power runs out (the Power
// gate) and resumes when a Hauler — or the player — re-feeds it.
export function poweredOne(
  dur: bigint,
  inputCat: string,
  output: string,
): Resolver {
  return {
    duration: () => dur,
    // The worker is required by verbReady; here we just need power + the input.
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, inputCat) > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, inputCat, 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      return {
        consume: [...power, ...input, ...workerCost(ctx, holes)],
        produce: [output],
        again: workerIsDrone(ctx, holes),
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// The recipe DATA (BUILDS / SUBSYSTEMS / RESEARCH_TREE / WRECK_CONTENTS) is
// projected from the card array in ../content/recipes.ts. The code below READS
// those tables. recipeSatisfied is generic over a `count` helper, so we pass our
// local `count` (defined above) at each call site.
// ──────────────────────────────────────────────────────────────────────────
const subsystemSatisfied = (ctx: Ctx, holes: SlottedCard[], r: Recipe) =>
  recipeSatisfied(ctx, holes, r, count);

// ──────────────────────────────────────────────────────────────────────────
// Research bench logic. The RESEARCH_TREE data (which blueprint unlocks on which
// prerequisites) is projected in ../content/recipes.ts; the code that reads the
// board's lifetime card history to pick the next earned blueprint lives here.
// ──────────────────────────────────────────────────────────────────────────

// Has this exact card ever been created on the board? (Discovered blueprints are
// not offered again.) The full two-column key is the safe form of the index —
// see the my_card_history view note on the bare-prefix panic under SDK 2.5.0.
function discovered(ctx: Ctx, boardId: bigint, defId: string): boolean {
  const h = [...ctx.db.cardHistory.by_board_def.filter([boardId, defId])][0];
  return !!h && h.count > 0n;
}

// Lifetime count of every card in `category` ever created on the board. Iterate-
// and-filter (category isn't indexed; per-board history is small).
function histCategory(ctx: Ctx, boardId: bigint, category: string): bigint {
  let total = 0n;
  for (const h of ctx.db.cardHistory.iter()) {
    if (h.boardId !== boardId) continue;
    const d = ctx.db.cardDef.defId.find(h.defId);
    if (d && d.category === category) total += h.count;
  }
  return total;
}

// The blueprint the Research bench should hand over next: the first entry in
// priority order that the board has qualified for but not yet discovered. Null
// when there's nothing left to research (the `ready` hook then keeps the bench
// idle rather than spending Effort for nothing).
export function researchTarget(ctx: Ctx, boardId: bigint): string | null {
  for (const r of researchTree()) {
    const bp = `blueprint_${r.target}`;
    if (discovered(ctx, boardId, bp)) continue;
    // An explicit prerequisite ladder (the drone Marks): every listed blueprint
    // must already be discovered, so e.g. Mk IV is never offered before Mk III —
    // the category needs alone can be met out of order.
    if ((r.requires ?? []).some((req) => !discovered(ctx, boardId, req)))
      continue;
    // A drone `chore` SUMS the lifetime counts of its tier's output categories
    // and fires at the threshold ("3 tasks a drone of this Mk could've done"); a
    // machine `need` AND-checks ≥1 of each input category. Exactly one is set.
    const ok = r.chore
      ? r.chore.of.reduce(
          (sum, cat) => sum + histCategory(ctx, boardId, cat),
          0n,
        ) >= BigInt(r.chore.count)
      : Object.entries(r.need ?? {}).every(
          ([cat, n]) => histCategory(ctx, boardId, cat) >= BigInt(n),
        );
    if (ok) return bp;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Drones. A drone is a hole-less verb that lives in a machine's DRONE BAY (a
// slot with droneLevel > 0). Bound to that one host, every tick it tries to feed
// one of the host's empty INPUT holes by pulling a card the host accepts from the
// table or from any output tray — moving it straight in. Because each drone only
// ever feeds its own host, two drones never fight over the work the way roaming
// couriers did. Most bays take a blind feeder; the Assembler is the one host that
// needs intent (it picks its own recipe), so a Mk IV there runs a targeted variant
// — see assemblerDroneMove. This single behaviour subsumes the old catalyst +
// courier shapes.
// ──────────────────────────────────────────────────────────────────────────

// The first card on the board this host could take in `accepts`. Prefers loose
// tabletop cards over ones sitting in an output tray: two passes, tabletop first,
// outputs only as a fallback. Never a verb card (a dormant machine/drone waiting
// to be planted) — only resources.
function firstLoot(ctx: Ctx, boardId: bigint, accepts: string[]): Card | null {
  const acceptable = (c: Card): boolean => {
    const def = ctx.db.cardDef.defId.find(c.defId);
    if (!def || def.isVerb) return false;
    return accepts.includes(c.defId) || accepts.includes(def.category);
  };
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag === "tabletop" && acceptable(c)) return c;
  }
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag === "output" && acceptable(c)) return c;
  }
  return null;
}

// One drone move: shuttle `cardId` from wherever it sits into the host's hole at
// `slotIndex`. `again: true` keeps the drone ticking; completeSituation's generic
// `moves` handling does the relocation and its side-effects (un-stalling the
// source tray, autostarting the host once the hole is filled).
function feedMove(cardId: bigint, hostId: bigint, slotIndex: number): Effects {
  return {
    consume: [],
    produce: [],
    again: true,
    moves: [
      {
        cardId,
        to: { tag: "slotted", value: { verbCardId: hostId, slotIndex } },
      },
    ],
  };
}

// The host's currently-slotted cards (its filled holes + the drone in its bay).
function hostHoles(ctx: Ctx, hostId: bigint, boardId: bigint): SlottedCard[] {
  return [...ctx.db.card.boardId.filter(boardId)].filter(
    (c): c is SlottedCard =>
      c.location.tag === "slotted" && c.location.value.verbCardId === hostId,
  );
}

// The drone's SINGLE source of truth: the next feed move for a drone (`verb`)
// sitting in some host's bay, or `null` when it has no work right now (not bayed,
// host not running, every input hole already full, or no loot to fetch). BOTH the
// `ready` hook and `resolve` below call this, so readiness and action can never
// disagree — `ready` reporting "yes" while `resolve` does nothing would spin the
// drone forever; the inverse would strand it. Keeping one function for both rules
// that out by construction, which is what makes the event-driven wake reliable.
//
// A drone with no move parks (resolve returns `again:false` → assembling, no
// timer); it is re-woken only when wakeBayDrones (engine.ts) re-checks it after a
// reducer changed the board. The relocation + side-effects (un-stalling the source
// tray, autostarting the host) are run by completeSituation's `moves` handling.
function nextDroneMove(ctx: Ctx, verb: Card): Effects | null {
  // Only a drone slotted into a live machine works; on the table (no host) it
  // falls dormant until it's dropped into a bay. A live host is one ON the table
  // OR HOUSED in a warehouse — housing is pure layout relief, the machine keeps
  // producing inside its warehouse, so its bay drone must keep feeding it. (A host
  // that is itself slotted/output isn't a running machine, so the drone idles.)
  if (verb.location.tag !== "slotted") return null;
  const host = ctx.db.card.id.find(verb.location.value.verbCardId);
  if (!host) return null;
  if (host.location.tag !== "tabletop" && host.location.tag !== "housed")
    return null;

  // The Assembler is a CHOICE machine: a blind feed would load whatever's lying
  // around and build a random (or already-owned) subsystem. A Mk IV drone there
  // instead targets the subsystems we still need — see assemblerDroneMove.
  if (host.defId === "assembler") return assemblerDroneMove(ctx, host);

  const holes = hostHoles(ctx, host.id, host.boardId);
  // The Workbench keeps its hands off until you've chosen a blueprint: no pulling
  // Components in for a build you haven't committed to. (You always pick the
  // blueprint — the feeder skips the blueprint hole itself; this just makes the
  // drone wait for one to appear before it bothers loading anything.)
  if (
    host.defId === "workbench" &&
    !holes.some((c) => catOf(ctx, c) === "blueprint")
  )
    return null;
  const filled = new Set(holes.map((c) => c.location.value.slotIndex));
  // Input holes only (droneLevel 0); never the bay itself. Also never a blueprint
  // hole: a Mk I+ drone may crank the Workbench and load its Components, but choosing
  // WHAT to build stays a player decision — the drone never grabs a blueprint. (The
  // Workbench is the only machine with a blueprint hole; the Assembler choice is
  // handled separately by assemblerDroneMove above.)
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0 && !s.accepts.includes("blueprint"))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  for (const sl of slots) {
    if (filled.has(sl.slotIndex)) continue;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    if (!loot) continue;
    return feedMove(loot.id, host.id, sl.slotIndex);
  }
  return null; // nothing to feed right now — the drone parks until woken
}

// Does the board already hold a card of `defId` (anywhere — table, tray, or
// slotted)? Used both to decide which rocket subsystems the Assembler drone still
// owes us (the Rocket wants one of each) and to gate the Wreck's salvaged machines
// (you only pull a Printer/Workbench while you don't already have one).
export function boardHas(ctx: Ctx, boardId: bigint, defId: string): boolean {
  for (const c of ctx.db.card.boardId.filter(boardId))
    if (c.defId === defId) return true;
  return false;
}

// The Wreck's manifest (WRECK_CONTENTS) — the fixed list of what the crash
// buried — is projected from the Wreck card in ../content/recipes.ts; the cursor
// logic that draws from it (below) is behaviour and stays here.

// Lifetime count of one defId created on this board (the full two-column key — the
// bare-prefix form panics; see the discovered() note). Only the Wreck ever makes
// any of its manifest cards, so the sum of these counts is exactly how many items
// it has handed out — our cursor into WRECK_CONTENTS.
function histDef(ctx: Ctx, boardId: bigint, defId: string): bigint {
  const h = [...ctx.db.cardHistory.by_board_def.filter([boardId, defId])][0];
  return h ? h.count : 0n;
}

// What the Wreck yields this scavenge — the next manifest item, or `null` once the
// list is exhausted (the resolver then collapses it into an Exhausted Wreck husk).
export function wreckDrop(ctx: Ctx, boardId: bigint): string | null {
  const manifest = wreckContents();
  let drawn = 0;
  for (const defId of new Set(manifest))
    drawn += Number(histDef(ctx, boardId, defId));
  return manifest[drawn] ?? null;
}

// The next subsystem a Mk IV Assembler drone should build: the first recipe whose
// output we don't already have. Null once we hold all five (the drone then idles).
function nextSubsystem(ctx: Ctx, boardId: bigint): Recipe | null {
  for (const r of subsystems()) if (!boardHas(ctx, boardId, r.output)) return r;
  return null;
}

// What the Assembler will actually build from what's loaded: the first recipe
// that is both satisfied by the holes AND not already on the board. The second
// clause makes every rocket part a SINGLETON. The Mk IV drone already won't LOAD
// a duplicate (nextSubsystem), but gating the MACHINE here also stops a player
// hand-loading a second Hull — the part is unique no matter who feeds it. (boardHas,
// not lifetime history: a subsystem only ever leaves the board by flying into the
// Rocket, which is terminal, so "on the board now" and "ever made" coincide for
// these — and boardHas keeps the documented rebuild-if-spent path intact.)
export function chosenSubsystem(
  ctx: Ctx,
  holes: SlottedCard[],
  boardId: bigint,
): Recipe | null {
  return (
    subsystems().find(
      (r) =>
        subsystemSatisfied(ctx, holes, r) && !boardHas(ctx, boardId, r.output),
    ) ?? null
  );
}

// A Mk IV drone in the Assembler's bay. Unlike a generic feeder it can't just
// shovel parts in — the Assembler picks its recipe from whatever's loaded, so a
// blind drone would build duplicates or whatever happens to match first. Instead
// it chooses a subsystem we don't have yet and loads EXACTLY that recipe (plus
// Power), one card per tick; the Assembler's most-specific-first matcher then
// resolves to precisely that part. Returns `null` (the drone parks) once the board
// holds all five subsystems; when one is later spent (flown into the Rocket) the
// wake after that consume re-checks it and it picks the rebuild back up.
function assemblerDroneMove(ctx: Ctx, host: Card): Effects | null {
  const holes = hostHoles(ctx, host.id, host.boardId);
  const filled = new Set(holes.map((c) => c.location.value.slotIndex));
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const feedInto = (cat: string): Effects | null => {
    const sl = slots.find(
      (s) => !filled.has(s.slotIndex) && s.accepts.includes(cat),
    );
    if (!sl) return null;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    return loot ? feedMove(loot.id, host.id, sl.slotIndex) : null;
  };

  // Power first — the Assembler stalls without it (and every recipe needs one).
  if (!hasPower(holes)) return feedInto("power");

  const target = nextSubsystem(ctx, host.boardId);
  if (!target) return null; // we already hold all five subsystems — park

  // Top each recipe category up to its required count, one card per tick. We feed
  // ONLY the categories this recipe lists, so the holes never satisfy a different
  // (more-specific) recipe by accident.
  for (const [cat, n] of Object.entries(target.need)) {
    if (count(ctx, holes, cat) >= n) continue;
    const move = feedInto(cat);
    if (move) return move;
  }
  return null; // recipe fully loaded (or nothing to fetch) — let the Assembler fire
}

// The shared drone behaviour (all four Marks). `ready` and `resolve` both go
// through nextDroneMove so they can never disagree; `resolve` parks the drone
// (again:false) when there's no move, leaving it to wakeBayDrones to re-fire.
export const droneResolver: Resolver = {
  duration: () => DRONE_TICK,
  ready: (ctx, _h, verb) => nextDroneMove(ctx, verb) !== null,
  resolve: (ctx, _h, verb) => nextDroneMove(ctx, verb) ?? NOOP,
};
