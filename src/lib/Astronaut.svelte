<script lang="ts">
// ── The boss ──────────────────────────────────────────────────────────────────
// Our happy little astronaut: shades on, one arm waving. Drawn as a bare SVG <g>
// in a local 160×172 box (helmet centred at 80,46 r30) so it can be dropped into
// any parent <svg> — the outro card renders it full-size; the rocket porthole
// scales + translates it down behind a clip so only the head & wave show through.
//
// `transform` places/scales the figure in the parent's coordinate space.
let { transform = "" }: { transform?: string } = $props();
</script>

<g class="astro-fig" {transform}>
  <!-- Backpack, behind the suit -->
  <rect class="pack" x="50" y="68" width="60" height="50" rx="12" />

  <!-- Legs + boots -->
  <path class="limb" d="M68 118 l-7 32" />
  <path class="limb" d="M92 118 l7 32" />
  <ellipse class="boot" cx="59" cy="156" rx="9" ry="6" />
  <ellipse class="boot" cx="101" cy="156" rx="9" ry="6" />

  <!-- Right arm, resting at his side -->
  <path class="limb" d="M104 86 q15 9 12 30" />
  <circle class="mitt" cx="116" cy="118" r="7" />

  <!-- Torso -->
  <rect class="suit" x="54" y="66" width="52" height="58" rx="20" />
  <rect class="panel" x="69" y="86" width="22" height="16" rx="3" />
  <circle class="led" cx="75" cy="94" r="1.8" />
  <circle class="led" cx="85" cy="94" r="1.8" />

  <!-- Left arm, raised and waving (own group so the rotation is clean) -->
  <g class="wave">
    <path class="limb" d="M58 82 q-22 -6 -28 -34" />
    <circle class="mitt" cx="30" cy="44" r="8" />
  </g>

  <!-- Helmet -->
  <circle class="helmet" cx="80" cy="46" r="30" />
  <path class="visor" d="M56 46 a24 21 0 0 1 48 0 a24 15 0 0 1 -48 0 Z" />

  <!-- Shades — because he's a boss 😎 -->
  <g class="shades">
    <rect x="62" y="40" width="16" height="11" rx="4" />
    <rect x="82" y="40" width="16" height="11" rx="4" />
    <line x1="78" y1="44" x2="82" y2="44" />
    <line class="glint" x1="65" y1="49" x2="74" y2="42" />
  </g>
  <path class="smile" d="M71 58 q9 6 18 0" />
</g>

<style>
.pack { fill: var(--brass-deep); }
.suit { fill: #eef2f8; stroke: #c2cad8; stroke-width: 1.4; }
.helmet { fill: #f3f6fb; stroke: #c2cad8; stroke-width: 1.4; }
.visor { fill: #16314f; }
.panel { fill: var(--brass); }
.led { fill: var(--astral-bright); }
.limb { fill: none; stroke: #eef2f8; stroke-width: 7; stroke-linecap: round; }
.mitt { fill: #eef2f8; }
.boot { fill: var(--brass-deep); }
.smile { fill: none; stroke: #cfe6ff; stroke-width: 2; stroke-linecap: round; }

.shades rect { fill: #07101d; stroke: var(--brass); stroke-width: 1.2; }
.shades line { stroke: var(--brass); stroke-width: 2; stroke-linecap: round; }
.glint { stroke: rgba(var(--astral-bright-rgb), 0.85) !important; stroke-width: 1.6 !important; }

/* The wave — a cheerful arc around the shoulder. */
.wave {
  transform-box: fill-box;
  transform-origin: 100% 100%;
  animation: astro-wave 1.1s ease-in-out infinite;
}
@keyframes astro-wave {
  0%, 100% { transform: rotate(-7deg); }
  50% { transform: rotate(13deg); }
}

@media (prefers-reduced-motion: reduce) {
  .wave { animation: none !important; }
}
</style>
