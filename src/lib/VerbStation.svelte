<script lang="ts">
// A verb card: a brass machine sitting on the felt. It shows its typed holes
// (open sockets you drag arguments into), a countdown ring while a call runs,
// and an output tray that back-pressures when full. All authoritative state
// comes in as props from the Board; this component only draws and forwards the
// pointer events that begin a drag on a slotted or produced card.
import type { Card, CardDef, SlotDef } from "../module_bindings/types";
import { visualFor, formatRemaining } from "./catalogue";
import CardToken from "./CardToken.svelte";

let {
  def,
  state,
  progress,
  remainingMs,
  slots,
  slotted,
  outputs,
  defsById,
  dragDefId,
  dragCategory,
  rejectingId,
  onSlottedPointerDown,
  onOutputPointerDown,
}: {
  def: CardDef;
  state: string; // 'assembling' | 'ongoing' | 'stalled'
  progress: number; // 0..1
  remainingMs: number;
  slots: SlotDef[];
  slotted: Map<number, Card>;
  outputs: Card[];
  defsById: Map<string, CardDef>;
  dragDefId: string | null;
  dragCategory: string | null;
  rejectingId: bigint | null;
  onSlottedPointerDown: (e: PointerEvent, card: Card) => void;
  onOutputPointerDown: (e: PointerEvent, card: Card) => void;
} = $props();

const v = $derived(visualFor(def.defId, def.category));

// Countdown ring geometry.
const R = 30;
const CIRC = 2 * Math.PI * R;

const isOngoing = $derived(state === "ongoing");
const isStalled = $derived(state === "stalled");

// Does an empty, assembling hole accept the card currently being dragged?
function accepts(slot: SlotDef): boolean {
  if (!dragDefId || state !== "assembling") return false;
  if (slotted.has(slot.slotIndex)) return false;
  return (
    slot.accepts.includes(dragDefId) ||
    (dragCategory !== null && slot.accepts.includes(dragCategory))
  );
}

// The whole card is the drop target, so it lights up as a unit when any open
// socket would take the dragged card.
const armed = $derived(dragDefId !== null && slots.some(accepts));

function nameOf(defId: string): string {
  return defsById.get(defId)?.name ?? defId;
}
function categoryOf(defId: string): string {
  return defsById.get(defId)?.category ?? "";
}

// The output tray draws `outputCap` cells; fill from the left.
const trayCells = $derived(
  Array.from({ length: def.outputCap }, (_, i) => outputs[i] ?? null),
);

const stateLabel = $derived(
  isOngoing ? "running" : isStalled ? "tray full" : "ready",
);
</script>

<div
  class="station"
  class:ongoing={isOngoing}
  class:stalled={isStalled}
  class:armed
  style="--tint: {v.color}"
