<script lang="ts">
// ── The endgame cinematic ─────────────────────────────────────────────────────
// Mounted by App over the (receding, fading) board when the player dismisses the
// "Escape the Moon" win toast. A four-beat sequence, all CSS-driven off a single
// `phase` class so timing stays declarative:
//
//   rise   — deep space fades in; the rocket climbs from the grey dust below,
//            growing until it fills the screen. The astronaut waves.
//   ignite — engines light, the ship shudders, exhaust blooms.
//   launch — it tears off the top of the frame; the moon's dust falls away.
//   done   — the "Mission complete" outro card settles in.
//
// Click anywhere mid-flight to skip straight to the outro. Nothing here touches
// the board or the server — it's pure send-off. Closing returns to the board.
import { onMount, onDestroy } from "svelte";
import { playLaunch } from "./audio";
import { share } from "./share";
import Astronaut from "./Astronaut.svelte";

let { onClose }: { onClose: () => void } = $props();

let shareLabel = $state("Share your escape");
let shareTimer: ReturnType<typeof setTimeout> | undefined;
async function shareWin() {
  const result = await share({
    title: "Escape the Moon",
    text: "I escaped the Moon! 🚀",
  });
  if (result === "copied") {
    shareLabel = "Link copied!";
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => (shareLabel = "Share your escape"), 2000);
  }
}

type Phase = "rise" | "ignite" | "launch" | "done";
let phase = $state<Phase>("rise");
let soundPlayed = false;

let timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function ignite() {
  if (!soundPlayed) {
    soundPlayed = true;
    playLaunch();
  }
}

// Jump to the outro from any in-flight beat (background click).
function skip() {
  if (phase === "done") return;
  clearTimers();
  ignite();
  phase = "done";
}

onMount(() => {
  at(2300, () => {
    if (phase === "rise") {
      phase = "ignite";
      ignite();
    }
  });
  at(3700, () => {
    if (phase === "ignite") phase = "launch";
  });
  at(6000, () => {
    if (phase === "launch") phase = "done";
  });
});

onDestroy(() => {
  clearTimers();
  clearTimeout(shareTimer);
});
</script>

<div
  class="finale phase-{phase}"
  role="presentation"
  onclick={skip}
