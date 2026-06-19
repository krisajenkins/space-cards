import {
  COURIER_HOLD,
  EFFORT,
  SOLAR,
  GATHER,
  DRONE_GATHER,
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
// so a hole-less verb (a courier) can still find its own id / board.
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

// A power-gated transformer: one Power + one `inputCat` card per cycle → one
// `output`. Re-fires while both are present; consuming the Power leaves the
// required power hole empty, so it idles the moment power runs out (the Power
// gate) and resumes when a Hauler — or the player — re-feeds it.
function poweredOne(dur: bigint, inputCat: string, output: string): Resolver {
  return {
    duration: () => dur,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, inputCat) > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, inputCat, 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      return { consume: [...power, ...input], produce: [output], again: true };
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
  // Drones (the automation layer — built the same way, but blueprint is kept so
  // the player can build a whole fleet from one manual)
  blueprint_mining_drone: { output: "mining_drone", cost: 2, keep: true },
  blueprint_survey_drone: { output: "survey_drone", cost: 2, keep: true },
  blueprint_hauler: { output: "hauler", cost: 2, keep: true },
  blueprint_feeder: { output: "feeder", cost: 3, keep: true },
  blueprint_fitter: { output: "fitter", cost: 3, keep: true },
  blueprint_tanker: { output: "tanker", cost: 3, keep: true },
  blueprint_cargo: { output: "cargo", cost: 4, keep: true },
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
// Couriers. A generalised Worker: a hole-less verb that each beat either grabs
// a card it carries from an eligible output tray, or hands the one it's holding
// to the first open hole that accepts it. Each courier type carries a DISJOINT
// set of categories so two couriers never fight over the same card.
//   from = null  → raid any verb's tray;  [defIds] → only those producers.
// ──────────────────────────────────────────────────────────────────────────
type CourierSpec = { carries: string[]; from: string[] | null };
const COURIERS: Record<string, CourierSpec> = {
  hauler: { carries: ["power"], from: ["solar_array"] },
  feeder: { carries: ["raw", "metal"], from: null },
  fitter: { carries: ["silicon", "glass", "circuit", "component"], from: null },
  tanker: { carries: ["water", "hydrogen", "oxygen", "fuel"], from: null },
  cargo: { carries: ["subsystem", "blueprint"], from: null },
};

// The first card in an eligible output tray on this board that this courier is
// willing to carry. Never hauls a verb card (a dormant machine/drone waiting to
// be planted) — only resources.
function firstCourierLoot(
  ctx: Ctx,
  boardId: bigint,
  spec: CourierSpec,
): Card | null {
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag !== "output") continue;
    const producer = ctx.db.card.id.find(c.location.value.verbCardId);
    if (!producer) continue;
    if (spec.from !== null && !spec.from.includes(producer.defId)) continue;
    const def = ctx.db.cardDef.defId.find(c.defId);
    if (!def || def.isVerb) continue;
    if (!spec.carries.includes(def.category)) continue;
    return c;
  }
  return null;
}

// An empty hole anywhere on the board that accepts `card` — where a courier
// hands off what it carries. Scans tabletop verbs (a tray-bound verb can't take
// inputs) and skips `excludeVerbId` (the courier itself).
function firstOpenSlot(
  ctx: Ctx,
  boardId: bigint,
  card: Card,
  excludeVerbId: bigint,
): { verbCardId: bigint; slotIndex: number } | null {
  const cat = catOf(ctx, card);
  const boardCards = [...ctx.db.card.boardId.filter(boardId)];
  for (const verb of boardCards) {
    if (verb.id === excludeVerbId || verb.location.tag !== "tabletop") continue;
    const def = ctx.db.cardDef.defId.find(verb.defId);
    if (!def || !def.isVerb) continue;
    const filled = new Set(
      boardCards
        .filter(
          (c): c is SlottedCard =>
            c.location.tag === "slotted" &&
            c.location.value.verbCardId === verb.id,
        )
        .map((c) => c.location.value.slotIndex),
    );
    const slots = [...ctx.db.slotDef.defId.filter(verb.defId)].sort(
      (a, b) => a.slotIndex - b.slotIndex,
    );
    for (const sl of slots) {
      if (filled.has(sl.slotIndex)) continue;
      if (sl.accepts.includes(card.defId) || sl.accepts.includes(cat))
        return { verbCardId: verb.id, slotIndex: sl.slotIndex };
    }
  }
  return null;
}

