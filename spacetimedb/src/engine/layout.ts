// ──────────────────────────────────────────────────────────────────────────
// Tabletop layout — authoritative, server-side, size-aware overlap removal.
// ──────────────────────────────────────────────────────────────────────────
// One pure pass, run inside a reducer transaction: read every tabletop card's
// position + authored footprint, remove all overlaps with MINIMUM displacement
// (so the board stays close to what the player already sees), and write the
// changed positions once. There is NO loop, NO timer, NO async round-trip — the
// instability of the old client-side watchdog came entirely from feeding a
// control loop stale, half-applied positions across the async DB. A single
// synchronous computation over one in-memory snapshot cannot diverge.
//
// The algorithm is VPSC (Variable Placement with Separation Constraints; Dwyer,
// Marriott & Stuckey, GD'05) via the `webcola` package — the canonical
// minimum-displacement rectangle overlap-removal solver. We import only the
// DOM-free `rectangle`/`vpsc` submodules so it bundles into the WASM module.
//
// Determinism (required of reducers): VPSC uses no RNG/clock; we iterate cards
// in a fixed sorted-by-id order so constraint generation is reproducible.
import {
  Rectangle,
  generateXConstraints,
  generateYConstraints,
} from "webcola/dist/src/rectangle";
import { Variable, Solver } from "webcola/dist/src/vpsc";
import { removeOverlaps } from "webcola/dist/src/rectangle";
import type { Ctx, Card } from "../platform/types";

const MARGIN = 40; // keep the layout this far from the board's (0,0) origin
const PIN_WEIGHT = 1e9; // a pinned card's VPSC variable barely moves
const GUTTER = 16; // minimum visible gap kept between cards
const TOKEN_W = 130; // inert resource tokens / blueprints (CardToken md + air)
const TOKEN_H = 160;

// Stacking: same-type inert tokens that are already near each other pile up into
// a vertical fan. STACK_RADIUS is the centre-to-centre distance under which two
// same-defId tokens are considered "adjacent" (≈ one token width). STACK_DX/DY
// are the per-card offsets of the fan: dx=0 keeps the pile a straight vertical
// column; dy is a small downward slip so you can see how deep it is.
const STACK_RADIUS = 130;
const STACK_DX = 0; // straight-down pile (no horizontal lean)
const STACK_DY = 14; // visible slip per card in the fan

// A card's tabletop (x,y), or null if it isn't on the tabletop.
function tabletopXY(c: Card): { x: number; y: number } | null {
  return c.location.tag === "tabletop" ? c.location.value : null;
}

// True if a card is a STACKABLE tabletop token: an inert (non-verb) resource card
// loose on the table. Verbs/machines (and drones, which are verbs) never pile.
function isStackable(ctx: Ctx, c: Card): boolean {
  if (c.location.tag !== "tabletop") return false;
  const def = ctx.db.cardDef.defId.find(c.defId);
  return !!def && !def.isVerb;
}

// Group adjacent same-defId stackable tabletop cards into clusters via union-find.
// Two cards join the same cluster when they share a defId AND their stored centres
// are within STACK_RADIUS — so a single resource type can form SEVERAL distinct
// piles in different board regions (proximity-based, not "all wood everywhere").
//
// Returns one entry per cluster: its member cards sorted by id (a stable bottom-
// of-pile / z-order), keyed by the cluster's lowest member id. Iterating the input
// in sorted-by-id order keeps cluster membership deterministic, matching relayout's
// constraint-generation discipline. Singletons (and every non-stackable card) are
// left out — callers handle those as ordinary one-card rects.
function clusterTabletop(ctx: Ctx, cards: Card[]): Map<bigint, Card[]> {
  const stackable = cards
    .filter((c) => isStackable(ctx, c))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Union-find over indices into `stackable`.
  const parent = stackable.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < stackable.length; i++) {
    const pi = tabletopXY(stackable[i])!;
    for (let j = i + 1; j < stackable.length; j++) {
      if (stackable[i].defId !== stackable[j].defId) continue;
      const pj = tabletopXY(stackable[j])!;
      const ddx = pi.x - pj.x;
      const ddy = pi.y - pj.y;
      if (ddx * ddx + ddy * ddy <= STACK_RADIUS * STACK_RADIUS) union(i, j);
    }
  }

  const groups = new Map<number, Card[]>();
  for (let i = 0; i < stackable.length; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(stackable[i]);
    groups.set(r, arr);
  }

  const out = new Map<bigint, Card[]>();
  for (const members of groups.values()) {
    if (members.length < 2) continue; // singletons aren't piles
    members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out.set(members[0].id, members);
  }
  return out;
}

