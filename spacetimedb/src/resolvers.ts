import {
  DRONE_TICK,
  EFFORT,
  SOLAR,
  GATHER,
  PRINT,
  BUILD,
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
// manual, not a one-shot. Machine blueprints stay one-and-done.
type Build = { output: string; cost: number; keep?: boolean }; // cost = Components consumed
const BUILDS: Record<string, Build> = {
  // Machines
  blueprint_solar: { output: "solar_array", cost: 2 },
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
// Drones. A drone is a hole-less verb that lives in a machine's DRONE BAY (a
// slot with droneLevel > 0). Bound to that one host, every tick it tries to feed
// one of the host's empty INPUT holes by pulling a card the host accepts from the
// table or from any output tray — moving it straight in. Because each drone only
// ever feeds its own host, two drones never fight over the work the way roaming
// couriers did, and a machine with no bay (the choice machines) is never auto-
// filled. This single behaviour subsumes the old catalyst + courier shapes.
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

  const filled = new Set(
    [...ctx.db.card.boardId.filter(host.boardId)]
      .filter(
        (c) =>
          c.location.tag === "slotted" &&
          c.location.value.verbCardId === host.id,
      )
      .map((c) => (c.location.value as { slotIndex: number }).slotIndex),
  );
  // Input holes only (droneLevel 0); never the bay itself.
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  for (const sl of slots) {
    if (filled.has(sl.slotIndex)) continue;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    if (!loot) continue;
    return {
      consume: [],
      produce: [],
      again: true,
      moves: [
        {
          cardId: loot.id,
          to: {
            tag: "slotted",
            value: { verbCardId: host.id, slotIndex: sl.slotIndex },
          },
        },
      ],
    };
  }
  return tick; // nothing to feed right now — keep watching
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
