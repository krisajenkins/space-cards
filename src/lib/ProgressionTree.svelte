<script lang="ts">
// ── Progression Tree (admin visualiser) ───────────────────────────────────
// A READ-ONLY node-link diagram of the WHOLE crafting graph: every card_def is
// a node, every recipe relation an edge, served by the public `progression_*`
// anonymous views (derived on the server from the catalogue + the recipe maps —
// see spacetimedb/src/platform/graph.ts). The toggle that opens this is gated to admins
// in App.svelte; the data itself is catalogue-level (no game state), so it's a
// pure visualiser, not an editor.
//
// Layout is a simple layered DAG done here in TS (longest-path layering on the
// build/produce/research "forward" edges, barycentre ordering within a layer) —
// readability over polish, and no extra client dependency. Pan with drag, zoom
// with the wheel.
import { useTable } from "spacetimedb/svelte";
import { tables } from "../module_bindings";
import { visualFor } from "./catalogue";

let { onClose }: { onClose: () => void } = $props();

const [nodes] = useTable(tables.progressionNodes);
const [edges] = useTable(tables.progressionEdges);

// Edge styling per kind: colour + whether it counts as a "forward" (progression)
// edge for layering. Consume edges (input → machine) and subsystem/research/wreck
// flows all point forward; `become` is a sideways metamorphosis we still draw.
const EDGE_KINDS: Record<
  string,
  { color: string; label: string; forward: boolean }
> = {
  produce: { color: "var(--astral)", label: "produces", forward: true },
  consume: { color: "var(--cat-component)", label: "feeds", forward: true },
  build: { color: "var(--cat-blueprint)", label: "builds", forward: true },
  research: { color: "var(--cat-drone)", label: "unlocks", forward: true },
  subsystem: { color: "var(--cat-subsystem)", label: "subsystem", forward: true },
  wreck: { color: "var(--cat-salvage)", label: "salvage", forward: true },
  become: { color: "var(--ember)", label: "becomes", forward: true },
};
const ALL_KINDS = Object.keys(EDGE_KINDS);

// Which edge kinds are shown. All on by default; toggling a kind both hides its
// edges and re-runs layout (so the diagram re-flows around what's visible).
let visible = $state<Record<string, boolean>>(
  Object.fromEntries(ALL_KINDS.map((k) => [k, true])),
);

// Zero-or-one "active" card: click to toggle, click empty space (or it again) to
// clear. Hover would fight panning/zooming, so selection is sticky.
let active = $state<string | null>(null);

// Layout geometry.
const NODE_W = 150;
const NODE_H = 58; // tall enough for a two-line wrapped title + category
const LAYER_GAP = 230; // horizontal distance between layers
const ROW_GAP = 76; // vertical distance between nodes in a layer

type Placed = {
  defId: string;
  name: string;
  category: string;
  isVerb: boolean;
  x: number;
  y: number;
};