// The cluster a given card belongs to (its full pile, sorted by id), or just
// [card] if it is a singleton / not stackable. Used by moveCard to drag a whole
// pile as a unit — it MUST share clusterTabletop's adjacency definition exactly.
export function clusterOf(ctx: Ctx, boardId: bigint, card: Card): Card[] {
  if (!isStackable(ctx, card)) return [card];
  const cards = [...ctx.db.card.boardId.filter(boardId)].filter(
    (c) => c.location.tag === "tabletop",
  );
  for (const members of clusterTabletop(ctx, cards).values()) {
    if (members.some((m) => m.id === card.id)) return members;
  }
  return [card];
}

// A card's MAXIMUM rendered footprint (board-space px) — sized for the fullest
// the card ever gets: every hole shown AND the output tray full. Because tray
// cells grow as they fill (30×38 → 64×80, see VerbStation.svelte), a footprint
// sized for the *current* fill would change under the player and force the board
// to reshuffle every time a card is produced or collected. Sizing for the max
// makes the footprint CONSTANT: the layout is stable as trays fill, and packing
// can never overlap because the live card is always <= this box. Derived from
// outputCap + slot count (a deliberate generous over-estimate of the CSS) since
// the server has no DOM to measure.
// The Warehouse reserves room for its FULL contents: a 3×2 grid of mini housed
// cards (it caps at 6). Each mini card is ~144px wide × ~176px tall (a compact
// VerbStation-like view), laid out 3 to a row, plus the card's header band and
// padding. Sized to the MAX (6 housed) so the layout stays put as it fills —
// same footprint discipline as every verb. MUST match Warehouse.svelte's render.
const WAREHOUSE_COLS = 3;
const WAREHOUSE_ROWS = 2; // 3×2 = capacity 6
const MINI_W = 144;
const MINI_H = 176;
const MINI_GAP = 10;

function footprint(ctx: Ctx, c: Card): { w: number; h: number } {
  const def = ctx.db.cardDef.defId.find(c.defId);
  if (def && def.defId === "warehouse") {
    const gridW = WAREHOUSE_COLS * MINI_W + (WAREHOUSE_COLS - 1) * MINI_GAP;
    const gridH = WAREHOUSE_ROWS * MINI_H + (WAREHOUSE_ROWS - 1) * MINI_GAP;
    // + horizontal padding (32) and a header band (~64) + vertical padding (28).
    return { w: gridW + 32, h: gridH + 64 + 28 };
  }
  // The Escape win token renders at 2× (CardToken's "xl" size) to stay
  // prominent — its footprint must double to match (see CardToken.svelte).
  if (def && def.defId === "escape") return { w: TOKEN_W * 2, h: TOKEN_H * 2 };
  if (!def || !def.isVerb) return { w: TOKEN_W, h: TOKEN_H };
  // Input holes only count toward the holes grid; a drone bay (droneLevel > 0)
  // renders separately, top-right of the header, so it adds to the header band,
  // not the .holes row.
  const allSlots = [...ctx.db.slotDef.defId.filter(def.defId)];
  const hasBay = allSlots.some((s) => s.droneLevel > 0);
  const slotCount = allSlots.filter((s) => s.droneLevel === 0).length;
  const perRow = Math.min(slotCount, 5); // .holes wraps ~5 to a 430px row
  const holeRows = slotCount > 0 ? Math.ceil(slotCount / 5) : 0;
  const holesW = perRow > 0 ? perRow * 78 + (perRow - 1) * 8 : 0; // 78px holes
  const holesH = holeRows > 0 ? holeRows * 96 + (holeRows - 1) * 8 : 0;
  const cap = def.outputCap;
  const trayW = cap > 0 ? cap * 64 + (cap - 1) * 5 : 0; // full cells are 64px
  const trayH = cap > 0 ? 80 + 30 : 0; // full cell + label/border
  // A drone bay adds a card-wide column to the header (and makes the header taller
  // when a drone is parked in it).
  const header = hasBay ? 120 : 64;
  const w = Math.max(220, holesW, trayW) + 32 + (hasBay ? 96 : 0);
  const h = header + (holesH ? holesH + 14 : 0) + (trayH ? trayH + 14 : 0) + 28;
  return { w, h };
}

