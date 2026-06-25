<script lang="ts">
// A verb card: a brass machine sitting on the felt. It shows its typed holes
// (open sockets you drag arguments into), a countdown ring while a call runs,
// and an output tray that back-pressures when full. All authoritative state
// comes in as props from the Board; this component only draws and forwards the
// pointer events that begin a drag on a slotted or produced card.
import type { Card, CardDef, SlotDef } from "../module_bindings/types";
import {
  visualFor,
  formatRemaining,
  holeLabels,
  type RunState,
} from "./catalogue";
import CardToken from "./CardToken.svelte";
import { SvelteSet } from "svelte/reactivity";

let {
  def,
  state: runState,
  progress,
  remainingMs,
  slots,
  slotted,
  outputs,
  defsById,
  dragDefId,
  dragCategory,
  rejectingId,
  flashingIds,
  playerSlotted,
  onSlottedPointerDown,
  onOutputPointerDown,
  onHoleEnter,
  onHoleLeave,
}: {
  def: CardDef;
  state: RunState;
  progress: number; // 0..1
  remainingMs: number;
  slots: SlotDef[];
  slotted: Map<number, Card>;
  outputs: Card[];
  defsById: Map<string, CardDef>;
  dragDefId: string | null;
  dragCategory: string | null;
  rejectingId: bigint | null;
  // Ids of cards that should flash because they could fill a hovered empty hole —
  // here, used to glow this verb's own output-tray cards (an "outbox" source).
  flashingIds: Set<bigint>;
  // Ids of cards the player slotted by hand — these don't flip; only the
  // drone's own pulls do. Consumed (one-shot) as each arrives.
  playerSlotted: Set<bigint>;
  onSlottedPointerDown: (e: PointerEvent, card: Card) => void;
  onOutputPointerDown: (e: PointerEvent, card: Card) => void;
  // Hovering an empty hole / drone bay bubbles its accept-criteria to the Board,
  // which flashes the loose cards that could fill it.
  onHoleEnter: (hole: { accepts: string[]; droneLevel: number }) => void;
  onHoleLeave: () => void;
} = $props();

const v = $derived(visualFor(def.defId, def.category));

// A drone bay (droneLevel > 0) renders separately, top-right; the input holes
// fill the main grid. Splitting them keeps the bay out of the .holes flow and
// lets it accept only a drone of sufficient Mk.
const inputSlots = $derived(slots.filter((s) => s.droneLevel === 0));
const droneBay = $derived(slots.find((s) => s.droneLevel > 0));
const bayDrone = $derived(droneBay ? slotted.get(droneBay.slotIndex) : undefined);
// Label bays (and holes) by what they accept — each as a human display name so
// it wraps on word boundaries; the uppercase look is CSS. A worker bay reads
// e.g. "Mk 1+" AND "Effort", because Effort is the universal worker.
const bayLabels = $derived(droneBay ? holeLabels(droneBay, defsById) : []);
const bayTitle = $derived(bayLabels.join(" / "));

// A mechanical drone (a verb worker) flips over each time it pulls a fresh
// component into one of the host's input holes; the inert Effort worker doesn't.
const bayDroneIsMechanical = $derived(
  !!bayDrone && (defsById.get(bayDrone.defId)?.isVerb ?? false),
);

// Detect a "pull": a card id showing up in an input hole that wasn't there on the
// previous render. We seed `seenInputIds` on the first pass so the initial deal
// (and any cards already loaded) don't trigger a flip.
let flipping = $state(false);
// The freshly-pulled resources flipping in their holes; ids drop out on
// animationend. A SvelteSet so `.has()` is reactive in the template while the
// effect only ever *writes* to it (no read → no dependency loop).
const flippingIds = new SvelteSet<bigint>();
let seenInputIds = new Set<bigint>();
let primed = false;
$effect(() => {
  const current = new Set<bigint>();
  const fresh: bigint[] = [];
  for (const s of inputSlots) {
    const c = slotted.get(s.slotIndex);
    if (c) {
      current.add(c.id);
      if (primed && !seenInputIds.has(c.id)) {
        // A card the player dropped in by hand shouldn't flip — only the ones
        // the drone pulls. Consume the marker so it's a one-shot.
        if (playerSlotted.has(c.id)) playerSlotted.delete(c.id);
        else fresh.push(c.id);
      }
    }
  }
  seenInputIds = current;
  if (fresh.length && bayDroneIsMechanical) {
    // Flip the drone (restart even if mid-flight, for rapid feeds)…
    flipping = false;
    requestAnimationFrame(() => {
      flipping = true;
    });
    // …and the resource(s) it just pulled in.
    for (const id of fresh) flippingIds.add(id);
  }
  primed = true;
});

// Countdown ring geometry.
const R = 30;
const CIRC = 2 * Math.PI * R;

const isOngoing = $derived(runState === "ongoing");
const isStalled = $derived(runState === "stalled");

