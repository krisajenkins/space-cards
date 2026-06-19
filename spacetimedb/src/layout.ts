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
import type { Ctx, Card } from "./types";

const MARGIN = 40; // keep the layout this far from the board's (0,0) origin
const PIN_WEIGHT = 1e9; // a pinned card's VPSC variable barely moves
const GUTTER = 16; // minimum visible gap kept between cards
const TOKEN_W = 130; // inert resource tokens / blueprints (CardToken md + air)
const TOKEN_H = 160;

// A card's tabletop (x,y), or null if it isn't on the tabletop.
function tabletopXY(c: Card): { x: number; y: number } | null {
  return c.location.tag === "tabletop" ? c.location.value : null;
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
function footprint(ctx: Ctx, c: Card): { w: number; h: number } {
  const def = ctx.db.cardDef.defId.find(c.defId);
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
  const cards = [...ctx.db.card.boardId.filter(boardId)].filter(
    (c) => c.location.tag === "tabletop",
  );
  if (cards.length < 2) return;
  // Deterministic, reproducible constraint generation.
  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Footprint rectangles at each card's current position, inflated by a GUTTER so
  // VPSC's zero-separation result still leaves a visible gap between cards.
  const rects = cards.map((c) => {
    const { w, h } = footprint(ctx, c);
    const p = tabletopXY(c)!;
    return new Rectangle(p.x, p.x + w + GUTTER, p.y, p.y + h + GUTTER);
  });

  const pinIdx =
    pinnedCardId === undefined
      ? -1
      : cards.findIndex((c) => c.id === pinnedCardId);

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

  // Write back only the cards that actually moved (≥1px), so a settled board
  // produces zero writes on re-run — re-running relayout is a safe no-op.
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const cur = tabletopXY(c)!;
    const nx = Math.round(rects[i].x + dx);
    const ny = Math.round(rects[i].y + dy);
    if (Math.abs(nx - cur.x) >= 1 || Math.abs(ny - cur.y) >= 1) {
      ctx.db.card.id.update({
        ...c,
        location: { tag: "tabletop", value: { x: nx, y: ny } },
      });
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