// Re-pack every tabletop card on `boardId` so no two footprints overlap, moving
// cards as little as possible from where they are. If `pinnedCardId` is given
// (the card the player just dropped/created), it is held fixed and everything
// else gives way around it.
export function relayout(
  ctx: Ctx,
  boardId: bigint,
  pinnedCardId?: bigint,
): void {
  const allTabletop = [...ctx.db.card.boardId.filter(boardId)].filter(
    (c) => c.location.tag === "tabletop",
  );
  if (allTabletop.length < 2) return;

  // ── Cluster: pile adjacent same-type tokens. A pile contributes ONE rectangle
  // to the solver (its members move and fan together); every other card is its
  // own rect. `clusterByMember` maps each clustered card id → its cluster's
  // anchor id, so we can route the pin (below) to the right rect.
  const clusters = clusterTabletop(ctx, allTabletop);
  const clusterByMember = new Map<bigint, bigint>(); // memberId → anchorId
  for (const [anchorId, members] of clusters) {
    for (const m of members) clusterByMember.set(m.id, anchorId);
  }

  // The solver works over "units": either a singleton card or a whole cluster.
  // A unit is identified by its anchor card (the cluster's lowest-id member, or
  // the card itself for a singleton). Build them in sorted-by-id order so
  // constraint generation stays deterministic.
  type Unit = { anchor: Card; members: Card[] };
  const units: Unit[] = [];
  for (const c of allTabletop) {
    if (clusterByMember.has(c.id) && clusterByMember.get(c.id) !== c.id)
      continue; // a clustered card that isn't its anchor — folded into its unit
    const members = clusters.get(c.id);
    units.push({ anchor: c, members: members ?? [c] });
  }
  units.sort((a, b) =>
    a.anchor.id < b.anchor.id ? -1 : a.anchor.id > b.anchor.id ? 1 : 0,
  );

  // ── Collapse: one footprint rect per unit, anchored at the cluster's anchor
  // position. A pile's rect is INFLATED in height by the fan depth so the fanned
  // column still can't overlap a neighbour — VPSC sees one tall box per pile and
  // keeps the post-solve fan clear. Inflated by GUTTER too, as before.
  const rects = units.map((u) => {
    const { w, h } = footprint(ctx, u.anchor);
    const depth = u.members.length;
    const fanW = w + Math.abs(STACK_DX) * (depth - 1);
    const fanH = h + STACK_DY * (depth - 1);
    const p = tabletopXY(u.anchor)!;
    return new Rectangle(p.x, p.x + fanW + GUTTER, p.y, p.y + fanH + GUTTER);
  });

  // The pin: the dropped card may be a cluster member — pin its whole unit.
  const pinUnitAnchor =
    pinnedCardId === undefined
      ? undefined
      : (clusterByMember.get(pinnedCardId) ?? pinnedCardId);
  const pinIdx =
    pinUnitAnchor === undefined
      ? -1
      : units.findIndex((u) => u.anchor.id === pinUnitAnchor);

  removeOverlapsPinned(rects, pinIdx);

  // Keep the board on-screen with a SINGLE rigid translate — never a per-card
  // clamp. A per-card "max(0, …)" only ever pushes positive: relax legitimately
  // moves cards off the top/left to separate a cluster, the clamp shoves them
  // back, and the centroid ratchets toward +∞ (the x≈100k/y≈60k runaway we hit).
  // A rigid translate preserves every gap, fires only when something is off-edge,
  // and is idempotent at the fixpoint, so it cannot accumulate.
  let minX = Infinity;
  let minY = Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
  }
  const dx = minX < MARGIN ? MARGIN - minX : 0;
  const dy = minY < MARGIN ? MARGIN - minY : 0;

  // ── Fan + write-back. For a singleton the unit's settled rect IS its position.
  // For a pile, member[k] = anchor + k*offset — a PURE function of the cluster's
  // settled anchor, NOT of each card's current position. This is essential for
  // idempotence: computing the fan relative to the settled anchor means a second
  // relayout on a settled board recomputes the identical positions and writes
  // nothing. (Computing offsets relative to each card's *current* spot would drift
  // the pile a little every run and break the zero-writes guarantee LAYOUT.md
  // depends on.) Only cards that actually moved (≥1px) are written.
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const anchorX = Math.round(rects[i].x + dx);
    const anchorY = Math.round(rects[i].y + dy);
    for (let k = 0; k < u.members.length; k++) {
      const c = u.members[k];
      const cur = tabletopXY(c)!;
      const nx = anchorX + k * STACK_DX;
      const ny = anchorY + k * STACK_DY;
      if (Math.abs(nx - cur.x) >= 1 || Math.abs(ny - cur.y) >= 1) {
        ctx.db.card.id.update({
          ...c,
          location: { tag: "tabletop", value: { x: nx, y: ny } },
        });
      }
    }
  }
}

// VPSC overlap removal, separating one axis at a time. When a card is pinned we
// give its variable a dominating weight so the minimum-displacement solve holds
// it in place and moves its neighbours instead. With no pin this is exactly
// webcola's `removeOverlaps`.
function removeOverlapsPinned(rs: Rectangle[], pinIdx: number): void {
  if (pinIdx < 0) {
    removeOverlaps(rs);
    return;
  }
  let vs = rs.map((r) => new Variable(r.cx()));
  vs[pinIdx].weight = PIN_WEIGHT;
  let cs = generateXConstraints(rs, vs);
  new Solver(vs, cs).solve();
  vs.forEach((v, i) => rs[i].setXCentre(v.position()));

  vs = rs.map((r) => new Variable(r.cy()));
  vs[pinIdx].weight = PIN_WEIGHT;
  cs = generateYConstraints(rs, vs);
  new Solver(vs, cs).solve();
  vs.forEach((v, i) => rs[i].setYCentre(v.position()));
}