// Does an empty hole accept the card currently being dragged? Open holes light
// up whatever the verb's run state — you can drop into the Market's inbox while
// it's mid-sale; a filled hole (the only kind a busy single-hole verb has) is
// excluded just below.
function accepts(slot: SlotDef): boolean {
  if (!dragDefId) return false;
  if (slotted.has(slot.slotIndex)) return false;
  // A drone bay takes a drone only if its Mk meets the bay's minimum.
  if (slot.droneLevel > 0) {
    const dd = defsById.get(dragDefId);
    return !!dd && dd.category === "drone" && dd.droneLevel >= slot.droneLevel;
  }
  return (
    slot.accepts.includes(dragDefId) ||
    (dragCategory !== null && slot.accepts.includes(dragCategory))
  );
}

// The whole card is the drop target, so it lights up as a unit when any open
// socket (input hole or drone bay) would take the dragged card.
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
  class:has-bay={!!droneBay}
  class:rocket={def.defId === "rocket"}
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
      <div class="glyph" aria-hidden="true">
        {@html v.glyph}
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

    {#if droneBay}
      <div
        class="drone-bay"
        class:filled={!!bayDrone}
        class:open={accepts(droneBay)}
        title="Worker bay · {bayTitle}"
      >
        {#if bayDrone}
          <div
            class="slotted-card"
            class:reject={rejectingId === bayDrone.id}
            class:flipping
            role="button"
            tabindex="0"
            onpointerdown={(e) => onSlottedPointerDown(e, bayDrone)}
            onanimationend={() => (flipping = false)}
          >
            <CardToken
              defId={bayDrone.defId}
              name={nameOf(bayDrone.defId)}
              category={categoryOf(bayDrone.defId)}
              size="sm"
            />
          </div>
        {:else}
          <div
            class="hole-hover"
            role="presentation"
            onpointerenter={() =>
              onHoleEnter({ accepts: droneBay.accepts, droneLevel: droneBay.droneLevel })}
            onpointerleave={onHoleLeave}
          >
            <span class="bay-mark">⬡</span>
            <div class="accepts">
              {#each bayLabels as label}
                <span class="chip">{label}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </header>

  {#if inputSlots.length > 0}
    <div class="holes">
      {#each inputSlots as slot (slot.id)}
        {@const card = slotted.get(slot.slotIndex)}
        <div class="hole" class:filled={!!card} class:open={accepts(slot)}>
          {#if card}
            <div
              class="slotted-card"
              class:reject={rejectingId === card.id}
              class:flipping={flippingIds.has(card.id)}
              role="button"
              tabindex="0"
              onpointerdown={(e) => onSlottedPointerDown(e, card)}
              onanimationend={() => flippingIds.delete(card.id)}
            >
              <CardToken
                defId={card.defId}
                name={nameOf(card.defId)}
                category={categoryOf(card.defId)}
                size="sm"
              />
            </div>
          {:else}
            <div
              class="hole-empty hole-hover"
              role="presentation"
              onpointerenter={() =>
                onHoleEnter({ accepts: slot.accepts, droneLevel: slot.droneLevel })}
              onpointerleave={onHoleLeave}
            >
              <span class="hole-mark">{slot.required ? "✶" : "○"}</span>
              <div class="accepts">
                {#each holeLabels(slot, defsById) as label}
                  <span class="chip">{label}</span>
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
              class:flashing={flashingIds.has(cell.id)}
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
    linear-gradient(180deg, var(--machine-top), var(--machine-bottom));
  border: 1px solid rgba(var(--brass-rgb), 0.4);
  box-shadow:
    0 1px 0 rgba(var(--brass-bright-rgb), 0.18) inset,
    0 26px 44px -22px rgba(var(--shadow-rgb), 0.9);
  color: var(--ink);
  touch-action: none;
}
/* brass corner rivets */
.station::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 14px;
  border: 1px solid rgba(var(--brass-rgb), 0.14);
  pointer-events: none;
}

/* The Rocket is the endgame reward: a luminous astral-blue card that stands
   out from the navy machinery, echoing the "Escape the Moon" finale. */
.station.rocket {
  --machine-top: #36617f;
  --machine-bottom: #25455f;
  border-color: rgba(var(--astral-rgb), 0.6);
  box-shadow:
    0 0 0 1px rgba(var(--astral-bright-rgb), 0.28),
    0 0 44px -12px rgba(var(--astral-rgb), 0.55),
    0 26px 44px -22px rgba(var(--shadow-rgb), 0.9);
}
.station.rocket::after {
  border-color: rgba(var(--astral-rgb), 0.22);
}

.station.ongoing {
  border-color: rgba(var(--astral-rgb), 0.55);
  box-shadow:
    0 0 0 1px rgba(var(--astral-rgb), 0.18),
    0 0 38px -10px rgba(var(--astral-rgb), 0.45),
    0 26px 44px -22px rgba(var(--shadow-rgb), 0.9);
}
.station.stalled {
  border-color: rgba(var(--ember-rgb), 0.5);
}
/* the whole card is the drop target — light it up as one when armed */
.station.armed {
  border-color: var(--astral-bright);
  box-shadow:
    0 0 0 2px rgba(var(--astral-rgb), 0.35),
    0 0 46px -6px rgba(var(--astral-rgb), 0.65),
    0 26px 44px -22px rgba(var(--shadow-rgb), 0.9);
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
/* With a drone bay present, top-align the row so the badge/heading sit at the top
   and the (taller) bay defines the header height — the input holes then flow
   safely below it instead of tucking under the bay. */
.has-bay header {
  align-items: flex-start;
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
  filter: drop-shadow(0 0 5px rgba(var(--astral-rgb), 0.8));
}
.glyph {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--tint);
  background: radial-gradient(circle at 50% 35%, var(--socket-rim), var(--socket-pit));
  border: 1px solid rgba(var(--brass-rgb), 0.3);
}
/* :global — glyph injected via {@html}, see CardToken for the why. */
.glyph :global(svg) {
  width: 30px;
  height: 30px;
}
.ongoing .glyph {
  animation: breathe 2.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    filter: drop-shadow(0 0 8px rgba(var(--astral-rgb), 0.6));
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
  border: 1.5px dashed rgba(var(--edge-rgb), 0.22);
  background: rgba(var(--abyss-rgb), 0.5);
  box-shadow: 0 8px 14px -10px rgba(var(--shadow-rgb), 0.9) inset;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}
.hole.filled {
  border-style: solid;
  border-color: rgba(var(--brass-rgb), 0.3);
  background: rgba(var(--abyss-rgb), 0.2);
}
.hole.open {
  border-color: var(--astral-bright);
  box-shadow:
    0 0 0 1px rgba(var(--astral-rgb), 0.3),
    0 0 20px -3px rgba(var(--astral-rgb), 0.6);
  transform: translateY(-2px);
}
.hole-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  color: var(--ink-faint);
}
/* The hover target fills its cell so the whole empty hole / bay answers
   "what goes in here?" — not just the glyph. */
.hole-hover {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
}
.hole-mark {
  font-size: 1.1rem;
  color: rgba(var(--edge-rgb), 0.4);
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
  background: rgba(var(--edge-rgb), 0.08);
  border: 1px solid rgba(var(--edge-rgb), 0.12);
}
.slotted-card {
  cursor: grab;
}
.slotted-card.reject,
.out-card.reject {
  animation: reject 0.46s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
/* The bay drone — and the resource it just pulled in — flip over on each feed. */
.slotted-card.flipping {
  animation: drone-flip 0.5s ease-in-out;
}
@keyframes drone-flip {
  0% {
    transform: perspective(240px) rotateY(0deg);
  }
  100% {
    transform: perspective(240px) rotateY(360deg);
  }
}

/* the drone bay — a single socket sitting at the card's top-right, in the header
   flow so the header grows to contain it and the holes never tuck underneath */
.drone-bay {
  margin-left: auto;
  flex: 0 0 auto;
  width: 72px;
  min-height: 84px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 4px;
  border: 1.5px dashed rgba(var(--astral-rgb), 0.3);
  background: rgba(var(--abyss-rgb), 0.5);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.drone-bay.filled {
  border-style: solid;
  border-color: rgba(var(--brass-rgb), 0.3);
  background: rgba(var(--abyss-rgb), 0.2);
}
.drone-bay.open {
  border-color: var(--astral-bright);
  box-shadow:
    0 0 0 1px rgba(var(--astral-rgb), 0.3),
    0 0 20px -3px rgba(var(--astral-rgb), 0.6);
}
.bay-mark {
  font-size: 1.2rem;
  line-height: 1;
  color: rgba(var(--astral-rgb), 0.5);
}
.tray {
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid rgba(var(--brass-rgb), 0.16);
}
.tray-rail {
  display: flex;
  gap: 5px;
}
.cell {
  width: 30px;
  height: 38px;
  border-radius: 7px;
  border: 1px solid rgba(var(--edge-rgb), 0.1);
  background: rgba(var(--abyss-rgb), 0.45);
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
  position: relative;
  animation: pop 0.28s cubic-bezier(0.2, 1.3, 0.5, 1);
  /* Eases the brightness lift back to rest when hover ends. */
  transition: filter 0.32s ease;
}
/* Hovering an empty hole flashes every card that could fill it — including a tray
   card here — mirroring the loose-card glow in Board.svelte's .placed.flashing.
   The glow is an ::after overlay's opacity (a declared value the .flashing class
   toggles, so it transitions out cleanly — removing a filter animation does not);
   no `transform: scale`, so the tray card's hitbox stays put and can't trigger the
   pointerenter/leave oscillation an earlier version had. See the longer note in
   Board.svelte. */
.out-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 13px;
  pointer-events: none;
  z-index: -1;
  opacity: 0;
  box-shadow: 0 0 16px 3px rgba(var(--astral-rgb), 0.95);
  transition: opacity 0.32s ease;
}
.out-card.flashing {
  filter: brightness(1.3) saturate(1.25);
}
.out-card.flashing::after {
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
@keyframes pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
</style>
