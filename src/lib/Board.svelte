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
import type { Card, CardDef, SlotDef, Situation } from "../module_bindings/types";
import { placeOf, microsToMillis } from "./catalogue";
import CardToken from "./CardToken.svelte";
import VerbStation from "./VerbStation.svelte";

let { boardId }: { boardId: bigint } = $props();

// Inset so a card seeded at board-space (0,0) doesn't hug the corner.
const PAD = 56;

const [cardDefs] = useTable(tables.cardDef);
const [slotDefs] = useTable(tables.slotDef);
const [cards] = useTable(tables.myCards);
const [situations] = useTable(tables.mySituations);

const slotCard = useReducer(reducers.slotCard);
const collectAndSlot = useReducer(reducers.collectAndSlot);
const moveCard = useReducer(reducers.moveCard);

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

// Location-value accessors (the sum type's payload varies by tag).
const verbOf = (c: Card) => (c.location.value as any).verbCardId as bigint;
const slotOf = (c: Card) => (c.location.value as any).slotIndex as number;
const txOf = (c: Card) => (c.location.value as any).x as number;
const tyOf = (c: Card) => (c.location.value as any).y as number;

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
  state: string;
  progress: number;
  remainingMs: number;
} {
  const s = situationsByCard.get(verbId);
  if (!s) return { state: "assembling", progress: 0, remainingMs: 0 };
  if (s.state !== "ongoing" || !s.endsAt)
    return { state: s.state, progress: 0, remainingMs: 0 };
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
let boardEl: HTMLDivElement;
let ghostEl = $state<HTMLDivElement>();
// The card most recently bounced off an invalid target — flashed for feedback.
let rejecting = $state<bigint | null>(null);
let rejectTimer: ReturnType<typeof setTimeout> | undefined;

// Any non-verb card can be slotted now (output/slotted cards collect first), so
// arm the highlight for whatever resource card is in hand.
const dragDefId = $derived(
  drag && !drag.def?.isVerb ? drag.card.defId : null,
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
  const s = situationsByCard.get(verbId);
  if (!s || s.state !== "assembling") return null;
  const filled = slottedFor(verbId);
  const cdef = defsById.get(card.defId);
  for (const slot of slotsByDef.get(verbCard.defId) ?? []) {
    if (filled.has(slot.slotIndex)) continue;
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
function dropCoords(d: Drag, ghostW: number, ghostH: number): { x: number; y: number } {
  const r = boardEl.getBoundingClientRect();
  return {
    x: Math.max(0, d.px - ghostW / 2 - r.left + boardEl.scrollLeft - PAD),
    y: Math.max(0, d.py - ghostH / 2 - r.top + boardEl.scrollTop - PAD),
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

function onUp(e: PointerEvent) {
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  // Capture the ghost's rendered size before it unmounts (offset* ignores the
  // cosmetic rotate/scale, giving the token's true box).
  const ghostW = ghostEl?.offsetWidth ?? 0;
  const ghostH = ghostEl?.offsetHeight ?? 0;
  const d = drag;
  drag = null;
  if (!d) return;
  d.px = e.clientX;
  d.py = e.clientY;

  // The whole verb card is the drop target: a resource dropped anywhere on it
  // auto-fills the first open socket. Verb cards never slot — they reposition.
  if (!d.def?.isVerb) {
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

  // Free drop on the table (reposition / unslot / collect).
  const { x, y } = dropCoords(d, ghostW, ghostH);
  moveCard({ cardId: d.card.id, x, y });
}
</script>

<div class="board" class:dragging={!!drag} bind:this={boardEl}>
  {#if onBoard.length === 0}
    <div class="empty">
      <div class="empty-orb"></div>
      <p>Summoning the table…</p>
    </div>
  {/if}

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
          onSlottedPointerDown={startDragChild}
          onOutputPointerDown={startDragChild}
        />
      </div>
    {/if}
  {/each}

  <!-- Loose resource cards -->
  {#each looseCards as c (c.id)}
    {@const def = defsById.get(c.defId)}
    {#if def && !def.isVerb}
      <div
        class="placed token-wrap"
        role="button"
        tabindex="0"
        aria-label="{def.name} (drag onto a verb card or across the table)"
        class:lifted={drag?.card.id === c.id}
        class:reject={rejecting === c.id}
        style="left: {txOf(c) + PAD}px; top: {tyOf(c) + PAD}px"
        onpointerdown={(e) => startDrag(e, c)}
      >
        <CardToken defId={c.defId} name={def.name} category={def.category} />
      </div>
    {/if}
  {/each}

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
  overflow: auto;
  /* faint engraved grid — the workbench surface */
  background-image:
    radial-gradient(circle, var(--felt-line) 1px, transparent 1.4px);
  background-size: 26px 26px;
  background-position: 14px 14px;
}
.board.dragging {
  cursor: grabbing;
}

.placed {
  position: absolute;
  cursor: grab;
  transition:
    filter 0.15s ease,
    transform 0.12s ease;
}
.placed:active {
  cursor: grabbing;
}
.token-wrap:hover {
  transform: translateY(-3px) rotate(-1deg);
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.5));
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

.ghost {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  /* centre the (possibly collapsed) token on the cursor */
  transform: translate(-50%, -50%) rotate(-3deg) scale(1.04);
  filter: drop-shadow(0 24px 30px rgba(0, 0, 0, 0.6));
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