>
  <div class="space"></div>
  <div class="stars"></div>
  <div class="moon"></div>

  <div class="ship-wrap">
    <div class="ship">
      <svg viewBox="0 0 100 260" class="rocket" aria-hidden="true">
        <defs>
          <clipPath id="porthole">
            <circle cx="50" cy="84" r="15" />
          </clipPath>
          <radialGradient id="glass" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stop-color="#0b1830" />
            <stop offset="100%" stop-color="#05101f" />
          </radialGradient>
        </defs>

        <!-- Exhaust: hidden until ignition, then flickers and lengthens. -->
        <g class="exhaust">
          <path
            class="flame flame-outer"
            d="M40 176 Q50 250 60 176 Q50 196 40 176Z"
          />
          <path
            class="flame flame-mid"
            d="M43 176 Q50 228 57 176 Q50 192 43 176Z"
          />
          <path
            class="flame flame-core"
            d="M46 176 Q50 210 54 176 Q50 188 46 176Z"
          />
        </g>

        <!-- Fins -->
        <path class="fin" d="M30 138 L12 182 L30 172 Z" />
        <path class="fin" d="M70 138 L88 182 L70 172 Z" />

        <!-- Nozzle -->
        <path class="nozzle" d="M38 150 L62 150 L58 178 L42 178 Z" />

        <!-- Fuselage -->
        <path
          class="hull"
          d="M50 8
             C36 22 30 40 30 60
             L30 150
             L70 150
             L70 60
             C70 40 64 22 50 8 Z"
        />
        <!-- A brass seam + nose tip -->
        <path
          class="nose"
          d="M50 8 C42 16 37 30 35 46 L65 46 C63 30 58 16 50 8 Z"
        />
        <line class="seam" x1="30" y1="118" x2="70" y2="118" />

        <!-- Porthole -->
        <circle class="rim" cx="50" cy="84" r="16" />
        <g clip-path="url(#porthole)">
          <rect x="34" y="68" width="32" height="32" fill="url(#glass)" />
          <!-- The boss at the controls — same figure as the outro, scaled down
               so his shades & wave fill the porthole glass. -->
          <Astronaut transform="translate(21.2 69.44) scale(0.36)" />
          <!-- A travelling glare across the glass -->
          <rect class="glint" x="34" y="66" width="10" height="36" />
        </g>
      </svg>
    </div>
  </div>

  {#if phase === "done"}
    <div class="outro" role="dialog" aria-label="Mission complete">
      <!-- The boss himself: free of the Moon at last, floating in for his curtain
           call — shades on, one arm waving. -->
      <svg viewBox="0 0 160 172" class="hero" aria-hidden="true">
        <Astronaut />
      </svg>

      <h1>Escaped the Moon!</h1>
      <p class="eyebrow">Mission complete</p>
      <p class="sub">
        The wreck and the grey dust fall away beneath you. You turned regolith
        into a way home.
      </p>
      <div class="outro-actions">
        <button
          class="cw-btn cw-btn-share"
          onclick={(e) => { e.stopPropagation(); shareWin(); }}
        >
          <span class="share-glyph" aria-hidden="true">↗</span>
          {shareLabel}
        </button>
        <button class="cw-btn" onclick={(e) => { e.stopPropagation(); onClose(); }}>
          Back to the board
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
.finale {
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow: hidden;
  cursor: pointer;
}

/* ── Backdrop: the board shows through for a beat, then deep space takes it ─── */
.space {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 80% at 50% 110%, rgba(116, 199, 214, 0.12), transparent 55%),
    radial-gradient(100% 100% at 50% 0%, #0a1330 0%, var(--void) 70%);
  opacity: 0;
  animation: space-in 1.6s ease forwards;
}
@keyframes space-in {
  to { opacity: 1; }
}

/* A cheap, crisp starfield from layered radial dots. */
.stars {
  position: absolute;
  inset: -20%;
  background-image:
    radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 75% 18%, #cfe6ff, transparent),
    radial-gradient(1px 1px at 40% 60%, #fff, transparent),
    radial-gradient(1px 1px at 88% 72%, #bfe0ff, transparent),
    radial-gradient(1.5px 1.5px at 60% 42%, #fff, transparent),
    radial-gradient(1px 1px at 12% 80%, #e9f3ff, transparent),
    radial-gradient(1px 1px at 52% 88%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 33% 12%, #d8ecff, transparent);
  opacity: 0;
  animation: stars-in 2.4s ease 0.4s forwards;
}
@keyframes stars-in {
  to { opacity: 0.9; }
}
/* During launch the stars streak upward — a touch of speed. */
.phase-launch .stars {
  animation: stars-streak 2s linear forwards;
}
@keyframes stars-streak {
  from { transform: translateY(0) scaleY(1); opacity: 0.9; }
  to { transform: translateY(-22%) scaleY(1.5); opacity: 0.5; }
}

/* ── The moon's surface: a grey horizon the ship lifts off from ─────────────── */
.moon {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -52%;
  height: 90%;
  border-radius: 50% 50% 0 0;
  background:
    radial-gradient(40px 24px at 30% 14%, rgba(0, 0, 0, 0.22), transparent 60%),
    radial-gradient(60px 30px at 68% 22%, rgba(0, 0, 0, 0.18), transparent 60%),
    radial-gradient(30px 18px at 50% 30%, rgba(0, 0, 0, 0.2), transparent 60%),
    linear-gradient(180deg, #4a4f5e 0%, #2c303c 60%);
  box-shadow: inset 0 6px 30px rgba(174, 240, 251, 0.08);
  opacity: 0;
  transform: translateY(8%);
  animation: moon-in 1.6s ease 0.3s forwards;
}
@keyframes moon-in {
  to { opacity: 1; transform: translateY(0); }
}
/* As the rocket climbs, the dust falls away beneath — and stays gone. */
.phase-launch .moon,
.phase-done .moon {
  transition: transform 2.2s cubic-bezier(0.4, 0, 1, 1), opacity 2.2s ease;
  transform: translateY(70%);
  opacity: 0;
}

/* ── The ship ──────────────────────────────────────────────────────────────── */
.ship-wrap {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: end center;
}
/* The OUTER ship owns position only (rise → rest → fly-up). Keeping transform on
   its own element — never also animated by a keyframe — is what lets the launch
   actually tween up the screen instead of snapping off. The ignition shudder
   lives on the inner .rocket so the two transforms never fight. */
.ship {
  height: 24vh;
  aspect-ratio: 100 / 260;
  transform: translateY(18vh);
  opacity: 0;
  transform-origin: 50% 70%;
  filter: drop-shadow(0 0 26px rgba(116, 199, 214, 0.28));
  /* rise: grow + climb to centre */
  transition:
    height 2.2s cubic-bezier(0.2, 0.7, 0.25, 1),
    transform 2.2s cubic-bezier(0.2, 0.7, 0.25, 1),
    opacity 1s ease;
}
/* Risen and resting, large and centred. */
.phase-rise .ship,
.phase-ignite .ship {
  height: 74vh;
  opacity: 1;
  transform: translateY(-13vh);
}
/* Launch: tear off the top of the frame, accelerating. */
.phase-launch .ship {
  height: 74vh;
  opacity: 1;
  transform: translateY(-155vh) scale(1.08);
  transition: transform 2.1s cubic-bezier(0.5, 0, 0.85, 0.3);
}
/* Done: it's already gone — stay gone, so it never pops back behind the outro
   (and a skip from mid-flight just lands here cleanly). */
.phase-done .ship {
  height: 74vh;
  opacity: 0;
  transform: translateY(-155vh) scale(1.08);
  transition: none;
}

.rocket {
  width: 100%;
  height: 100%;
  display: block;
  transform-box: view-box;
  transform-origin: 50% 50%;
}
/* Ignition shudder — inner element, so it doesn't clobber the ship's fly-up. */
.phase-ignite .rocket {
  animation: shudder 0.085s linear infinite;
}
@keyframes shudder {
  0% { transform: translateX(-0.5%); }
  50% { transform: translateX(0.5%); }
  100% { transform: translateX(-0.5%); }
}

.hull {
  fill: #e7ebf3;
  stroke: #aab4c6;
  stroke-width: 1.2;
}
.nose { fill: var(--brass); }
.seam { stroke: #c2cad8; stroke-width: 1.4; }
.fin { fill: var(--brass-deep); }
.nozzle { fill: #4a4133; stroke: var(--brass-deep); stroke-width: 1; }
.rim {
  fill: none;
  stroke: var(--brass);
  stroke-width: 3;
  filter: drop-shadow(0 0 4px rgba(116, 199, 214, 0.6));
}

.glint {
  fill: rgba(174, 240, 251, 0.18);
  transform: skewX(-18deg);
  animation: glint 3.6s ease-in-out infinite;
}
@keyframes glint {
  0%, 100% { transform: translateX(-6px) skewX(-18deg); opacity: 0; }
  50% { transform: translateX(26px) skewX(-18deg); opacity: 1; }
}

/* ── Exhaust ────────────────────────────────────────────────────────────────── */
.exhaust {
  transform-box: fill-box;
  transform-origin: 50% 0%;
  opacity: 0;
  transform: scaleY(0.2);
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.phase-ignite .exhaust,
.phase-launch .exhaust {
  opacity: 1;
  transform: scaleY(1);
  animation: flicker 0.08s steps(2) infinite;
}
.phase-launch .exhaust {
  transform: scaleY(1.7);
}
@keyframes flicker {
  0% { transform: scaleY(0.92) scaleX(0.96); }
  100% { transform: scaleY(1.06) scaleX(1.04); }
}
.flame-outer { fill: var(--ember); opacity: 0.85; }
.flame-mid { fill: #ffb24d; }
.flame-core { fill: var(--brass-bright); }

/* ── The boss: a free-floating astronaut on the outro card ──────────────────── */
.hero {
  width: clamp(120px, 26vw, 200px);
  height: auto;
  margin-bottom: 0.4rem;
  filter: drop-shadow(0 0 26px rgba(116, 199, 214, 0.3));
  transform-box: view-box;
  transform-origin: 50% 50%;
  animation: hero-in 1s cubic-bezier(0.2, 0.8, 0.2, 1) both, hero-float 4.5s ease-in-out 1s infinite;
}
@keyframes hero-in {
  from { opacity: 0; transform: translateY(22px) scale(0.85); }
}
/* A slow drift + tumble, like he's weightless and loving it. */
@keyframes hero-float {
  0%, 100% { transform: translateY(0) rotate(-2.5deg); }
  50% { transform: translateY(-10px) rotate(2.5deg); }
}

/* ── Outro card ────────────────────────────────────────────────────────────── */
.outro {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  text-align: center;
  gap: 0.6rem;
  padding: 2rem;
  cursor: default;
  animation: outro-in 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes outro-in {
  from { opacity: 0; transform: translateY(14px); }
}
.eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.34em;
  font-size: 0.72rem;
  color: var(--astral);
  margin: 0;
}
.outro h1 {
  font-family: var(--display);
  font-weight: 900;
  font-size: clamp(2.6rem, 9vw, 6rem);
  line-height: 0.95;
  margin: 0.2rem 0 0;
  background: linear-gradient(180deg, var(--astral-bright) 6%, var(--astral) 94%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(116, 199, 214, 0.3);
}
.sub {
  font-family: var(--display);
  font-style: italic;
  font-size: clamp(1rem, 2.2vw, 1.3rem);
  color: var(--ink-soft);
  max-width: 34ch;
  margin: 0.4rem 0 1.4rem;
}
.outro-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  justify-content: center;
}
.cw-btn-share {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.share-glyph {
  font-size: 0.95em;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .ship, .phase-launch .ship, .stars, .moon, .glint,
  .exhaust, .space, .hero {
    animation: none !important;
    transition: none !important;
  }
}
</style>
