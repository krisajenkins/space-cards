import type { Ctx, SlottedCard } from "../platform/types";
import type { CardModule } from "./cards/_types";

// ──────────────────────────────────────────────────────────────────────────
// Recipe data — "what the game IS", PROJECTED from the per-card modules.
//
// The authored tables that say what the Workbench builds, what the Assembler
// makes, what Research unlocks, and what the Wreck buried no longer live here as
// hand-written literals: each card owns its own slice (a blueprint card's
// `build` + `research`, a subsystem card's `subsystem`, the Wreck card's
// `wreckManifest`, a verb card's `produces` / `becomes`). This module derives the
// aggregate maps the engine and the admin graph read from those slices.
//
// NO RUNTIME IMPORTS (it's a sink in the module graph). The card registry is
// INJECTED once at startup by cards/index.ts (`registerCards`) rather than
// imported here. That inverts what would otherwise be a cycle —
// card files → engine/verb-api.ts → recipes.ts → cards/index.ts → card files —
// the verb API needs these aggregates, and the cards it derives them from need
// the verb API for their resolvers. Inverting this one edge breaks the loop.
// Getters compute lazily (at reducer time, long after registration), so the
// injected array is always present by the time one runs.
// ──────────────────────────────────────────────────────────────────────────

export type Build = { output: string; cost: number; keep?: boolean }; // cost = Components consumed
export type Recipe = { output: string; need: Record<string, number> };
export type Research = {
  target: string;
  need?: Record<string, number>; // AND: ≥1 of EACH (machine inputs)
  chore?: { of: string[]; count: number }; // SUM these output categories ≥ count (drone tier chore)
  requires?: string[];
};

// The card registry, injected by cards/index.ts at module load (before any
// reducer runs). Kept private; the getters below read it via allCards().
let _cards: CardModule[] | null = null;
export function registerCards(cards: CardModule[]): void {
  _cards = cards;
}
function allCards(): CardModule[] {
  if (!_cards) throw new Error("recipes: registerCards() has not run yet");
  return _cards;
}

// ── Construction (the Workbench) ────────────────────────────────────────────
// A Blueprint card's defId is the unambiguous selector for what the Workbench
// builds. Each blueprint card declares its own `build` ({ output, cost, keep? }).
// `keep` marks a blueprint the Workbench hands back on completion (a permanent
// manual — drones and the Solar Array, which you scale by building more).
let _builds: Record<string, Build> | null = null;
export function builds(): Record<string, Build> {
  if (_builds) return _builds;
  _builds = {};
  for (const c of allCards()) if (c.build) _builds[c.defId] = c.build;
  return _builds;
}

// ── Rocket subsystems (the Assembler) ──────────────────────────────────────
// Each subsystem card declares its `subsystem` recipe ({ order, need }). The
// Assembler offers a CHOICE of recipes checked most-specific-first, so `order`
// preserves that deterministic match order.
let _subsystems: Recipe[] | null = null;
export function subsystems(): Recipe[] {
  if (_subsystems) return _subsystems;
  _subsystems = allCards()
    .filter((c) => c.subsystem)
    .sort((a, b) => a.subsystem!.order - b.subsystem!.order)
    .map((c) => ({ output: c.defId, need: c.subsystem!.need }));
  return _subsystems;
}
export const recipeSatisfied = (
  ctx: Ctx,
  holes: SlottedCard[],
  r: Recipe,
  count: (ctx: Ctx, holes: SlottedCard[], cat: string) => number,
) => Object.entries(r.need).every(([cat, n]) => count(ctx, holes, cat) >= n);

// ── Research (the Research bench) ──────────────────────────────────────────
// Each blueprint card declares its own `research` ({ order, need? / chore?,
// requires? }). The bench earns the first qualified, undiscovered blueprint in
// `order`. A `target` is the blueprint defId with its `blueprint_` prefix
// stripped (researchTarget re-adds it) — e.g. blueprint_solar → "solar".
let _researchTree: Research[] | null = null;
export function researchTree(): Research[] {
  if (_researchTree) return _researchTree;
  _researchTree = allCards()
    .filter((c) => c.research)
    .sort((a, b) => a.research!.order - b.research!.order)
    .map((c) => ({
      target: c.defId.replace(/^blueprint_/, ""),
      need: c.research!.need,
      chore: c.research!.chore,
      requires: c.research!.requires,
    }));
  return _researchTree;
}

// ── The Wreck's manifest ───────────────────────────────────────────────────
// A fixed, ORDERED list (with repeats) of what the crash buried, handed out one
// item per scavenge front-to-back. It is intrinsic to the Wreck, so it lives on
// the Wreck card (its `wreckManifest`) rather than being scattered across the
// item cards (Scrap alone appears five times).
let _wreckContents: string[] | null = null;
export function wreckContents(): string[] {
  if (_wreckContents) return _wreckContents;
  _wreckContents = allCards().find((c) => c.wreckManifest)?.wreckManifest ?? [];
  return _wreckContents;
}

// ── Verb outputs (the "produces" relation) ─────────────────────────────────
// What each verb defId emits each cycle, declared as each verb card's `produces`.
// A verb's outputs live in its resolver CODE (verb behaviour is code, by design —
// see CLAUDE.md); `produces` is the deliberate restatement-as-data the admin
// progression graph (platform/graph.ts) reads. Keep it in step with the resolver.
let _verbOutputs: Record<string, string[]> | null = null;
export function verbOutputs(): Record<string, string[]> {
  if (_verbOutputs) return _verbOutputs;
  _verbOutputs = {};
  for (const c of allCards())
    if (c.produces) _verbOutputs[c.defId] = c.produces;
  return _verbOutputs;
}

// ── Verb metamorphoses (the "becomes" relation) ────────────────────────────
// Verbs that transform in place into another card (each verb card's `becomes`)
// rather than producing into a tray. The Wreck picks clean into a husk; the
// Rocket launches into escape. Read by platform/graph.ts to draw a "becomes" edge.
let _verbBecomes: Record<string, string> | null = null;
export function verbBecomes(): Record<string, string> {
  if (_verbBecomes) return _verbBecomes;
  _verbBecomes = {};
  for (const c of allCards()) if (c.becomes) _verbBecomes[c.defId] = c.becomes;
  return _verbBecomes;
}
