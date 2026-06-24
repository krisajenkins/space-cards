<script lang="ts">
// The tabletop. Reads the player's live game state through the `my_*` views and
// the public catalogue, lays cards out in free board-space, and turns pointer
// drags into the two reducer calls the engine understands:
//   • drop a loose card on a verb's socket  → slot_card
//   • drop a card anywhere else              → move_card (reposition / unslot / collect)
// A local requestAnimationFrame clock drives the countdown rings; the server
// only tells us when a call ends (`situation.endsAt`), so we animate toward it.
import { useTable, useReducer } from "spacetimedb/svelte";
import { tables, reducers } from "../module_bindings";
import type {
  Card,
  CardDef,
  SlotDef,
  Situation,
  Slotted,
  Tabletop,
  Output,
} from "../module_bindings/types";
import { placeOf, stateOf, microsToMillis, type RunState } from "./catalogue";
import CardToken from "./CardToken.svelte";
import VerbStation from "./VerbStation.svelte";
import Warehouse from "./Warehouse.svelte";

let { boardId }: { boardId: bigint } = $props();

// Inset so a card seeded at board-space (0,0) doesn't hug the corner.
const PAD = 56;

// ── Zoom-to-fit (local, client-only view transform) ──────────────────────────
// The server settles where every card SITS; this only fits the *camera* to them.
// We never relayout here — we scale + translate the content layer so the whole
// tableau is visible, re-fitting whenever cards appear / move / grow / vanish or
// the viewport resizes. Pure CSS transform: no reducer, no layout, no overlap math.
const FIT_MARGIN = 28; // breathing room kept around the fitted tableau (screen px)
const MAX_SCALE = 1; // fit means shrink-to-fit; never blow a tiny board up past 1×

const [cardDefs] = useTable(tables.cardDef);
const [slotDefs] = useTable(tables.slotDef);
const [cards] = useTable(tables.myCards);
const [situations] = useTable(tables.mySituations);

const slotCard = useReducer(reducers.slotCard);
const collectAndSlot = useReducer(reducers.collectAndSlot);
const moveCard = useReducer(reducers.moveCard);
const houseCard = useReducer(reducers.houseCard);
const unhouseCard = useReducer(reducers.unhouseCard);

