import { t } from "spacetimedb/server";
import type { ReadCtx } from "./types";
import {
  BUILDS,
  SUBSYSTEMS,
  RESEARCH_TREE,
  WRECK_CONTENTS,
  VERB_OUTPUTS,
  VERB_BECOMES,
} from "../content/recipes";

// The graph builder only ever READS catalogue tables — it needs `ctx.db`, not
// the caller's identity. An anonymous view's context has no `sender` (it's the
// same for everyone), so we widen to "anything with the db handle" rather than
// the full ReadCtx, which requires `sender`. A reducer/view ctx satisfies this.
type GraphCtx = Pick<ReadCtx, "db">;

// ──────────────────────────────────────────────────────────────────────────
// Progression graph — a READ-ONLY, catalogue-level projection of the whole
// recipe/crafting tree, derived from the same definitions the engine runs on.
//
// "This would be easy if all our recipes were data" — they aren't (verb
// behaviour is code, by design; see CLAUDE.md), so this module is the bridge:
// a pure function that walks the catalogue (card_def / slot_def) PLUS the
// recipe maps from content/recipes.ts (BUILDS / SUBSYSTEMS / RESEARCH_TREE /
// WRECK_CONTENTS, plus the VERB_OUTPUTS / VERB_BECOMES relations) into a
// {nodes, edges} graph an admin can SEE end-to-end. It changes nothing about
// how the game plays — it only reads.
//
// Everything here is computed from the live catalogue + those exported content
// maps; the maps themselves (including the verb → produced/becomes relations,
// which restate resolver behaviour as data) all live in content/recipes.ts.
// ──────────────────────────────────────────────────────────────────────────

// ── Graph row types (the shape emitted over the wire) ──────────────────────
// A node is one card_def. A verb node also carries its produced-card list and a
// flat list of the input categories its holes accept, so the client can render
// a card without re-deriving them. An edge is a typed relation between two
// defIds; `kind` lets the client colour/label it.
export const GraphNode = t.object("GraphNode", {
  defId: t.string(),
  name: t.string(),
  category: t.string(),
  isVerb: t.bool(),
  droneLevel: t.u32(),
});

// kind:
//   "produce"  verb → resource it emits each cycle (refinery → metal)
//   "consume"  resource/category → verb that accepts it in a hole (raw → refinery)
//   "build"    blueprint → verb/drone the Workshop builds from it
//   "research" prerequisite category → blueprint Research unlocks once met
//   "subsystem" component category → rocket subsystem the Assembler needs
//   "wreck"    wreck → item in its manifest
//   "become"   verb → the card it metamorphoses into
export const GraphEdge = t.object("GraphEdge", {
  from: t.string(),
  to: t.string(),
  kind: t.string(),
  label: t.string(), // optional human note ("x2", "Mk II", …); "" when none
});

type Edge = { from: string; to: string; kind: string; label: string };

// Build the whole progression graph from the live catalogue + the exported
// recipe maps. Pure: reads only, mutates nothing. Safe to call from a view.
export function buildProgressionGraph(ctx: GraphCtx): {
  nodes: {
    defId: string;
    name: string;
    category: string;
    isVerb: boolean;
    droneLevel: number;
  }[];
  edges: Edge[];
} {
  const defs = [...ctx.db.cardDef.iter()];
  const known = new Set(defs.map((d) => d.defId));
  const isDef = (id: string) => known.has(id);

  const nodes = defs.map((d) => ({
    defId: d.defId,
    name: d.name,
    category: d.category,
    isVerb: d.isVerb,
    droneLevel: d.droneLevel,
  }));

  // A category → the concrete defIds that belong to it. Consumption edges are
  // expressed against categories (a hole "accepts" categories), so to draw an
  // edge to a real card we expand a category to its members. e.g. "raw" →
  // {regolith, scrap}; "component" → {component, salvage}.
  const membersOf = new Map<string, string[]>();
  for (const d of defs) {
    const arr = membersOf.get(d.category) ?? [];
    arr.push(d.defId);
    membersOf.set(d.category, arr);
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, kind: string, label = "") => {
    if (!isDef(from) || !isDef(to)) return;
    const key = `${from}|${to}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind, label });
  };

  // ── produce: verb → each card it emits ───────────────────────────────────
  for (const [verb, outs] of Object.entries(VERB_OUTPUTS))
    for (const out of outs) add(verb, out, "produce");

  // ── become: verb → its metamorphosis target ──────────────────────────────
  for (const [verb, into] of Object.entries(VERB_BECOMES))
    add(verb, into, "become");

  // ── consume: each input hole's accepted category → the verb ───────────────
  // Slot rows are the data home of "what a verb takes". Skip drone bays
  // (droneLevel > 0): a bay holds the worker, not a consumed material input,
  // and "drone feeds machine" is shown by the build/research tiers instead. We
  // expand each accepted category to its member cards so the edge lands on a
  // real producible/raw card; if a category has no concrete card (e.g. a hole
  // that accepts a bare category with no def), fall back to the category name.
  for (const s of ctx.db.slotDef.iter()) {
    if (s.droneLevel > 0) continue;
    for (const accept of s.accepts) {
      const members = membersOf.get(accept);
      if (members && members.length > 0)
        for (const m of members) add(m, s.defId, "consume");
      else add(accept, s.defId, "consume");
    }
  }

  // ── build: blueprint → the verb/drone the Workshop makes from it ──────────
  for (const [bp, b] of Object.entries(BUILDS)) {
    add(bp, b.output, "build", `${b.cost} component${b.cost === 1 ? "" : "s"}`);
    // The Workshop is the machine that does the building — show the blueprint
    // flowing through it.
    add(bp, "workshop", "consume");
  }

  // ── research: prerequisite category → the blueprint Research unlocks ───────
  // The Research bench earns a blueprint once the board has created enough of its
  // gate categories — a machine's `need` (≥1 of each input) or a drone's `chore`
  // (the tier's output categories, summed). Draw an edge from each prerequisite
  // category's cards to the unlocked blueprint, so the unlock deps are visible.
  for (const r of RESEARCH_TREE) {
    const bp = `blueprint_${r.target}`;
    add("research", bp, "produce");
    const gate: Record<string, number> = r.chore
      ? Object.fromEntries(r.chore.of.map((cat) => [cat, r.chore!.count]))
      : (r.need ?? {});
    for (const [cat, n] of Object.entries(gate)) {
      const members = membersOf.get(cat) ?? [cat];
      for (const m of members) add(m, bp, "research", `${cat} x${n}`);
    }
  }

  // ── subsystem: ingredient category → rocket subsystem (Assembler recipe) ───
  // SUBSYSTEMS already surface via slot_def consume edges into the Assembler,
  // but the recipe (which subsystem needs what) is finer-grained than the holes.
  // Draw ingredient → subsystem so the five recipes read individually.
  for (const r of SUBSYSTEMS) {
    add("assembler", r.output, "produce");
    for (const [cat, n] of Object.entries(r.need)) {
      const members = membersOf.get(cat) ?? [cat];
      for (const m of members) add(m, r.output, "subsystem", `${cat} x${n}`);
    }
  }

  // ── wreck: the wreck → each distinct item in its manifest ─────────────────
  for (const item of new Set(WRECK_CONTENTS)) add("wreck", item, "wreck");

  return { nodes, edges };
}
