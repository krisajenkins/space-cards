import type { Ctx, SlottedCard } from "../platform/types";

// ──────────────────────────────────────────────────────────────────────────
// Recipe data — "what the game IS", not "how it runs". The authored tables that
// say what the Workshop builds, what the Assembler makes, what Research unlocks,
// and what the Wreck buried. The engine code that READS them lives in
// ../engine/resolvers.ts; this module is the data home, kept apart so you can
// find (and re-tune) the game's content without reading behaviour code.
//
// (Verb behaviour is code, by design — see CLAUDE.md — so a verb's OUTPUTS still
// live in its resolver. These four tables are the parts of the recipe graph that
// genuinely ARE data and benefit from sitting together.)
// ──────────────────────────────────────────────────────────────────────────

// ── Construction (the Workshop) ────────────────────────────────────────────
// A Blueprint card's defId is the unambiguous selector for what the Workshop
// builds — no fragile count-matching. Blueprints are EARNED at the Research
// bench (see RESEARCH_TREE), then built here; the tech-tree ORDER is enforced by
// the resource graph (you can't build a Subsystem without an Assembler +
// components + power), not by gating the manuals.
//
// `keep` marks a blueprint the Workshop hands back on completion (produced into
// the tray alongside the build) instead of consuming. Drones are deliberately
// reusable — you'll want a whole fleet — so a drone blueprint is a permanent
// manual, not a one-shot. The Solar Array is kept for the same reason: Power is
// the spine of the whole game, you scale it by building more arrays, so its
// manual stays permanent. Other machine blueprints are one-and-done.
export type Build = { output: string; cost: number; keep?: boolean }; // cost = Components consumed
export const BUILDS: Record<string, Build> = {
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
  // The Warehouse — a buildable container that houses factory cards to shrink the
  // endgame tabletop. One-and-done (not `keep`); the player builds as many as they
  // like, each holding up to 6 housed cards (capacity enforced in houseCard).
  blueprint_warehouse: { output: "warehouse", cost: 3 },
  // Drones (the automation layer — built the same way, but the blueprint is kept
  // so the player can build a whole fleet from one manual). Cost rises with the
  // Mk so automating a higher tier is a bigger investment.
  blueprint_drone_1: { output: "drone_1", cost: 2, keep: true },
  blueprint_drone_2: { output: "drone_2", cost: 3, keep: true },
  blueprint_drone_3: { output: "drone_3", cost: 4, keep: true },
  blueprint_drone_4: { output: "drone_4", cost: 5, keep: true },
};

// ── Rocket subsystems (the Assembler) ──────────────────────────────────────
// The Assembler offers a CHOICE of recipes (Agency-style `ready` hook): load the
// ingredients for the subsystem you want. Checked most-specific-first so an
// overlapping load (e.g. 5 components) resolves deterministically. Every recipe
// also costs one Power (handled in resolve).
export type Recipe = { output: string; need: Record<string, number> };
export const SUBSYSTEMS: Recipe[] = [
  { output: "life_support", need: { component: 2, circuit: 1, water: 1 } },
  { output: "heat_shield", need: { component: 3, glass: 2 } },
  { output: "avionics", need: { circuit: 4 } },
  { output: "engine", need: { component: 4, circuit: 1 } },
  { output: "hull", need: { component: 5 } },
];
export const recipeSatisfied = (
  ctx: Ctx,
  holes: SlottedCard[],
  r: Recipe,
  count: (ctx: Ctx, holes: SlottedCard[], cat: string) => number,
) => Object.entries(r.need).every(([cat, n]) => count(ctx, holes, cat) >= n);

// ── Research (the Research bench) ──────────────────────────────────────────
// Blueprints no longer all appear at the start — you EARN each one at the
// Research bench (one Effort → the next blueprint you've qualified for). Two
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
//
// `requires` is an optional list of blueprint defIds that must ALREADY have been
// discovered before this entry can be offered. The category `need`s alone can't
// express "this tier comes after that one" because every blueprint shares the
// `blueprint` category — and the chore gates can be met out of order (e.g. a
// player rushing Fuel for the rocket can hit `fuel ≥ 3` before ever making 3
// circuits). The drone Marks are a strict LADDER, so each higher Mk lists the Mk
// below as a prerequisite — Mk IV can never be researched before Mk III.
export type Research = {
  target: string;
  need: Record<string, number>;
  requires?: string[];
};
export const RESEARCH_TREE: Research[] = [
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
  // Warehouse: a mid-game layout-relief container, unlocked right after the
  // Refinery (you have metal flowing by now). One-and-done blueprint.
  { target: "warehouse", need: { metal: 1 } },
  { target: "fabricator", need: { metal: 1, power: 1 } },
  { target: "kiln", need: { raw: 1, power: 1 } },
  { target: "drone_2", need: { metal: 3 }, requires: ["blueprint_drone_1"] },
  // Electronics + chemistry sub-trees.
  { target: "ice_mine", need: { power: 1 } },
  { target: "electronics_fab", need: { silicon: 1, power: 1 } },
  { target: "electrolysis", need: { water: 1, power: 1 } },
  { target: "drone_3", need: { circuit: 3 }, requires: ["blueprint_drone_2"] },
  { target: "chem_reactor", need: { hydrogen: 1, oxygen: 1, power: 1 } },
  // Assembly + liftoff.
  {
    target: "assembler",
    need: { component: 1, circuit: 1, glass: 1, water: 1 },
  },
  { target: "rocket", need: { subsystem: 1, fuel: 1 } },
  { target: "drone_4", need: { fuel: 3 }, requires: ["blueprint_drone_3"] },
];

// ── The Wreck's manifest ───────────────────────────────────────────────────
// A fixed list of what the crash buried, handed out one item per scavenge in
// this order. The Printer and Workshop are no longer dealt, so the wreck is the
// only place they come from; they sit early, wrapped in a finite run of Scrap
// and Salvage. Drawn front-to-back, so the opening ramps the same every game —
// retune by editing this list. When it's spent the Wreck is picked clean and the
// resolver collapses it into a husk.
export const WRECK_CONTENTS = [
  "scrap",
  "salvage",
  "printer", // make Components by hand
  "scrap",
  "workshop", // build from blueprints
  "salvage",
  "scrap",
  "salvage",
  "scrap",
  "scrap",
];

// ── Verb outputs (the "produces" relation) ─────────────────────────────────
// What each verb defId emits each cycle. A verb's outputs live in its resolver
// CODE (verb behaviour is code, by design — see CLAUDE.md), so this is a
// deliberate restatement-as-data: the one place the produces-relation is written
// down, for the admin progression graph (platform/graph.ts) to read. Keep it in
// step with the resolvers. Drones produce nothing (they feed their host).
export const VERB_OUTPUTS: Record<string, string[]> = {
  survivor: ["effort"],
  regolith_field: ["regolith"],
  printer: ["component"],
  solar_array: ["power"],
  refinery: ["metal"],
  fabricator: ["component"],
  electronics_fab: ["circuit"],
  kiln: ["silicon", "glass"],
  ice_mine: ["water"],
  electrolysis: ["hydrogen", "oxygen"],
  chem_reactor: ["fuel"],
};

// ── Verb metamorphoses (the "becomes" relation) ────────────────────────────
// Verbs that transform in place into another card (a `become`) rather than
// producing into a tray. The Wreck picks clean into a husk; the Rocket launches
// into escape. Read by platform/graph.ts to draw a distinct "becomes" edge.
export const VERB_BECOMES: Record<string, string> = {
  wreck: "exhausted_wreck",
  rocket: "escape",
};