// ── Catalogue lookups ──────────────────────────────────────────────────────
const defsById = $derived(
  new Map<string, CardDef>($cardDefs.map((d) => [d.defId, d])),
);
const slotsByDef = $derived.by(() => {
  const m = new Map<string, SlotDef[]>();
  for (const s of $slotDefs) {
    const arr = m.get(s.defId) ?? [];
    arr.push(s);
    m.set(s.defId, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.slotIndex - b.slotIndex);
  return m;
});

// ── Board state ────────────────────────────────────────────────────────────
const onBoard = $derived($cards.filter((c) => c.boardId === boardId));
const looseCards = $derived(onBoard.filter((c) => placeOf(c) === "tabletop"));
// Only tabletop verbs are stations. A verb can now also sit in a tray (a Seed
// the Forest produced) — those render as that tray's output token, not as a
// broken station with no position.
const verbCards = $derived(
  onBoard.filter(
    (c) => defsById.get(c.defId)?.isVerb && placeOf(c) === "tabletop",
  ),
);
const situationsByCard = $derived(
  new Map<bigint, Situation>(
    $situations.filter((s) => s.boardId === boardId).map((s) => [s.cardId, s]),
  ),
);

// Location-value accessors (the sum type's payload varies by tag). The caller
// guards on `placeOf(c)` first, so each accessor asserts the matching variant.
// We assert rather than narrow on `location.tag` because the generated tag may
// arrive capitalised or lower-cased (see catalogue's placeOf) — a `===` check
// against either spelling is unreliable, so the typed cast carries the
// invariant the call site has already established.
const verbOf = (c: Card): bigint => (c.location.value as Slotted | Output).verbCardId;
const slotOf = (c: Card): number => (c.location.value as Slotted).slotIndex;
const txOf = (c: Card): number => (c.location.value as Tabletop).x;
const tyOf = (c: Card): number => (c.location.value as Tabletop).y;
// A housed card's warehouse id. Generated tag is `Housed`/`housed`; placeOf
// guards first, so we cast to the payload shape (mirrors the accessors above).
const whOf = (c: Card): bigint =>
  (c.location.value as { warehouseCardId: bigint }).warehouseCardId;

// Paint loose cards top-to-bottom by y so a server-stacked pile (a straight
// vertical fan) layers correctly: the card lower on screen paints last, i.e. in
// front, showing just the top sliver of each card above it. Without this, paint
// order followed array/id order and a pile's overlap looked arbitrary. Ties broken
// by x then id so the order is stable. Keyed by id in the {#each}, so a reorder is
// a cheap DOM move, not a re-render.
const looseByDepth = $derived(
  [...looseCards].sort(
    (a, b) =>
      tyOf(a) - tyOf(b) ||
      txOf(a) - txOf(b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  ),
);

// Warehouses are inert tabletop cards rendered with their own component (a crate
// holding mini housed-cards), so they're pulled out of the plain-token loop below.
const warehouseCards = $derived(
  looseCards.filter((c) => c.defId === "warehouse"),
);
// The factory cards stored inside a given warehouse (location `housed`).
function housedFor(warehouseId: bigint): Card[] {
  return onBoard.filter(
    (c) => placeOf(c) === "housed" && whOf(c) === warehouseId,
  );
}

function slottedFor(verbId: bigint): Map<number, Card> {
  const m = new Map<number, Card>();
  for (const c of onBoard) {
    if (placeOf(c) === "slotted" && verbOf(c) === verbId) m.set(slotOf(c), c);
  }
  return m;
}
function outputsFor(verbId: bigint): Card[] {
  return onBoard.filter((c) => placeOf(c) === "output" && verbOf(c) === verbId);
}

// ── Card footprints (mirror of the server's max-size estimate) ───────────────
// The server reserves space for each card's FULLEST state (every hole shown, the
// output tray full) so the layout never reshuffles as trays fill — see
// docs/LAYOUT.md and spacetimedb/src/engine/layout.ts `footprint()`. The zoom-fit bbox
// must reserve the same maximal box, or the camera would clip a card the moment
// its tray grows. This is a faithful port of that server formula (board-space px).
const TOKEN_W = 130;
const TOKEN_H = 160;
function footprintOf(c: Card): { w: number; h: number } {
  const def = defsById.get(c.defId);
  // Warehouse: a 3×2 grid of ~144×176 mini housed-cards + header — mirrors
  // layout.ts footprint() so the zoom-fit reserves the same box.
  if (c.defId === "warehouse") {
    const gridW = 3 * 144 + 2 * 10;
    const gridH = 2 * 176 + 1 * 10;
    return { w: gridW + 32, h: gridH + 64 + 28 };
  }
  if (!def || !def.isVerb) return { w: TOKEN_W, h: TOKEN_H };
  const allSlots = slotsByDef.get(def.defId) ?? [];
  const hasBay = allSlots.some((s) => s.droneLevel > 0);
  const slotCount = allSlots.filter((s) => s.droneLevel === 0).length;
  const perRow = Math.min(slotCount, 5);
  const holeRows = slotCount > 0 ? Math.ceil(slotCount / 5) : 0;
  const holesW = perRow > 0 ? perRow * 78 + (perRow - 1) * 8 : 0;
  const holesH = holeRows > 0 ? holeRows * 96 + (holeRows - 1) * 8 : 0;
  const cap = def.outputCap;
  const trayW = cap > 0 ? cap * 64 + (cap - 1) * 5 : 0;
  const trayH = cap > 0 ? 80 + 30 : 0;
  const header = hasBay ? 120 : 64;
  const w = Math.max(220, holesW, trayW) + 32 + (hasBay ? 96 : 0);
  const h = header + (holesH ? holesH + 14 : 0) + (trayH ? trayH + 14 : 0) + 28;
  return { w, h };
}

// Bounding box of every rendered tabletop card, in board space (the same space
// cards render in: `left/top = tx + PAD`). Keyed off the card set, their
// positions, and — via footprintOf → slotsByDef/defsById — their sizes, so it
// re-derives whenever any of those change. null when the board is empty.
//
// Piles need no special-casing here: stacking is server-side (each pile member
// keeps its own fanned `tabletop {x,y}` — see docs/LAYOUT.md), so iterating every
// loose token already covers a deep pile's lowest card, and the camera fits it.
const bbox = $derived.by(() => {
  const placed = [...verbCards, ...looseCards.filter((c) => !defsById.get(c.defId)?.isVerb)];
  if (placed.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of placed) {
    const x = txOf(c) + PAD;
    const y = tyOf(c) + PAD;
    const { w, h } = footprintOf(c);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  return { minX, minY, maxX, maxY };
});

// Viewport (the .board element) size — tracked with a ResizeObserver so a window
// resize / panel toggle re-fits. Set in an $effect below.
let viewW = $state(0);
let viewH = $state(0);

// The fit transform: shrink (never enlarge past MAX_SCALE) the content layer so
// the whole bbox fits the viewport with FIT_MARGIN of slack, and centre it.
const fit = $derived.by(() => {
  const b = bbox;
  if (!b || viewW === 0 || viewH === 0) return { scale: 1, ox: 0, oy: 0 };
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const avW = Math.max(1, viewW - FIT_MARGIN * 2);
  const avH = Math.max(1, viewH - FIT_MARGIN * 2);
  const scale = Math.min(MAX_SCALE, avW / bw, avH / bh);
  // Centre the (scaled) bbox in the viewport: translate so b.minX*scale lands at
  // the left gap, then nudge by the leftover space / 2.
  const ox = (viewW - bw * scale) / 2 - b.minX * scale;
  const oy = (viewH - bh * scale) / 2 - b.minY * scale;
  return { scale, ox, oy };
});

// Track the viewport size so the fit re-runs on resize (window, panel toggles).
$effect(() => {
  if (!boardEl) return;
  const ro = new ResizeObserver(([entry]) => {
    const r = entry.contentRect;
    viewW = r.width;
    viewH = r.height;
  });
  ro.observe(boardEl);
  return () => ro.disconnect();
});

// ── Countdown clock ──────────────────────────────────────────────────────────
let now = $state(Date.now());
$effect(() => {
  let raf = 0;
  const tick = () => {
    now = Date.now();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
});

// First-sighting of each run captures its total duration so the ring can show a
// fraction (the server only gives us the end time). Plain Map → not reactive.
const runMeta = new Map<string, { end: number; total: number }>();
function runInfo(verbId: bigint): {
  state: RunState;
  progress: number;
  remainingMs: number;
} {
  const s = situationsByCard.get(verbId);
  if (!s) return { state: "assembling", progress: 0, remainingMs: 0 };
  if (stateOf(s) !== "ongoing" || !s.endsAt)
    return { state: stateOf(s), progress: 0, remainingMs: 0 };
  const end = microsToMillis(s.endsAt.microsSinceUnixEpoch);
  const key = `${verbId}:${end}`;
  let meta = runMeta.get(key);
  if (!meta) {
    meta = { end, total: Math.max(end - now, 1) };
    runMeta.set(key, meta);
  }
  const remainingMs = end - now;
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / meta.total));
  return { state: "ongoing", progress, remainingMs };
}

// ── Dragging ─────────────────────────────────────────────────────────────────
type Drag = {
  card: Card;
  def: CardDef | undefined;
  place: string;
  px: number; // current pointer position
  py: number;
};
let drag = $state<Drag | null>(null);
let boardEl: HTMLDivElement; // the viewport (clips + observed for size)
let contentEl: HTMLDivElement; // the transformed (scaled/translated) card layer
let ghostEl = $state<HTMLDivElement>();
// The card most recently bounced off an invalid target — flashed for feedback.
let rejecting = $state<bigint | null>(null);
let rejectTimer: ReturnType<typeof setTimeout> | undefined;

// The empty hole the pointer is currently hovering (its accept-criteria), if any.
// While set, every loose tabletop card that could fill it flashes — answering
// "what goes in here?" without picking anything up. Cleared on pointer-leave.
let hoveredHole = $state<{ accepts: string[]; droneLevel: number } | null>(null);

// Does a loose card match a hovered hole? Mirrors `firstValidSlot` / VerbStation's
// `accepts`: a drone bay (droneLevel > 0) takes a drone of sufficient Mk; an
// ordinary input hole takes a card by defId or category. (The few lines are
// duplicated, consistent with how the accept-test already appears in both places.)
function cardMatchesHole(
  card: Card,
  hole: { accepts: string[]; droneLevel: number },
): boolean {
  const def = defsById.get(card.defId);
  if (!def) return false;
  if (hole.droneLevel > 0) {
    return def.category === "drone" && def.droneLevel >= hole.droneLevel;
  }
  return hole.accepts.includes(card.defId) || hole.accepts.includes(def.category);
}

// The card ids that should flash for the hovered hole: every card that could fill
// it without being picked up first — loose on the table, or sitting in another
// verb's output tray (an "outbox"), since a tray card collect-and-slots in one go.
const flashing = $derived.by(() => {
  if (!hoveredHole) return new Set<bigint>();
  const ids = new Set<bigint>();
  for (const c of looseCards) {
    const d = defsById.get(c.defId);
    if (d && !d.isVerb && cardMatchesHole(c, hoveredHole)) ids.add(c.id);
  }
  for (const c of onBoard) {
    if (placeOf(c) === "output" && cardMatchesHole(c, hoveredHole)) ids.add(c.id);
  }
  return ids;
});

// Any non-verb card can be slotted (output/slotted cards collect first), and so
// can a drone — itself a verb, but one that belongs in a machine's bay. Arm the
// highlight for whichever of those is in hand. Other verbs (machines) only
// reposition, so they don't arm any sockets.
const dragDefId = $derived(
  drag && (!drag.def?.isVerb || drag.def?.category === "drone")
    ? drag.card.defId
    : null,
);
const dragCategory = $derived(
  dragDefId ? (defsById.get(dragDefId)?.category ?? null) : null,
);

function startDrag(e: PointerEvent, card: Card) {
  if (e.button !== 0) return;
  e.preventDefault();
  drag = {
    card,
    def: defsById.get(card.defId),
    place: placeOf(card),
    px: e.clientX,
    py: e.clientY,
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

// Slotted/output children sit inside a station whose wrapper is itself
// draggable — stop the event so grabbing a child doesn't drag the machine.
function startDragChild(e: PointerEvent, card: Card) {
  e.stopPropagation();
  startDrag(e, card);
}

function onMove(e: PointerEvent) {
  if (!drag) return;
  drag.px = e.clientX;
  drag.py = e.clientY;
}

// The first open socket on a verb that will accept this card (lowest slotIndex),
// or null if the verb can't take it right now.
function firstValidSlot(verbId: bigint, card: Card): number | null {
  const verbCard = onBoard.find((c) => c.id === verbId);
  if (!verbCard) return null;
  // Any live verb with a free, accepting hole takes the card — including one
  // mid-run, so you can keep filling the Market's inbox while it sells.
  const s = situationsByCard.get(verbId);
  if (!s) return null;
  const filled = slottedFor(verbId);
  const cdef = defsById.get(card.defId);
  for (const slot of slotsByDef.get(verbCard.defId) ?? []) {
    if (filled.has(slot.slotIndex)) continue;
    // A drone bay (droneLevel > 0) takes a drone of sufficient Mk and nothing
    // else; ordinary input holes never take a drone.
    if (slot.droneLevel > 0) {
      if (cdef && cdef.category === "drone" && cdef.droneLevel >= slot.droneLevel)
        return slot.slotIndex;
      continue;
    }
    if (
      slot.accepts.includes(card.defId) ||
      (cdef ? slot.accepts.includes(cdef.category) : false)
    ) {
      return slot.slotIndex;
    }
  }
  return null;
}

// Board-space coords for the dropped card's top-left. The drag ghost is centred
// on the cursor, so its visual top-left is the cursor minus half the ghost's
// rendered size — and that top-left is exactly where the card lands. This way
// the small ghost's corner predictably marks the corner of even a large card,
// rather than the card growing out from an unpredictable point.
//
// The content layer is scaled+translated by the zoom-to-fit transform, but we
// measure against `contentEl.getBoundingClientRect()`, whose left/top already
// FOLD IN that transform. So a screen point maps back to board space by
// subtracting the content's screen origin and dividing the screen distance by
// the fit scale. The ghost is `position: fixed` (outside the transform), so its
// half-size is a screen distance and is divided out by the same scale. PAD is the
// board-space inset cards render at (`left = tx + PAD`), subtracted last.
function dropCoords(d: Drag, ghostW: number, ghostH: number): { x: number; y: number } {
  const r = contentEl.getBoundingClientRect();
  // Read the LIVE rendered scale from the computed matrix, not `fit.scale`: a
  // re-fit transition may be in flight at drop time, and the rect's origin (r.left)
  // is the live, mid-transition value — so we must divide by the matching live
  // scale or the drop would land off by the transition's progress. `matrix(a,b,c,d,…)`
  // has the x-scale in `a`; an identity / "none" transform yields scale 1.
  const m = new DOMMatrixReadOnly(getComputedStyle(contentEl).transform);
  const s = m.a || 1;
  return {
    x: Math.max(0, (d.px - ghostW / 2 - r.left) / s - PAD),
    y: Math.max(0, (d.py - ghostH / 2 - r.top) / s - PAD),
  };
}

// Slot a card into a verb. A loose card uses slot_card; an output or slotted
// card uses collect_and_slot, which collects + slots in one transaction so the
// target verb can't change state between the two steps.
function assignToSlot(card: Card, verbId: bigint, slotIndex: number, place: string) {
  if (place === "tabletop") {
    slotCard({ cardId: card.id, verbCardId: verbId, slotIndex });
  } else {
    collectAndSlot({ cardId: card.id, verbCardId: verbId, slotIndex });
  }
}

// Rejected drop: leave the card exactly where it came from (its stored location
// is unchanged, so there's nothing to do on the server) and flash it in place so
// the rejection reads.
function flashReject(cardId: bigint) {
  rejecting = cardId;
  clearTimeout(rejectTimer);
  rejectTimer = setTimeout(() => (rejecting = null), 480);
}

// ── Tabletop layout ────────────────────────────────────────────────────────
// The client does NO automatic layout: a drop moves only the dropped card.
// Tidying the whole board (size-aware, overlap-free) is done authoritatively on
// the server via VPSC overlap removal — see docs/LAYOUT.md. This component is a
// pure renderer + drag→reducer translator. We snap the dropped card to the
// felt's 26px grid purely for visual rhythm.
const GRID = 26;
const snap = (v: number): number => Math.round(v / GRID) * GRID;

function onUp(e: PointerEvent) {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  // Drop a card into a hole and that empty hole-hover <div> is replaced by the
  // filled slotted-card one — so its pointerleave never fires and `hoveredHole`
  // would stay set, flashing every other matching card forever. A drop makes the
  // hover stale whatever the outcome, so clear it here (before any early return).
  hoveredHole = null;
  // Capture the ghost's rendered size before it unmounts (offset* ignores the
  // cosmetic rotate/scale, giving the token's true box).
  const ghostW = ghostEl?.offsetWidth ?? 0;
  const ghostH = ghostEl?.offsetHeight ?? 0;
  const d = drag;
  drag = null;
  if (!d) return;
  d.px = e.clientX;
  d.py = e.clientY;

  // House a factory: a VERB card dropped onto a Warehouse is stored inside it
  // (house_card). Checked before the socket logic so a machine landing on a
  // warehouse is housed rather than repositioned. A warehouse is inert (not a
  // verb), so dragging a warehouse never triggers this.
  if (d.def?.isVerb && placeOf(d.card) === "tabletop") {
    const whEl = document
      .elementsFromPoint(d.px, d.py)
      .find((el) => (el as HTMLElement).dataset?.warehouse) as
      | HTMLElement
      | undefined;
    if (whEl) {
      const warehouseCardId = BigInt(whEl.dataset.cardId!);
      if (warehouseCardId !== d.card.id) {
        houseCard({ cardId: d.card.id, warehouseCardId });
        return;
      }
    }
  }

  // The whole verb card is the drop target: a resource (or a drone, bound for the
  // bay) dropped anywhere on it auto-fills the first open socket. Machines never
  // slot — they reposition.
  if (!d.def?.isVerb || d.def?.category === "drone") {
    const stationEl = document
      .elementsFromPoint(d.px, d.py)
      .find((el) => (el as HTMLElement).dataset?.station) as
      | HTMLElement
      | undefined;
    if (stationEl) {
      const verbId = BigInt(stationEl.dataset.verbId!);
      // Dropped back on the verb it already occupies → leave it be.
      if (placeOf(d.card) === "slotted" && verbOf(d.card) === verbId) return;
      const slotIndex = firstValidSlot(verbId, d.card);
      if (slotIndex !== null) {
        assignToSlot(d.card, verbId, slotIndex, d.place);
        return;
      }
      // Won't fit → snap back to where it came from (no move), with a flash.
      flashReject(d.card.id);
      return;
    }
  }

  // Free drop on the table (reposition / unslot / collect): move just this card,
  // snapped to the grid. Nothing else moves on the client — the server tidies
  // the board.
  const { x, y } = dropCoords(d, ghostW, ghostH);
  moveCard({ cardId: d.card.id, x: snap(x), y: snap(y) });
}
</script>

<div class="board" class:dragging={!!drag} bind:this={boardEl}>
  {#if onBoard.length === 0}
    <div class="empty">
      <div class="empty-orb"></div>
      <p>Summoning the table…</p>
    </div>
  {/if}

  <!-- The card layer. Scaled + translated by the local zoom-to-fit transform so
       the whole tableau stays on-screen. transform-origin is the top-left so the
       offset maths in `fit` are in plain pre-scale board coordinates. -->
  <div
    class="content"
    bind:this={contentEl}
    style="transform: translate({fit.ox}px, {fit.oy}px) scale({fit.scale})"
  >
  <!-- Verb machines -->
  {#each verbCards as vc (vc.id)}
    {@const def = defsById.get(vc.defId)}
    {@const info = runInfo(vc.id)}
    {#if def}
      <div
        class="placed"
        role="button"
        tabindex="0"
        aria-label="{def.name} (drag to reposition)"
        data-station="1"
        data-verb-id={vc.id}
        data-card-id={vc.id}
        class:lifted={drag?.card.id === vc.id}
        style="left: {txOf(vc) + PAD}px; top: {tyOf(vc) + PAD}px"
        onpointerdown={(e) => startDrag(e, vc)}
      >
        <VerbStation
          {def}
          state={info.state}
          progress={info.progress}
          remainingMs={info.remainingMs}
          slots={slotsByDef.get(vc.defId) ?? []}
          slotted={slottedFor(vc.id)}
          outputs={outputsFor(vc.id)}
          {defsById}
          {dragDefId}
          {dragCategory}
          rejectingId={rejecting}
          flashingIds={flashing}
          onSlottedPointerDown={startDragChild}
          onOutputPointerDown={startDragChild}
          onHoleEnter={(hole) => (hoveredHole = hole)}
          onHoleLeave={() => (hoveredHole = null)}
        />
      </div>
    {/if}
  {/each}

  <!-- Warehouses: inert tabletop crates that house factory cards. A verb dropped
       onto one is housed (house_card); the eject control pulls a housed card back
       out (unhouse_card). data-warehouse marks it as a house-drop target. -->
  {#each warehouseCards as wh (wh.id)}
    {@const def = defsById.get(wh.defId)}
    {#if def}
      <div
        class="placed"
        role="button"
        tabindex="0"
        aria-label="{def.name} (drag to reposition · drop a factory on it to store it)"
        data-warehouse="1"
        data-card-id={wh.id}
        class:lifted={drag?.card.id === wh.id}
        style="left: {txOf(wh) + PAD}px; top: {tyOf(wh) + PAD}px"
        onpointerdown={(e) => startDrag(e, wh)}
      >
        <Warehouse
          {def}
          housed={housedFor(wh.id)}
          {defsById}
          runInfoFor={runInfo}
          onEject={(cardId) => unhouseCard({ cardId })}
        />
      </div>
    {/if}
  {/each}

  <!-- Loose resource cards (painted top-to-bottom so piles layer correctly) -->
  {#each looseByDepth as c (c.id)}
    {@const def = defsById.get(c.defId)}
    {#if def && !def.isVerb && c.defId !== "warehouse"}
      <div
        class="placed token-wrap"
        role="button"
        tabindex="0"
        aria-label="{def.name} (drag onto a verb card or across the table)"
        class:lifted={drag?.card.id === c.id}
        class:reject={rejecting === c.id}
        class:flashing={flashing.has(c.id)}
        data-card-id={c.id}
        style="left: {txOf(c) + PAD}px; top: {tyOf(c) + PAD}px"
        onpointerdown={(e) => startDrag(e, c)}
      >
        <CardToken defId={c.defId} name={def.name} category={def.category} />
      </div>
    {/if}
  {/each}
  </div>
  <!-- /.content -->

  <!-- Drag ghost -->
  {#if drag && drag.def}
    <div
      class="ghost"
      bind:this={ghostEl}
      style="left: {drag.px}px; top: {drag.py}px"
    >
      <CardToken
        defId={drag.card.defId}
        name={drag.def.name}
        category={drag.def.category}
        size={drag.place === "tabletop" && !drag.def.isVerb ? "md" : "sm"}
        grabbing
      />
    </div>
  {/if}

  <div class="hint" class:hidden={!!drag}>
    Drag a card into a glowing socket · pull output back to the table to collect
  </div>
</div>

<style>
.board {
  position: relative;
  width: 100%;
  height: 100%;
  /* The tableau is fitted to the viewport (zoom-to-fit), so it never overflows;
     clip rather than scroll. */
  overflow: hidden;
  /* faint engraved grid — the workbench surface. Stays fixed on the viewport
     (not inside the scaled .content), so the felt reads at a constant density. */
  background-image:
    radial-gradient(circle, var(--felt-line) 1px, transparent 1.4px);
  background-size: 26px 26px;
  background-position: 14px 14px;
}
.board.dragging {
  cursor: grabbing;
}

/* The scaled + translated card layer. transform-origin top-left keeps the
   offset maths in `fit` in plain board coordinates. The eased transform makes a
   re-fit (a card appearing / growing / moving) glide rather than jump. */
.content {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  /* size to nothing; children are absolutely positioned, so the layer is just a
     transform anchor. */
  width: 0;
  height: 0;
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.placed {
  position: absolute;
  cursor: grab;
  /* left/top animate so a card settling onto the grid — or being nudged aside
     by a neighbour's drop — slides into place rather than jumping. */
  transition:
    left 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
    top 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
    /* When the hole-flash animation is removed (hover ends) the browser eases
       from the last animated filter back to the resting one — long enough to read
       as a fade-out rather than a snap. */
    filter 0.35s ease,
    transform 0.12s ease;
}
.placed:active {
  cursor: grabbing;
}
.token-wrap:hover {
  transform: translateY(-3px) rotate(-1deg);
  filter: drop-shadow(0 12px 18px rgba(var(--shadow-rgb), 0.5));
  z-index: 5;
}
.placed.lifted {
  opacity: 0.28;
  filter: grayscale(0.3);
}
.placed.reject {
  animation: reject 0.46s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  z-index: 6;
}
/* Hovering an empty hole flashes every loose card that could fill it — a pulsing
   astral-cyan glow mirroring the open-hole / armed-station highlight, so the eye
   is drawn straight to the answer to "what goes in here?".

   The glow rides on an ::after overlay's OPACITY, not a filter animation on the
   card. That matters for the fade-out: a CSS `transition` only fires on a change
   to a *declared* value, and removing an animation is not one — so an earlier
   filter-keyframe version snapped back hard when hover ended (no declared change
   to transition). Toggling the overlay's declared opacity 0↔1 with the .flashing
   class IS a declared change, so it transitions in and out in every browser. The
   pulse is a second opacity animation layered on top; it only needs to look right
   while hovering, because the exit is carried by the opacity transition. The card
   itself gets a static brightness/saturate lift (also a declared change, so it
   eases out cleanly too). No geometry change — the hitbox never moves, which is
   what stops the pointerenter/leave oscillation an earlier `scale` version had. */
.placed.flashing {
  z-index: 6;
  filter: brightness(1.3) saturate(1.25);
}
.token-wrap::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 13px;
  pointer-events: none;
  z-index: -1;
  opacity: 0;
  box-shadow: 0 0 18px 3px rgba(var(--astral-rgb), 0.95);
  transition: opacity 0.32s ease;
}
.token-wrap.flashing::after {
  opacity: 1;
  animation: glow-pulse 0.9s ease-in-out infinite;
}
@keyframes glow-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.ghost {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  /* centre the (possibly collapsed) token on the cursor */
  transform: translate(-50%, -50%) rotate(-3deg) scale(1.04);
  filter: drop-shadow(0 24px 30px rgba(var(--shadow-rgb), 0.6));
}

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1rem;
  color: var(--ink-faint);
  font-family: var(--display);
  font-style: italic;
  font-size: 1.1rem;
}
.empty-orb {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, var(--astral), transparent 70%);
  animation: pulse 2.2s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(0.85);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.9;
  }
}

.hint {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: rgba(10, 13, 24, 0.7);
  border: 1px solid var(--panel-edge);
  backdrop-filter: blur(8px);
  font-size: 0.74rem;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.hint.hidden {
  opacity: 0;
}
</style>
