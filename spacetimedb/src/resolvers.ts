import {
  DRONE_TICK,
  EFFORT,
  SOLAR,
  GATHER,
  PRINT,
  BUILD,
  RESEARCH,
  REFINE,
  FABRICATE,
  KILN,
  ELECTRONICS,
  MINE_ICE,
  ELECTROLYSIS,
  CHEM,
  ASSEMBLE,
  LAUNCH,
} from "./constants";
import type { Ctx, Card, Effects, SlottedCard } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes. `resolve` also receives the verb card itself,
// so a hole-less verb (a drone) can still find its own id / board.
// ──────────────────────────────────────────────────────────────────────────
export type Resolver = {
  duration: (holes: SlottedCard[]) => bigint;
  resolve: (ctx: Ctx, holes: SlottedCard[], verb: Card) => Effects;
  // Optional readiness override, consulted by verbReady on top of the generic
  // "required holes filled" check. It's what lets one verb offer a CHOICE of
  // recipes, or gate a powered machine on having BOTH power and an input. Omit
  // for standard verbs.
  ready?: (ctx: Ctx, holes: SlottedCard[], verb: Card) => boolean;
};

const NOOP: Effects = { consume: [], produce: [], again: false };

// ──────────────────────────────────────────────────────────────────────────
// Small hole helpers. A "hole" is a card slotted into a verb; we routinely ask
// what category it is, count a category, or take N ids of one to consume.
// ──────────────────────────────────────────────────────────────────────────
function catOf(ctx: Ctx, card: Card): string {
  const d = ctx.db.cardDef.defId.find(card.defId);
  return d ? d.category : "";
}
function count(ctx: Ctx, holes: SlottedCard[], cat: string): number {
  return holes.filter((h) => catOf(ctx, h) === cat).length;
}
function take(
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
const hasPower = (holes: SlottedCard[]) =>
  holes.some((h) => h.defId === "power");

// The slotted INPUT cards — everything a verb actually consumes, excluding any
// drone sitting in its drone bay. Single-input stations (gatherers, the Printer)
// read `inputs(...)[0]`; without this filter a lone drone in the bay would be
// mistaken for the input and consumed.
const inputs = (ctx: Ctx, holes: SlottedCard[]): SlottedCard[] =>
  holes.filter((h) => catOf(ctx, h) !== "drone");

// The worker in a machine's bay — an Effort (inert) or a mechanical drone (verb),
// both category "drone". `verbReady` already gates a bayed machine on having one,
// so resolvers just need to know how to treat it: a mechanical drone is KEPT and
// lets the machine re-fire continuously; an Effort is CONSUMED (one cycle, then
// the machine idles until you place fresh labour). `workerCost` returns the ids to
// consume (the Effort, or nothing for a drone); `workerIsDrone` is the re-fire flag.
const theWorker = (ctx: Ctx, holes: SlottedCard[]): SlottedCard | undefined =>
  holes.find((h) => catOf(ctx, h) === "drone");
function workerIsDrone(ctx: Ctx, holes: SlottedCard[]): boolean {
  const w = theWorker(ctx, holes);
  if (!w) return false;
  const d = ctx.db.cardDef.defId.find(w.defId);
  return !!d && d.isVerb;
}
const workerCost = (ctx: Ctx, holes: SlottedCard[]): bigint[] => {
  const w = theWorker(ctx, holes);
  return w && !workerIsDrone(ctx, holes) ? [w.id] : [];
};

// A power-gated transformer: one Power + one `inputCat` card per cycle → one
// `output`. Re-fires while both are present; consuming the Power leaves the
// required power hole empty, so it idles the moment power runs out (the Power
// gate) and resumes when a Hauler — or the player — re-feeds it.
function poweredOne(dur: bigint, inputCat: string, output: string): Resolver {
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
// Construction. A Blueprint card's defId is the unambiguous selector for what
// the Workshop builds — no fragile count-matching. Blueprints are seeded as
// "salvaged manuals" (newGame), so every machine is reachable; the TECH-TREE
// ORDER is enforced by the resource graph (you can't build a Subsystem without
// an Assembler + components + power), not by gating the manuals.
// ──────────────────────────────────────────────────────────────────────────
// `keep` marks a blueprint the Workshop hands back on completion (produced into
// the tray alongside the build) instead of consuming. Drones are deliberately
// reusable — you'll want a whole fleet — so a drone blueprint is a permanent
// manual, not a one-shot. The Solar Array is kept for the same reason: Power is
// the spine of the whole game, you scale it by building more arrays, so its
// manual stays permanent. Other machine blueprints are one-and-done.
type Build = { output: string; cost: number; keep?: boolean }; // cost = Components consumed
const BUILDS: Record<string, Build> = {
  // Machines
  blueprint_solar: { output: "solar_array", cost: 2, keep: true },
  blueprint_refinery: { output: "refinery", cost: 3 },
  blueprint_fabricator: { output: "fabricator", cost: 3 },
  blueprint_kiln: { output: "kiln", cost: 3 },
  blueprint_electronics_fab: { output: "electronics_fab", cost: 4 },
  blueprint_ice_mine: { output: "ice_mine", cost: 3 },
  blueprint_electrolysis: { output: "electrolysis", cost: 4 },
  blueprint_chem_reactor: { output: "chem_reactor", cost: 5 },
  blueprint_assembler: { output: "assembler", cost: 5 },
  blueprint_rocket: { output: "rocket", cost: 6 },
  // Drones (the automation layer — built the same way, but the blueprint is kept
  // so the player can build a whole fleet from one manual). Cost rises with the
  // Mk so automating a higher tier is a bigger investment.
  blueprint_drone_1: { output: "drone_1", cost: 2, keep: true },
  blueprint_drone_2: { output: "drone_2", cost: 3, keep: true },
  blueprint_drone_3: { output: "drone_3", cost: 4, keep: true },
  blueprint_drone_4: { output: "drone_4", cost: 5, keep: true },
};

// Rocket subsystems. The Assembler offers a CHOICE of recipes (Agency-style
// `ready` hook): load the ingredients for the subsystem you want. Checked
// most-specific-first so an overlapping load (e.g. 5 components) resolves
// deterministically. Every recipe also costs one Power (handled in resolve).
type Recipe = { output: string; need: Record<string, number> };
const SUBSYSTEMS: Recipe[] = [
  { output: "life_support", need: { component: 2, circuit: 1, water: 1 } },
  { output: "heat_shield", need: { component: 3, glass: 2 } },
  { output: "avionics", need: { circuit: 4 } },
  { output: "engine", need: { component: 4, circuit: 1 } },
  { output: "hull", need: { component: 5 } },
];
const recipeSatisfied = (ctx: Ctx, holes: SlottedCard[], r: Recipe) =>
  Object.entries(r.need).every(([cat, n]) => count(ctx, holes, cat) >= n);

// ──────────────────────────────────────────────────────────────────────────
// Research. Blueprints no longer all appear at the start — you EARN each one at
// the Research bench (one Effort → the next blueprint you've qualified for). Two
// unlock rules, both read off the board's lifetime card history (the same tally
// that powers achievements), so "what you've discovered" gates "what you can
// research" — exactly the resource-graph gating the seeded model used, now made
// explicit:
//   • a MACHINE blueprint unlocks once you've created ≥1 of EACH input category
//     its machine consumes (so you must have discovered the inputs first; the
//     tech-tree order falls straight out of the dependency graph). One-of-each,
//     not the full recipe — you still build it at the Workshop afterwards.
//   • a DRONE blueprint unlocks once you've done that tier's manual chore ≥3
//     times (created ≥3 of a representative tier output) — the §2 "automate the
//     work you've outgrown" rhythm.
// The needs are CATEGORIES, summed over every defId in the category (so "raw"
// counts Regolith + Scrap, "component" counts Salvage too). Easy to re-tune.
type Research = { target: string; need: Record<string, number> };
const RESEARCH_TREE: Research[] = [
  // Automate gathering FIRST. Per §2 the reward is retiring the chore you're
  // sick of doing by hand — and a Mk I drone (gatherers + Printer) is the first
  // genuinely useful thing to unlock, well before you need Power. So drone_1
  // outranks the Solar Array: as soon as you've worked the gatherers a few times
  // (raw ≥ 3), this is what Research hands you.
  { target: "drone_1", need: { raw: 3 } },
  // Then Power — the spine that opens every big machine.
  { target: "solar", need: { component: 1 } },
  // The smelting line: refine raw → Metal, fabricate Metal → Component.
  { target: "refinery", need: { raw: 1, power: 1 } },
  { target: "fabricator", need: { metal: 1, power: 1 } },
  { target: "kiln", need: { raw: 1, power: 1 } },
  { target: "drone_2", need: { metal: 3 } },
  // Electronics + chemistry sub-trees.
  { target: "ice_mine", need: { power: 1 } },
  { target: "electronics_fab", need: { silicon: 1, power: 1 } },
  { target: "electrolysis", need: { water: 1, power: 1 } },
  { target: "drone_3", need: { circuit: 3 } },
  { target: "chem_reactor", need: { hydrogen: 1, oxygen: 1, power: 1 } },
  // Assembly + liftoff.
  {
    target: "assembler",
    need: { component: 1, circuit: 1, glass: 1, water: 1 },
  },
  { target: "rocket", need: { subsystem: 1, fuel: 1 } },
  { target: "drone_4", need: { fuel: 3 } },
];

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
function researchTarget(ctx: Ctx, boardId: bigint): string | null {
  for (const r of RESEARCH_TREE) {
    const bp = `blueprint_${r.target}`;
    if (discovered(ctx, boardId, bp)) continue;
    const ok = Object.entries(r.need).every(
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
// — see assemblerDroneResolve. This single behaviour subsumes the old catalyst +
// courier shapes.
// ──────────────────────────────────────────────────────────────────────────

// The first card on the board this host could take in `accepts`: a loose tabletop
// card or one sitting in any output tray. Never a verb card (a dormant
// machine/drone waiting to be planted) — only resources.
function firstLoot(ctx: Ctx, boardId: bigint, accepts: string[]): Card | null {
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag !== "tabletop" && c.location.tag !== "output") continue;
    const def = ctx.db.cardDef.defId.find(c.defId);
    if (!def || def.isVerb) continue;
    if (accepts.includes(c.defId) || accepts.includes(def.category)) return c;
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

// One service tick for a drone (`verb`) sitting in some host's bay: find the
// host's first empty input hole and a card to drop into it. The actual relocation
// + its side-effects (un-stalling the source tray, autostarting the host) are run
// by completeSituation's generic `moves` handling.
function droneResolve(ctx: Ctx, verb: Card): Effects {
  const idle: Effects = { consume: [], produce: [], again: false };
  const tick: Effects = { consume: [], produce: [], again: true };
  // Only a drone slotted into a live tabletop machine works; on the table (no
  // host) it falls dormant until it's dropped into a bay.
  if (verb.location.tag !== "slotted") return idle;
  const host = ctx.db.card.id.find(verb.location.value.verbCardId);
  if (!host || host.location.tag !== "tabletop") return idle;

  // The Assembler is a CHOICE machine: a blind feed would load whatever's lying
  // around and build a random (or already-owned) subsystem. A Mk IV drone there
  // instead targets the subsystems we still need — see assemblerDroneResolve.
  if (host.defId === "assembler") return assemblerDroneResolve(ctx, host);

  const filled = new Set(
    hostHoles(ctx, host.id, host.boardId).map(
      (c) => c.location.value.slotIndex,
    ),
  );
  // Input holes only (droneLevel 0); never the bay itself.
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  for (const sl of slots) {
    if (filled.has(sl.slotIndex)) continue;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    if (!loot) continue;
    return feedMove(loot.id, host.id, sl.slotIndex);
  }
  return tick; // nothing to feed right now — keep watching
}

// Does the board already hold a card of `defId` (anywhere — table, tray, or
// slotted)? Used to decide which rocket subsystems the Assembler drone still
// owes us: the Rocket wants exactly one of each.
function boardHas(ctx: Ctx, boardId: bigint, defId: string): boolean {
  for (const c of ctx.db.card.boardId.filter(boardId))
    if (c.defId === defId) return true;
  return false;
}

// The next subsystem a Mk IV Assembler drone should build: the first recipe whose
// output we don't already have. Null once we hold all five (the drone then idles).
function nextSubsystem(ctx: Ctx, boardId: bigint): Recipe | null {
  for (const r of SUBSYSTEMS) if (!boardHas(ctx, boardId, r.output)) return r;
  return null;
}

// A Mk IV drone in the Assembler's bay. Unlike a generic feeder it can't just
// shovel parts in — the Assembler picks its recipe from whatever's loaded, so a
// blind drone would build duplicates or whatever happens to match first. Instead
// it chooses a subsystem we don't have yet and loads EXACTLY that recipe (plus
// Power), one card per tick; the Assembler's most-specific-first matcher then
// resolves to precisely that part. Goes quiet (an idle heartbeat) once the board
// holds all five subsystems, and picks back up if one is later spent.
function assemblerDroneResolve(ctx: Ctx, host: Card): Effects {
  // Like every bayed drone, never stop the heartbeat while we have a host — return
  // `tick` (again: true) when there's nothing to do, so the drone resumes the
  // instant a subsystem is spent (e.g. flown into the Rocket) and needs rebuilding.
  const tick: Effects = { consume: [], produce: [], again: true };
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
  if (!hasPower(holes)) return feedInto("power") ?? tick;

  const target = nextSubsystem(ctx, host.boardId);
  if (!target) return tick; // we already hold all five subsystems — keep watching

  // Top each recipe category up to its required count, one card per tick. We feed
  // ONLY the categories this recipe lists, so the holes never satisfy a different
  // (more-specific) recipe by accident.
  for (const [cat, n] of Object.entries(target.need)) {
    if (count(ctx, holes, cat) >= n) continue;
    const move = feedInto(cat);
    if (move) return move;
  }
  return tick; // recipe fully loaded (or nothing to fetch) — let the Assembler fire
}

// ──────────────────────────────────────────────────────────────────────────
// The resolver table — one entry per verb defId.
// ──────────────────────────────────────────────────────────────────────────
export const RESOLVERS: Record<string, Resolver> = {
  // ── Tier 0: the crash site (hand-cranked, no power) ──────────────────────

  // Survivor: your own two hands. Emits one Effort per cycle, forever.
  survivor: {
    duration: () => EFFORT,
    resolve: () => ({ consume: [], produce: ["effort"], again: true }),
  },

  // Regolith Field: a labour machine with no material input — the worker IS the
  // input. A worker in the bay (required by verbReady) yields one Regolith;
  // Effort is spent (one gather), a mechanical drone keeps gathering.
  regolith_field: {
    duration: () => GATHER,
    resolve: (ctx, holes) => {
      if (!theWorker(ctx, holes)) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: ["regolith"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Wreck: the discovery node. Mostly Scrap; ~20% a Salvage (a ready-made part).
  // Effort scavenges once; a drone keeps it worked.
  wreck: {
    duration: () => GATHER,
    resolve: (ctx, holes) => {
      if (!theWorker(ctx, holes)) return NOOP;
      const drop = ctx.random() < 0.2 ? "salvage" : "scrap";
      return {
        consume: workerCost(ctx, holes),
        produce: [drop],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Printer: the crude bootstrap fabricator — raw → Component, no power, slow. An
  // inbox queue that drains one per cycle. `ready` guards against firing with a
  // worker but no raw (the raw holes are optional, so the generic check can't).
  printer: {
    duration: () => PRINT,
    ready: (ctx, holes) => inputs(ctx, holes).length > 0,
    resolve: (ctx, holes) => {
      const input = inputs(ctx, holes)[0];
      if (!input) return NOOP;
      return {
        consume: [input.id, ...workerCost(ctx, holes)],
        produce: ["component"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Workshop: hand-cranked constructor. Blueprint (selects the output) + enough
  // Components + an Effort worker in its bay → the machine/drone, dormant in the
  // tray to be planted. The bay is WORKER-only, so a drone can't auto-build — you
  // always pick the blueprint. Cranked by Effort (not Power): works from turn one.
  workshop: {
    duration: () => BUILD,
    ready: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const effort = holes.find((h) => h.defId === "effort");
      if (!bp || !effort) return false;
      const recipe = BUILDS[bp.defId];
      return !!recipe && count(ctx, holes, "component") >= recipe.cost;
    },
    resolve: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const effort = holes.find((h) => h.defId === "effort");
      if (!bp || !effort) return NOOP;
      const recipe = BUILDS[bp.defId];
      if (!recipe) return NOOP;
      const comps = take(ctx, holes, "component", recipe.cost);
      if (comps.length < recipe.cost) return NOOP;
      // A kept blueprint is consumed-and-reproduced: it lands back in the tray
      // for the player to re-slot, so the Workshop frees up for the next build.
      return {
        consume: [bp.id, effort.id, ...comps],
        produce: recipe.keep ? [recipe.output, bp.defId] : [recipe.output],
        again: false,
      };
    },
  },

  // Research: hand-cranked discovery bench. A WORKER-only bay (Effort, like the
  // Workshop) — one Effort yields the next blueprint you've earned (researchTarget
  // reads your card history). `ready` keeps it idle when nothing's left to learn,
  // so Effort is never spent for nothing. One blueprint per crank (Effort is no
  // drone → no re-fire), which paces discovery against your scarce early labour.
  research: {
    duration: () => RESEARCH,
    ready: (ctx, _holes, verb) => researchTarget(ctx, verb.boardId) !== null,
    resolve: (ctx, holes, verb) => {
      const target = researchTarget(ctx, verb.boardId);
      if (!target) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: [target],
        again: false,
      };
    },
  },

  // ── Power: the emitter that opens up every big machine ───────────────────
  solar_array: {
    duration: () => SOLAR,
    resolve: () => ({ consume: [], produce: ["power"], again: true }),
  },

  // ── Tier 1–3: power-gated production line ────────────────────────────────
  refinery: poweredOne(REFINE, "raw", "metal"),
  fabricator: poweredOne(FABRICATE, "metal", "component"),
  electronics_fab: poweredOne(ELECTRONICS, "silicon", "circuit"),

  // Kiln: raw → Silicon (or, 50% of the time, Glass). Powered.
  kiln: {
    duration: () => KILN,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, "raw") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, "raw", 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      const out = ctx.random() < 0.5 ? "silicon" : "glass";
      return {
        consume: [...power, ...input, ...workerCost(ctx, holes)],
        produce: [out],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Ice Mine: Power + a worker → Water (no material input besides Power).
  ice_mine: {
    duration: () => MINE_ICE,
    ready: (_ctx, holes) => hasPower(holes),
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      return {
        consume: [...power, ...workerCost(ctx, holes)],
        produce: ["water"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Electrolysis: Water + Power → Hydrogen + Oxygen.
  electrolysis: {
    duration: () => ELECTROLYSIS,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, "water") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const water = take(ctx, holes, "water", 1);
      if (power.length === 0 || water.length === 0) return NOOP;
      return {
        consume: [...power, ...water, ...workerCost(ctx, holes)],
        produce: ["hydrogen", "oxygen"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Chem Reactor: Hydrogen + Oxygen + Power → Fuel. The late bottleneck (slow,
  // and the only path to the Fuel the Rocket burns).
  chem_reactor: {
    duration: () => CHEM,
    ready: (ctx, holes) =>
      hasPower(holes) &&
      count(ctx, holes, "hydrogen") > 0 &&
      count(ctx, holes, "oxygen") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const h2 = take(ctx, holes, "hydrogen", 1);
      const o2 = take(ctx, holes, "oxygen", 1);
      if (power.length === 0 || h2.length === 0 || o2.length === 0) return NOOP;
      return {
        consume: [...power, ...h2, ...o2, ...workerCost(ctx, holes)],
        produce: ["fuel"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Assembler: components → a rocket Subsystem. Recipe choice (`ready` hook):
  // whichever subsystem's ingredients you've loaded, most-specific-first.
  assembler: {
    duration: () => ASSEMBLE,
    ready: (ctx, holes) =>
      hasPower(holes) && SUBSYSTEMS.some((r) => recipeSatisfied(ctx, holes, r)),
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      const recipe = SUBSYSTEMS.find((r) => recipeSatisfied(ctx, holes, r));
      if (!recipe) return NOOP;
      const consume = [...power, ...workerCost(ctx, holes)];
      for (const [cat, n] of Object.entries(recipe.need))
        consume.push(...take(ctx, holes, cat, n));
      return {
        consume,
        produce: [recipe.output],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // ── Liftoff ──────────────────────────────────────────────────────────────
  // Rocket: all five Subsystems + three Fuel (all required holes) → it fires
  // and metamorphoses into Escape where it stood. One-shot. You're home.
  rocket: {
    duration: () => LAUNCH,
    resolve: (ctx, holes) => ({
      // Consume the loaded craft (subsystems + fuel) plus an Effort worker if
      // that's who pressed the button; a mechanical Mk IV in the bay is left be
      // (the launchpad becomes Escape and the drone simply goes with it).
      consume: [
        ...inputs(ctx, holes).map((h) => h.id),
        ...workerCost(ctx, holes),
      ],
      produce: [],
      again: false,
      become: "escape",
    }),
  },

  // ── The automation layer: drones ─────────────────────────────────────────
  // One generic behaviour per Mk; the level is enforced by the host's bay, not
  // here. Each ticks every DRONE_TICK while bayed and feeds its host.
  drone_1: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_2: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_3: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_4: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
};