function courierResolve(
  ctx: Ctx,
  holes: SlottedCard[],
  verb: Card,
  spec: CourierSpec,
): Effects {
  const carried = holes[0];
  if (carried) {
    const dest = firstOpenSlot(ctx, verb.boardId, carried, verb.id);
    if (!dest) return { consume: [], produce: [], again: true }; // keep holding
    return {
      consume: [],
      produce: [],
      again: true,
      moves: [
        {
          cardId: carried.id,
          to: {
            tag: "slotted",
            value: { verbCardId: dest.verbCardId, slotIndex: dest.slotIndex },
          },
        },
      ],
    };
  }
  const loot = firstCourierLoot(ctx, verb.boardId, spec);
  if (!loot) return { consume: [], produce: [], again: true }; // nothing to haul
  return {
    consume: [],
    produce: [],
    again: true,
    moves: [
      {
        cardId: loot.id,
        to: { tag: "slotted", value: { verbCardId: verb.id, slotIndex: 0 } },
      },
    ],
  };
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

  // Regolith Field: dual-mode, like the old Forest.
  //  - fed Effort: gather once, consuming it.
  //  - fed a Mining Drone (catalyst): gather every cycle, keeping the drone.
  regolith_field: {
    duration: (holes) =>
      holes[0]?.defId === "mining_drone" ? DRONE_GATHER : GATHER,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return NOOP;
      if (input.defId === "mining_drone")
        return { consume: [], produce: ["regolith"], again: true };
      return { consume: [input.id], produce: ["regolith"], again: false };
    },
  },

  // Wreck: the discovery node. Mostly Scrap; ~20% a Salvage (a ready-made part).
  // Effort scavenges once; a Survey Drone scavenges continuously.
  wreck: {
    duration: (holes) =>
      holes[0]?.defId === "survey_drone" ? DRONE_GATHER : GATHER,
    resolve: (ctx, holes) => {
      const input = holes[0];
      if (!input) return NOOP;
      const drop = ctx.random() < 0.2 ? "salvage" : "scrap";
      if (input.defId === "survey_drone")
        return { consume: [], produce: [drop], again: true };
      return { consume: [input.id], produce: [drop], again: false };
    },
  },

  // Printer: the crude bootstrap fabricator — raw → Component, no power, slow.
  // An inbox queue that drains one per cycle (like the old Market).
  printer: {
    duration: () => PRINT,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return NOOP;
      return { consume: [input.id], produce: ["component"], again: true };
    },
  },

  // Workshop: hand-cranked constructor. Blueprint (selects the output) + Effort
  // + enough Components → the machine/drone, dormant in the tray to be planted.
  // Cranked by Effort (not Power) so it works from turn one, before any Solar.
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
      return { consume: [...power, ...input], produce: [out], again: true };
    },
  },

  // Ice Mine: a power-gated emitter — Power in, Water out, no other input.
  ice_mine: {
    duration: () => MINE_ICE,
    ready: (_ctx, holes) => hasPower(holes),
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      return { consume: power, produce: ["water"], again: true };
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
        consume: [...power, ...water],
        produce: ["hydrogen", "oxygen"],
        again: true,
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
        consume: [...power, ...h2, ...o2],
        produce: ["fuel"],
        again: true,
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
      const consume = [...power];
      for (const [cat, n] of Object.entries(recipe.need))
        consume.push(...take(ctx, holes, cat, n));
      return { consume, produce: [recipe.output], again: true };
    },
  },

  // ── Liftoff ──────────────────────────────────────────────────────────────
  // Rocket: all five Subsystems + three Fuel (all required holes) → it fires
  // and metamorphoses into Escape where it stood. One-shot. You're home.
  rocket: {
    duration: () => LAUNCH,
    resolve: (_ctx, holes) => ({
      consume: holes.map((h) => h.id),
      produce: [],
      again: false,
      become: "escape",
    }),
  },

  // ── The automation layer: couriers ───────────────────────────────────────
  hauler: {
    duration: () => COURIER_HOLD,
    resolve: (ctx, holes, verb) =>
      courierResolve(ctx, holes, verb, COURIERS.hauler),
  },
  feeder: {
    duration: () => COURIER_HOLD,
    resolve: (ctx, holes, verb) =>
      courierResolve(ctx, holes, verb, COURIERS.feeder),
  },
  fitter: {
    duration: () => COURIER_HOLD,
    resolve: (ctx, holes, verb) =>
      courierResolve(ctx, holes, verb, COURIERS.fitter),
  },
  tanker: {
    duration: () => COURIER_HOLD,
    resolve: (ctx, holes, verb) =>
      courierResolve(ctx, holes, verb, COURIERS.tanker),
  },
  cargo: {
    duration: () => COURIER_HOLD,
    resolve: (ctx, holes, verb) =>
      courierResolve(ctx, holes, verb, COURIERS.cargo),
  },
};
