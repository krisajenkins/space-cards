<script lang="ts">
// A Warehouse: a buildable crate that HOUSES factory cards to shrink the endgame
// tabletop. It renders as a single tabletop card whose body shows up to 6 nested
// mini housed-cards, each still ticking its own countdown ring so you can watch it
// make progress. Housing is pure layout relief — a housed factory keeps running
// (its situation/timer ticks server-side); this is just a compact view of those
// machines. All state arrives as props from the Board; this component draws and
// forwards the eject control (unhouse_card).
import type { Card, CardDef } from "../module_bindings/types";
import { visualFor, formatRemaining, type RunState } from "./catalogue";

let {
  def,
  housed,
  defsById,
  runInfoFor,
  onEject,
}: {
  def: CardDef;
  housed: Card[]; // the factory cards stored in this warehouse
  defsById: Map<string, CardDef>;
  // Live run state for a housed verb (Board owns the rAF clock + runMeta).
  runInfoFor: (cardId: bigint) => {
    state: RunState;
    progress: number;
    remainingMs: number;
  };
  onEject: (cardId: bigint) => void;
} = $props();

const v = $derived(visualFor(def.defId, def.category));

// Mini-card countdown ring geometry (smaller than VerbStation's).
const R = 18;
const CIRC = 2 * Math.PI * R;

function nameOf(defId: string): string {
  return defsById.get(defId)?.name ?? defId;
}
function visualOf(defId: string) {
  const d = defsById.get(defId);
  return visualFor(defId, d?.category ?? "");
}
</script>

<div class="warehouse" style="--tint: {v.color}">
  <header>
    <div class="badge" aria-hidden="true">
      {@html v.glyph}
    </div>
    <div class="heading">
      <h3>{def.name}</h3>
      <div class="count">{housed.length} / 6 housed</div>
    </div>
  </header>

  <div class="bays">
    {#each housed as c (c.id)}
      {@const info = runInfoFor(c.id)}
      {@const cv = visualOf(c.defId)}
      <div class="bay" class:ongoing={info.state === "ongoing"}
        class:stalled={info.state === "stalled"}>
        <button
          class="eject"
          type="button"
          title="Pull out onto the table"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => onEject(c.id)}
          aria-label="Eject {nameOf(c.defId)}"
        >⤴</button>
        <div class="mini-badge" style="--mtint: {cv.color}">
          <svg class="mini-ring" viewBox="0 0 48 48" aria-hidden="true">
            <circle class="ring-track" cx="24" cy="24" r={R} />
            {#if info.state === "ongoing"}
              <circle
                class="ring-fill"
                cx="24"
                cy="24"
                r={R}
                stroke-dasharray={CIRC}
                stroke-dashoffset={CIRC *
                  (1 - Math.min(1, Math.max(0, info.progress)))}
              />
            {/if}
          </svg>
          <div class="mini-glyph" aria-hidden="true">
            {@html cv.glyph}
          </div>
        </div>
        <div class="mini-name">{nameOf(c.defId)}</div>
        <div class="mini-status">
          {#if info.state === "ongoing"}
            <span class="mini-timer">{formatRemaining(info.remainingMs)}</span>
          {:else if info.state === "stalled"}
            <span class="mini-label stall">tray full</span>
          {:else}
            <span class="mini-label">ready</span>
          {/if}
        </div>
      </div>
    {/each}
    {#if housed.length === 0}
      <div class="empty">Drag a factory card here to store it.</div>
    {/if}
  </div>
</div>

<style>
.warehouse {
  position: relative;
  width: max-content;
  min-width: 200px;
  padding: 0.85rem 0.95rem 0.75rem;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 245, 220, 0.06), transparent 24%),
    linear-gradient(180deg, var(--machine-top), var(--machine-bottom));
  border: 1px solid rgba(var(--brass-rgb), 0.4);
  box-shadow:
    0 1px 0 rgba(var(--brass-bright-rgb), 0.18) inset,
    0 26px 44px -22px rgba(var(--shadow-rgb), 0.9);
  color: var(--ink);
  touch-action: none;
}
.warehouse::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 14px;
  border: 1px solid rgba(var(--brass-rgb), 0.14);
  pointer-events: none;
}

header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.badge {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tint);
  background: radial-gradient(circle at 50% 35%, var(--socket-rim), var(--socket-pit));
  border: 1px solid rgba(var(--brass-rgb), 0.3);
}
/* :global — glyph injected via {@html}, so the scoping attribute never lands on it. */
.badge :global(svg) {
  width: 28px;
  height: 28px;
}
.heading h3 {
  font-size: 1.18rem;
  color: var(--brass-bright);
  letter-spacing: 0.01em;
}
.count {
  font-family: var(--mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  margin-top: 0.15rem;
}

/* Up to 6 mini bays in a 3-wide grid (matches layout.ts footprint). */
.bays {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(var(--brass-rgb), 0.16);
}
.bay {
  position: relative;
  width: 134px;
  min-height: 156px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.6rem 0.4rem;
  border: 1px solid rgba(var(--edge-rgb), 0.12);
  background: rgba(var(--abyss-rgb), 0.45);
}
.bay.ongoing {
  border-color: rgba(var(--astral-rgb), 0.45);
  box-shadow: 0 0 22px -10px rgba(var(--astral-rgb), 0.5);
}
.bay.stalled {
  border-color: rgba(var(--ember-rgb), 0.45);
}
.eject {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--panel-edge);
  background: rgba(10, 13, 24, 0.7);
  color: var(--ink-soft);
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}
.eject:hover {
  color: var(--astral);
  border-color: var(--astral);
}
.eject:active {
  transform: scale(0.92);
}

.mini-badge {
  position: relative;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-top: 0.2rem;
}
.mini-ring {
  position: absolute;
  inset: 0;
  width: 48px;
  height: 48px;
  transform: rotate(-90deg);
}
.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 2.5;
}
.ring-fill {
  fill: none;
  stroke: var(--astral-bright);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.12s linear;
  filter: drop-shadow(0 0 4px rgba(var(--astral-rgb), 0.8));
}
.mini-glyph {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--mtint);
  background: radial-gradient(circle at 50% 35%, var(--socket-rim), var(--socket-pit));
  border: 1px solid rgba(var(--brass-rgb), 0.3);
}
.mini-glyph :global(svg) {
  width: 20px;
  height: 20px;
}
.mini-name {
  font-family: var(--display);
  font-weight: 600;
  font-size: 0.74rem;
  line-height: 1.05;
  text-align: center;
  color: var(--brass-bright);
}
.mini-status {
  margin-top: auto;
}
.mini-timer {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--astral-bright);
  letter-spacing: -0.02em;
}
.mini-label {
  font-family: var(--mono);
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
}
.mini-label.stall {
  color: var(--ember);
}

.empty {
  grid-column: 1 / -1;
  padding: 1.2rem 0.6rem;
  text-align: center;
  font-family: var(--display);
  font-style: italic;
  font-size: 0.85rem;
  color: var(--ink-faint);
}
</style>
