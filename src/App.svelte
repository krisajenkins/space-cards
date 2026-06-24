<script lang="ts">
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/svelte";
import { tables, reducers } from "./module_bindings";
import SignIn from "./lib/SignIn.svelte";
import Board from "./lib/Board.svelte";
import Achievements from "./lib/Achievements.svelte";
import About from "./lib/About.svelte";
import Privacy from "./lib/Privacy.svelte";
import Modal from "./lib/Modal.svelte";
import ProgressionTree from "./lib/ProgressionTree.svelte";
import SoundEffects from "./lib/SoundEffects.svelte";
import Finale from "./lib/Finale.svelte";
import SharePopover from "./lib/SharePopover.svelte";
import { muted, toggleMute } from "./lib/audio";
import { finalePlaying, playFinale, endFinale } from "./lib/finale";
import { track } from "./lib/analytics";

const conn = useSpacetimeDB();

let shareOpen = $state(false);

const [me, meReady] = useTable(tables.meView);
const [boards, boardsReady] = useTable(tables.myBoards);

const newGame = useReducer(reducers.newGame);

const signedIn = $derived($meReady && $me.length > 0);
// Admin-only: the progression-tree visualiser. The `me_view` carries the
// caller's isAdmin flag (same signal SignIn uses for its badge); we mirror it
// here to gate the topbar toggle. The progression_* views are public, but only
// an admin gets the surface to open them.
const isAdmin = $derived($me[0]?.isAdmin ?? false);
let treeOpen = $state(false);
let confirmNew = $state(false);
// v1: a player may have several games — we keep old ones around but never list
// them. We drop straight into the *latest* board (max createdAt, tiebreak on id)
// so "Start New Game" silently retargets the UI onto the freshly-dealt game. The
// schema permits many; the UI shows only the newest. A brand-new player has none
// yet, so we offer a single "Begin" instead.
const board = $derived(
  [...$boards].sort((a, b) => {
    const t = Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch);
    return t !== 0 ? t : Number(b.id - a.id);
  })[0],
);

// Start a fresh game. Because `board` derives onto the *latest* board, the new
// game (with a newer createdAt) becomes the one we render the moment its row
// lands — the old game stays in the DB, just no longer reachable. Shared by the
// first-game "Begin" button and the "Start New Game" confirm modal so both count.
function beginNewGame() {
  track("new_game");
  newGame();
}
function startNewGame() {
  beginNewGame();
  confirmNew = false;
}
</script>

{#if !signedIn}
  <!-- ── Signed-out: the title screen ─────────────────────────────────── -->
  <main class="hero">
    <div class="hero-glow"></div>
    <div class="hero-inner">
      <p class="eyebrow">A card game, a factory game</p>
      <h1>Escape the Moon</h1>
      <p class="tagline">You've crash-landed. Your only hopes lie through knowledge, effort, and whatever you can scrounge up from the moon's surface.</p>
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
      <span class="foot-sep">·</span>
      <Privacy link />
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
      <div class="topbar-right">
        {#if board}
          <button
            class="pill"
            title="Start a new game"
            onclick={() => (confirmNew = true)}
          >
            New Game
          </button>
        {/if}
        <div class="share-anchor">
          <button
            class="pill share-trigger"
            title="Share Escape the Moon"
            aria-haspopup="menu"
            aria-expanded={shareOpen}
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => (shareOpen = !shareOpen)}
          >
            <span class="share-glyph" aria-hidden="true">↗</span>
            Share
          </button>
          <SharePopover
            text="Playing Escape the Moon 🌙 — can you escape?"
            bind:open={shareOpen}
          />
        </div>
        <button
          class="mute-trigger"
          class:muted={$muted}
          title={$muted ? "Unmute sound" : "Mute sound"}
          aria-label={$muted ? "Unmute sound" : "Mute sound"}
          aria-pressed={$muted}
          onclick={toggleMute}
        >
          {$muted ? "🔇" : "🔊"}
        </button>
        {#if isAdmin}
          <button
            class="pill"
            title="Progression tree (admin)"
            onclick={() => (treeOpen = true)}
          >
            Tree
          </button>
          <button
            class="pill"
            title="Preview the endgame cinematic (admin)"
            onclick={() => playFinale()}
          >
            Finale
          </button>
        {/if}
        <About />
        <Privacy />
        <SignIn />
      </div>
    </header>

    {#if isAdmin && treeOpen}
      <ProgressionTree onClose={() => (treeOpen = false)} />
    {/if}

    <main class="stage" class:receding={$finalePlaying}>
      <SoundEffects />
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
            onclick={beginNewGame}
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

    {#if $finalePlaying}
      <Finale onClose={endFinale} />
    {/if}

    {#if confirmNew}
      <Modal
        label="Start a new game"
        eyebrow="Crash-land again?"
        title="Start a New Game"
        onClose={() => (confirmNew = false)}
      >
        <p class="modal-body">
          This deals a fresh table and drops you straight into it. Your current
          game isn't deleted — it's kept safe — but there's no way back to it
          for now, so you'll be starting over from the wreck.
        </p>

        <div class="modal-actions">
          <button class="pill pill--lg" onclick={() => (confirmNew = false)}>
            Cancel
          </button>
          <button
            class="pill pill--lg pill--go"
            onclick={startNewGame}
            disabled={!$conn.isActive}
          >
            Start New Game
          </button>
        </div>
      </Modal>
    {/if}
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
    rgba(var(--astral-rgb), 0.16),
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
  text-shadow: 0 0 60px rgba(var(--brass-rgb), 0.25);
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
.foot-sep {
  color: var(--ink-faint);
  opacity: 0.5;
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
.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.8rem;
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
/* While the endgame cinematic plays, the whole board recedes — smaller, softer,
   gone — leaving the rocket alone in frame. The Finale overlay sits OUTSIDE the
   stage (at .app level) so it stays crisp while everything here fades away. */
.stage.receding {
  transition:
    transform 1.8s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 1.8s ease,
    filter 1.8s ease;
  transform: scale(0.82);
  opacity: 0;
  filter: blur(8px) saturate(0.6);
  pointer-events: none;
}

/* The share pill + its popover live in a positioned wrapper so the menu can
   anchor to the button. */
.share-anchor {
  position: relative;
  display: inline-flex;
}
/* The share pill carries a small upload glyph before its label. */
.share-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}
.share-glyph {
  font-size: 0.95em;
  line-height: 1;
}

/* The sound toggle, styled as a round pill to match the topbar's other pills. */
.mute-trigger {
  appearance: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(var(--chrome-rgb), 0.7);
  color: var(--ink-soft);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease;
}
.mute-trigger:hover {
  border-color: rgba(var(--edge-rgb), 0.25);
}
.mute-trigger.muted {
  opacity: 0.55;
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
  box-shadow: 0 0 50px -6px rgba(var(--brass-rgb), 0.5);
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