>
  <header>
    <div class="badge">
      <svg class="ring" viewBox="0 0 72 72" aria-hidden="true">
        <circle class="ring-track" cx="36" cy="36" r={R} />
        {#if isOngoing}
          <circle
            class="ring-fill"
            cx="36"
            cy="36"
            r={R}
            stroke-dasharray={CIRC}
            stroke-dashoffset={CIRC * (1 - Math.min(1, Math.max(0, progress)))}
          />
        {/if}
      </svg>
      <div class="glyph">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true">
          {@html v.glyph}
        </svg>
      </div>
    </div>
    <div class="heading">
      <h3>{def.name}</h3>
      <div class="status">
        <span class="dot"></span>
        {#if isOngoing}
          <span class="timer">{formatRemaining(remainingMs)}</span>
        {:else}
          <span class="label">{stateLabel}</span>
        {/if}
      </div>
    </div>
  </header>

  {#if slots.length > 0}
    <div class="holes">
      {#each slots as slot (slot.id)}
        {@const card = slotted.get(slot.slotIndex)}
        <div class="hole" class:filled={!!card} class:open={accepts(slot)}>
          {#if card}
            <div
              class="slotted-card"
              class:reject={rejectingId === card.id}
              role="button"
              tabindex="0"
              onpointerdown={(e) => onSlottedPointerDown(e, card)}
            >
              <CardToken
                defId={card.defId}
                name={nameOf(card.defId)}
                category={categoryOf(card.defId)}
                size="sm"
              />
            </div>
          {:else}
            <div class="hole-empty">
              <span class="hole-mark">{slot.required ? "✶" : "○"}</span>
              <div class="accepts">
                {#each slot.accepts as a}
                  <span class="chip">{a}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if def.outputCap > 0}
  <div class="tray">
    <div class="tray-rail">
      {#each trayCells as cell, i (i)}
        <div class="cell" class:full={!!cell}>
          {#if cell}
            <div
              class="out-card"
              class:reject={rejectingId === cell.id}
              role="button"
              tabindex="0"
              title="Drag out to collect"
              onpointerdown={(e) => onOutputPointerDown(e, cell)}
            >
              <CardToken
                defId={cell.defId}
                name={nameOf(cell.defId)}
                category={categoryOf(cell.defId)}
                size="sm"
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <span class="tray-label">output · {outputs.length}/{def.outputCap}</span>
  </div>
  {/if}
</div>

<style>
.station {
  position: relative;
  width: max-content;
  min-width: 200px;
  padding: 0.85rem 0.95rem 0.7rem;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 245, 220, 0.06), transparent 24%),
    linear-gradient(180deg, #20263f, #161b30);
  border: 1px solid rgba(203, 166, 90, 0.4);
  box-shadow:
    0 1px 0 rgba(234, 210, 154, 0.18) inset,
    0 26px 44px -22px rgba(0, 0, 0, 0.9);
  color: var(--ink);
  touch-action: none;
}
/* brass corner rivets */
.station::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 14px;
  border: 1px solid rgba(203, 166, 90, 0.14);
  pointer-events: none;
}

.station.ongoing {
  border-color: rgba(116, 199, 214, 0.55);
  box-shadow:
    0 0 0 1px rgba(116, 199, 214, 0.18),
    0 0 38px -10px rgba(116, 199, 214, 0.45),
    0 26px 44px -22px rgba(0, 0, 0, 0.9);
}
.station.stalled {
  border-color: rgba(239, 122, 82, 0.5);
}
/* the whole card is the drop target — light it up as one when armed */
.station.armed {
  border-color: var(--astral-bright);
  box-shadow:
    0 0 0 2px rgba(116, 199, 214, 0.35),
    0 0 46px -6px rgba(116, 199, 214, 0.65),
    0 26px 44px -22px rgba(0, 0, 0, 0.9);
  transform: translateY(-3px);
}
.station {
  transition:
    transform 0.14s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
}

header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.badge {
  position: relative;
  width: 60px;
  height: 60px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
}
.ring {
  position: absolute;
  inset: -6px;
  width: 72px;
  height: 72px;
  transform: rotate(-90deg);
}
.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 3;
}
.ring-fill {
  fill: none;
  stroke: var(--astral-bright);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.12s linear;
  filter: drop-shadow(0 0 5px rgba(116, 199, 214, 0.8));
}
.glyph {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tint);
  background: radial-gradient(circle at 50% 35%, #2a3150, #161b2e);
  border: 1px solid rgba(203, 166, 90, 0.3);
}
.glyph svg {
  width: 30px;
  height: 30px;
}
.ongoing .glyph {
  animation: breathe 2.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    filter: drop-shadow(0 0 8px rgba(116, 199, 214, 0.6));
  }
}

.heading h3 {
  font-size: 1.18rem;
  color: var(--brass-bright);
  letter-spacing: 0.01em;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.15rem;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ink-faint);
  box-shadow: 0 0 0 0 transparent;
}
.ongoing .dot {
  background: var(--astral-bright);
  box-shadow: 0 0 9px 1px var(--astral);
}
.stalled .dot {
  background: var(--ember);
  box-shadow: 0 0 9px 1px var(--ember);
}
.timer {
  font-family: var(--mono);
  font-size: 0.92rem;
  color: var(--astral-bright);
  letter-spacing: -0.02em;
}
.label {
  font-family: var(--mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
}
.stalled .label {
  color: var(--ember);
}

.holes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
  /* keep many-holed verbs (e.g. the Agency's ten Coin holes) to a tidy grid
     rather than one runaway row */
  max-width: 430px;
}
.hole {
  position: relative;
  width: 78px;
  min-height: 96px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  padding: 4px;
  border: 1.5px dashed rgba(201, 214, 255, 0.22);
  background: rgba(7, 10, 20, 0.5);
  box-shadow: 0 8px 14px -10px rgba(0, 0, 0, 0.9) inset;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.hole.filled {
  border-style: solid;
  border-color: rgba(203, 166, 90, 0.3);
  background: rgba(7, 10, 20, 0.2);
}
.hole.open {
  border-color: var(--astral-bright);
  box-shadow:
    0 0 0 1px rgba(116, 199, 214, 0.3),
    0 0 20px -3px rgba(116, 199, 214, 0.6);
  transform: translateY(-2px);
}
.hole-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  color: var(--ink-faint);
}
.hole-mark {
  font-size: 1.1rem;
  color: rgba(201, 214, 255, 0.4);
}
.open .hole-mark {
  color: var(--astral-bright);
}
.accepts {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: center;
}
.chip {
  font-family: var(--mono);
  font-size: 0.55rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 5px;
  color: var(--ink-soft);
  background: rgba(201, 214, 255, 0.08);
  border: 1px solid rgba(201, 214, 255, 0.12);
}
.slotted-card {
  cursor: grab;
}
.slotted-card.reject,
.out-card.reject {
  animation: reject 0.46s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.tray {
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(203, 166, 90, 0.16);
}
.tray-rail {
  display: flex;
  gap: 5px;
}
.cell {
  width: 30px;
  height: 38px;
  border-radius: 7px;
  border: 1px solid rgba(201, 214, 255, 0.1);
  background: rgba(7, 10, 20, 0.45);
  position: relative;
}
.cell.full {
  border: none;
  background: transparent;
  width: 64px;
  height: 80px;
}
.out-card {
  cursor: grab;
  animation: pop 0.28s cubic-bezier(0.2, 1.3, 0.5, 1);
}
@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
.tray-label {
  display: block;
  margin-top: 0.4rem;
  font-family: var(--mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
</style>
