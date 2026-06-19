<script lang="ts">
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/svelte";
import { tables, reducers } from "./module_bindings";
import SignIn from "./lib/SignIn.svelte";
import Board from "./lib/Board.svelte";
import Achievements from "./lib/Achievements.svelte";

const conn = useSpacetimeDB();

const [me, meReady] = useTable(tables.meView);
const [boards, boardsReady] = useTable(tables.myBoards);

const newGame = useReducer(reducers.newGame);

const signedIn = $derived($meReady && $me.length > 0);
// v1: a player has exactly one game — their own. We never list boards; we drop
// straight into the first (and only) one. The schema permits more; the UI does
// not. A brand-new player has none yet, so we offer a single "Begin" instead.
const board = $derived($boards[0]);
</script>

{#if !signedIn}
  <!-- ── Signed-out: the title screen ─────────────────────────────────── -->
  <main class="hero">
    <div class="hero-glow"></div>
    <div class="hero-inner">
      <p class="eyebrow">A tabletop engine of verbs &amp; resources</p>
      <h1>Space&nbsp;Cards</h1>
      <p class="tagline">
        Feed cards into the machines. Watch them turn time into something new.
      </p>
      <div class="hero-cta">
        {#if $conn.isActive}
          <SignIn />
        {:else}
          <span class="connecting">Opening a channel to the table…</span>
        {/if}
      </div>
    </div>
    <footer class="hero-foot">
      <span class="link-status" class:on={$conn.isActive}></span>
      {$conn.isActive ? "connected" : "connecting"}
    </footer>
  </main>
{:else}
  <!-- ── Signed-in: straight to the one board ─────────────────────────── -->
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">✦</span>
        <span class="brand-name">Space Cards</span>
      </div>
      <SignIn />
    </header>

    <main class="stage">
      <Achievements />
      {#if board}
        <Board boardId={board.id} />
      {:else if $boardsReady}
        <div class="begin">
          <div class="begin-orb"></div>
          <h2>Your table is empty</h2>
          <p>Lay out a fresh set — You, a Forest, a Market, and a little Health.</p>
          <button
            class="cw-btn"
            onclick={() => newGame()}
            disabled={!$conn.isActive}
          >
            Begin a New Game
          </button>
        </div>
      {:else}
        <div class="begin">
          <div class="begin-orb"></div>
          <p>Finding your table…</p>
        </div>
      {/if}
    </main>
  </div>
{/if}

<style>
/* ── Hero ──────────────────────────────────────────────────────────────── */
.hero {
  position: relative;
  height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.hero-glow {
  position: absolute;
  width: 70vmax;
  height: 70vmax;
  border-radius: 50%;
  top: -28vmax;
  background: radial-gradient(
    circle,
    rgba(116, 199, 214, 0.16),
    transparent 62%
  );
  filter: blur(8px);
  animation: drift 14s ease-in-out infinite alternate;
}
@keyframes drift {
  to {
    transform: translateX(8vw) scale(1.08);
  }
}
.hero-inner {
  position: relative;
  text-align: center;
  padding: 2rem;
  animation: rise 1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
.eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.34em;
  font-size: 0.72rem;
  color: var(--astral);
  margin: 0 0 1.2rem;
  padding-left: 0.34em;
}
.hero h1 {
  font-family: var(--display);
  font-weight: 900;
  font-size: clamp(3.5rem, 13vw, 9rem);
  line-height: 0.92;
  margin: 0;
  background: linear-gradient(180deg, #fbf4e2 8%, var(--brass) 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(203, 166, 90, 0.25);
}
.tagline {
  font-family: var(--display);
  font-style: italic;
  font-size: clamp(1rem, 2.4vw, 1.4rem);
  color: var(--ink-soft);
  margin: 1.4rem auto 2.4rem;
  max-width: 30ch;
}
.hero-cta {
  display: flex;
  justify-content: center;
}
.connecting {
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--ink-faint);
}
.hero-foot {
  position: absolute;
  bottom: 20px;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.link-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ember);
  box-shadow: 0 0 8px 1px var(--ember);
}
.link-status.on {
  background: var(--astral-bright);
  box-shadow: 0 0 8px 1px var(--astral);
}

/* ── Signed-in shell ───────────────────────────────────────────────────── */
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1.3rem;
  background: linear-gradient(180deg, rgba(8, 10, 20, 0.85), transparent);
  border-bottom: 1px solid var(--panel-edge);
  z-index: 20;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.brand-mark {
  color: var(--brass-bright);
  font-size: 1.1rem;
  text-shadow: 0 0 12px var(--brass);
}
.brand-name {
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.25rem;
  letter-spacing: 0.01em;
  color: var(--ink);
}
.stage {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.begin {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.8rem;
  text-align: center;
  padding: 2rem;
}
.begin h2 {
  font-size: 1.9rem;
  color: var(--brass-bright);
}
.begin p {
  color: var(--ink-soft);
  max-width: 36ch;
  margin: 0 0 0.6rem;
}
.begin-orb {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  margin-bottom: 0.6rem;
  background: radial-gradient(
    circle at 40% 35%,
    var(--brass-bright),
    var(--brass-deep) 60%,
    transparent 72%
  );
  box-shadow: 0 0 50px -6px rgba(203, 166, 90, 0.5);
  animation: pulse 2.6s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.06);
    opacity: 1;
  }
}
</style>