type Layout = {
  placed: Placed[];
  pos: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

// Longest-path layering over the visible FORWARD edges, then barycentre ordering
// within each layer to reduce crossings, then assign coordinates. Pure function
// of (nodes, edges, visible) so it recomputes reactively.
function computeLayout(
  nodeRows: typeof $nodes,
  edgeRows: typeof $edges,
  vis: Record<string, boolean>,
): Layout {
  const ids = nodeRows.map((n) => n.defId);
  const meta = new Map(nodeRows.map((n) => [n.defId, n]));
  if (ids.length === 0)
    return { placed: [], pos: new Map(), width: 0, height: 0 };

  // Raw forward adjacency from the visible, forward-kind edges only. This graph
  // is NOT acyclic: a verb can both consume and produce the same category — e.g.
  // the fabricator takes a `component` and emits a `component`, giving a 2-cycle
  // component↔fabricator. Left in, longest-path layering diverges around every
  // such loop (each relaxation pass bumps the looped nodes one layer further
  // right, up to ~node-count layers ≈ thousands of px off-screen). So we first
  // strip back edges into a DAG, then layer that.
  const radj = new Map<string, string[]>();
  for (const id of ids) radj.set(id, []);
  for (const e of edgeRows) {
    const kind = EDGE_KINDS[e.kind];
    if (!kind || !kind.forward || !vis[e.kind]) continue;
    if (!meta.has(e.from) || !meta.has(e.to)) continue;
    radj.get(e.from)!.push(e.to);
  }

  // DFS edge classification: an edge into a node still on the recursion stack
  // ("grey") closes a cycle — drop it. Everything else keeps its forward
  // direction, yielding a DAG with the same overall left-to-right flow.
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]));
  const back = new Set<string>(); // "from|to" of dropped (cycle-closing) edges
  const visit = (u: string) => {
    color.set(u, GREY);
    for (const v of radj.get(u)!) {
      const c = color.get(v)!;
      if (c === GREY) back.add(`${u}|${v}`);
      else if (c === WHITE) visit(v);
    }
    color.set(u, BLACK);
  };
  for (const id of ids) if (color.get(id) === WHITE) visit(id);

  const fwd = new Map<string, string[]>();
  for (const id of ids) fwd.set(id, []);
  for (const [from, tos] of radj)
    for (const to of tos)
      if (!back.has(`${from}|${to}`)) fwd.get(from)!.push(to);

  // Longest-path layer assignment over the DAG. Roots (indegree 0) sit at layer
  // 0; every node is placed one past the deepest predecessor. The graph is now
  // acyclic, so the relaxation converges in a few passes.
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [from, tos] of fwd) {
      const lf = layer.get(from)!;
      for (const to of tos) {
        if (layer.get(to)! < lf + 1) {
          layer.set(to, lf + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Group by layer.
  const byLayer = new Map<number, string[]>();
  let maxLayer = 0;
  for (const id of ids) {
    const l = layer.get(id)!;
    maxLayer = Math.max(maxLayer, l);
    const arr = byLayer.get(l) ?? [];
    arr.push(id);
    byLayer.set(l, arr);
  }

  // Barycentre ordering: a few sweeps placing each node near the average row of
  // its already-placed neighbours, to untangle crossings. Cheap for ~55 nodes.
  let order = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l++) {
    const arr = (byLayer.get(l) ?? []).slice().sort((a, b) =>
      a.localeCompare(b),
    );
    arr.forEach((id, i) => order.set(id, i));
  }
  const preds = new Map<string, string[]>();
  for (const id of ids) preds.set(id, []);
  for (const [from, tos] of fwd) for (const to of tos) preds.get(to)!.push(from);
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let l = 1; l <= maxLayer; l++) {
      const arr = byLayer.get(l) ?? [];
      const bary = (id: string) => {
        const ps = preds.get(id)!.filter((p) => layer.get(p) === l - 1);
        if (ps.length === 0) return order.get(id)!;
        return ps.reduce((s, p) => s + (order.get(p) ?? 0), 0) / ps.length;
      };
      arr.sort((a, b) => bary(a) - bary(b));
      arr.forEach((id, i) => order.set(id, i));
    }
  }

  // Assign coordinates. Each layer is a column; nodes stack vertically, centred.
  const maxRows = Math.max(
    1,
    ...[...byLayer.values()].map((a) => a.length),
  );
  const height = maxRows * ROW_GAP + NODE_H;
  const placed: Placed[] = [];
  const pos = new Map<string, { x: number; y: number }>();
  for (let l = 0; l <= maxLayer; l++) {
    const arr = (byLayer.get(l) ?? [])
      .slice()
      .sort((a, b) => order.get(a)! - order.get(b)!);
    const colHeight = arr.length * ROW_GAP;
    const top = (height - colHeight) / 2;
    arr.forEach((id, i) => {
      const m = meta.get(id)!;
      const x = l * LAYER_GAP + NODE_W / 2 + 30;
      const y = top + i * ROW_GAP + NODE_H / 2;
      pos.set(id, { x, y });
      placed.push({
        defId: id,
        name: m.name,
        category: m.category,
        isVerb: m.isVerb,
        x,
        y,
      });
    });
  }
  const width = (maxLayer + 1) * LAYER_GAP + NODE_W;
  return { placed, pos, width: width + 60, height: height + 60 };
}

// The active card plus every card it directly connects to (in either
// direction), over the currently-visible edge kinds. Null when nothing is
// selected.
function neighbourIds(id: string): Set<string> {
  const s = new Set<string>([id]);
  for (const e of $edges) {
    if (!visible[e.kind] || !EDGE_KINDS[e.kind]) continue;
    if (e.from === id) s.add(e.to);
    if (e.to === id) s.add(e.from);
  }
  return s;
}
const neighbours = $derived.by(() =>
  active === null ? null : neighbourIds(active),
);

// Selecting a card FOCUSES the graph: we re-lay-out over just that card and its
// neighbours, so the cluster packs tightly and fills the viewport instead of
// being a tiny island stranded between far-apart layers. With nothing selected
// we lay out the whole catalogue.
const viewNodes = $derived(
  neighbours === null ? $nodes : $nodes.filter((n) => neighbours.has(n.defId)),
);
const layout = $derived(computeLayout(viewNodes, $edges, visible));

// Edges to draw: visible kind, both endpoints present in the current layout.
// In focus mode that's automatically just the subgraph's internal edges (only
// the focused nodes have positions), so everything shown is relevant — no
// dimming needed.
const drawEdges = $derived(
  $edges
    .filter((e) => visible[e.kind] && EDGE_KINDS[e.kind])
    .map((e) => {
      const a = layout.pos.get(e.from);
      const b = layout.pos.get(e.to);
      if (!a || !b) return null;
      return { e, a, b, color: EDGE_KINDS[e.kind].color };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null),
);

// ── Pan / zoom ─────────────────────────────────────────────────────────────
let scale = $state(1);
let panX = $state(0);
let panY = $state(0);
let dragging = $state(false);
let moved = false; // did this pointer interaction actually pan? (vs. a click)
let lastX = 0;
let lastY = 0;
let downX = 0; // where the press started, to tell a click from a drag
let downY = 0;

// The canvas measures itself so we can fit the whole graph into it. Without
// this the diagram renders from the canvas top-left at a fixed zoom and spills
// off the bottom/right; fitView scales it down and centres it instead.
let canvasW = $state(0);
let canvasH = $state(0);
const FIT_PAD = 36; // px of breathing room around the graph at fit zoom

function fitView() {
  if (!canvasW || !canvasH || layout.width <= 0 || layout.height <= 0) return;
  const s = Math.min(
    (canvasW - FIT_PAD * 2) / layout.width,
    (canvasH - FIT_PAD * 2) / layout.height,
  );
  scale = Math.min(2.5, Math.max(0.25, s));
  panX = (canvasW - layout.width * scale) / 2;
  panY = (canvasH - layout.height * scale) / 2;
}

// Auto-fit until the user takes control of the view. The graph streams in over
// the subscription, so the layout keeps growing for a few frames after the first
// node appears — a one-shot fit would frame a partial graph and then leave the
// rest off-screen. Instead we re-fit on every layout/size change right up until
// the first pan or zoom, after which the user owns the viewport. "Reset view"
// hands control back (and re-fits).
let userControlled = $state(false);
$effect(() => {
  // Touch the reactive inputs so this re-runs as the graph streams in / resizes.
  void [canvasW, canvasH, layout.width, layout.height, layout.placed.length];
  if (userControlled) return;
  if (canvasW && canvasH && layout.placed.length > 0) fitView();
});

function onWheel(e: WheelEvent) {
  e.preventDefault();
  userControlled = true;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  scale = Math.min(2.5, Math.max(0.25, scale * factor));
}
function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  dragging = true;
  moved = false;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  // NB: capture the pointer lazily (on first real movement), not here — capturing
  // on press retargets the click to the canvas and swallows node selection.
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  panX += e.clientX - lastX;
  panY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (!moved && Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 3) {
    moved = true;
    userControlled = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
}
function onPointerUp() {
  dragging = false;
}

// Click (not drag) on a card focuses it: the graph re-lays-out over just that
// card + its neighbours and the auto-fit reframes the tight cluster. Clicking it
// again, or empty canvas, deselects and the whole graph re-flows back in.
function toggleNode(id: string) {
  if (moved) return;
  if (active === id) {
    deselect();
  } else {
    active = id;
    userControlled = false; // let auto-fit frame the new (focused) layout
  }
}
function deselect() {
  active = null;
  userControlled = false; // auto-fit reframes the whole graph
}
function onCanvasClick() {
  if (moved || active === null) return;
  deselect();
}
function reset() {
  active = null; // drop any focus and return to the whole graph
  userControlled = false; // hand control back to auto-fit
  fitView();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") onClose();
}

function edgePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  // A gentle horizontal-tangent cubic, so left-to-right flow reads as flow.
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="pt-backdrop"
  role="presentation"
  onclick={(e) => {
    if (e.target === e.currentTarget) onClose();
  }}
>
  <div class="pt-panel" role="dialog" aria-modal="true" aria-label="Progression tree">
    <header class="pt-head">
      <div class="pt-titles">
        <p class="pt-eyebrow">Admin · the whole crafting graph</p>
        <h2>Progression Tree</h2>
      </div>
      <div class="pt-controls">
        <span class="pt-count">{$nodes.length} cards · {drawEdges.length} edges</span>
        <button class="pt-btn" onclick={reset}>Reset view</button>
        <button class="pt-close" aria-label="Close" onclick={onClose}>×</button>
      </div>
    </header>

    <div class="pt-legend">
      {#each ALL_KINDS as kind (kind)}
        <button
          class="pt-chip"
          class:off={!visible[kind]}
          onclick={() => (visible[kind] = !visible[kind])}
        >
          <span class="pt-swatch" style="background:{EDGE_KINDS[kind].color}"></span>
          {EDGE_KINDS[kind].label}
        </button>
      {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pt-canvas"
      bind:clientWidth={canvasW}
      bind:clientHeight={canvasH}
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onclick={onCanvasClick}
      class:dragging
    >
      <svg width="100%" height="100%">
        <g transform="translate({panX} {panY}) scale({scale})">
          <!-- edges first, under the nodes -->
          {#each drawEdges as d (d.e.from + d.e.to + d.e.kind)}
            <path
              d={edgePath(d.a, d.b)}
              fill="none"
              stroke={d.color}
              stroke-width="1.6"
              opacity="0.55"
            />
          {/each}

          <!-- nodes -->
          {#each layout.placed as n (n.defId)}
            {@const v = visualFor(n.defId, n.category)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <g
              transform="translate({n.x - NODE_W / 2} {n.y - NODE_H / 2})"
              class="pt-node"
              class:active={active === n.defId}
              onclick={(e) => {
                e.stopPropagation();
                toggleNode(n.defId);
              }}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx="9"
                class="pt-node-box"
                class:verb={n.isVerb}
                style="--node-col:{v.color}"
              />
              <svg
                x="9"
                y={(NODE_H - 22) / 2}
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke={v.color}
                stroke-width="1.6"
                stroke-linejoin="round"
              >
                {@html v.glyph}
              </svg>
              <foreignObject x="38" y="0" width={NODE_W - 44} height={NODE_H}>
                <div class="pt-label" xmlns="http://www.w3.org/1999/xhtml">
                  <span class="pt-node-name">{n.name}</span>
                  <span class="pt-node-cat">{n.category}</span>
                </div>
              </foreignObject>
            </g>
          {/each}
        </g>
      </svg>
    </div>

    <footer class="pt-foot">
      Drag to pan · scroll to zoom · click a card to trace its connections · toggle
      a relation in the legend to re-flow.
    </footer>
  </div>
</div>

<style>
.pt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.78);
  backdrop-filter: blur(3px);
  animation: pt-fade 0.16s ease both;
}
@keyframes pt-fade {
  from {
    opacity: 0;
  }
}
.pt-panel {
  position: relative;
  width: min(96rem, 100%);
  height: min(92vh, 60rem);
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  overflow: hidden;
}
.pt-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.1rem 1.4rem 0.8rem;
  border-bottom: 1px solid var(--panel-edge);
}
.pt-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 0.6rem;
  color: var(--astral);
  margin: 0 0 0.3rem;
}
.pt-titles h2 {
  font-family: var(--display);
  font-weight: 900;
  font-size: 1.7rem;
  margin: 0;
  background: linear-gradient(180deg, #fbf4e2 8%, var(--brass) 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.pt-controls {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.pt-count {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--ink-faint);
}
.pt-btn {
  appearance: none;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(20, 26, 46, 0.7);
  color: var(--ink-soft);
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.78rem;
}
.pt-btn:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
}
.pt-close {
  appearance: none;
  border: none;
  background: none;
  color: var(--ink-faint);
  font-size: 1.6rem;
  line-height: 1;
  padding: 0 0.3rem;
}
.pt-close:hover {
  color: var(--ink);
}
.pt-legend {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.7rem 1.4rem;
  border-bottom: 1px solid var(--panel-edge);
}
.pt-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(20, 26, 46, 0.6);
  color: var(--ink-soft);
  font-family: var(--mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pt-chip.off {
  opacity: 0.4;
}
.pt-swatch {
  width: 11px;
  height: 11px;
  border-radius: 3px;
}
.pt-canvas {
  flex: 1 1 auto;
  min-height: 0;
  cursor: grab;
  background:
    radial-gradient(circle at 50% 40%, rgba(116, 199, 214, 0.05), transparent 70%),
    var(--void);
  touch-action: none;
}
.pt-canvas.dragging {
  cursor: grabbing;
}
.pt-node {
  cursor: pointer;
}
.pt-node-box {
  fill: rgba(14, 18, 34, 0.92);
  stroke: var(--node-col);
  stroke-width: 1.3;
}
.pt-node-box.verb {
  fill: rgba(23, 29, 52, 0.96);
  stroke-width: 2;
}
.pt-node.active .pt-node-box {
  stroke: var(--ink);
  stroke-width: 2.4;
}
.pt-label {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding-right: 8px;
  overflow: hidden;
  box-sizing: border-box;
}
.pt-node-name {
  color: var(--ink);
  font-family: var(--body);
  font-weight: 600;
  font-size: 12px;
  line-height: 1.12;
  /* wrap to at most two lines, then ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pt-node-cat {
  color: var(--ink-faint);
  font-family: var(--mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pt-foot {
  flex: 0 0 auto;
  padding: 0.6rem 1.4rem;
  border-top: 1px solid var(--panel-edge);
  font-family: var(--mono);
  font-size: 0.66rem;
  color: var(--ink-faint);
}
</style>
