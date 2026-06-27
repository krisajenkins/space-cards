<script lang="ts">
// ── LinkClaim ───────────────────────────────────────────────────────────────
// The redeeming half of the anonymous → Google "Save game" flow. SignIn.svelte
// mints a claim code (beginLink), stashes it, and triggers Google sign-in, which
// reloads the page. After that reload the connection is the player's Google
// identity, and THIS component redeems the stashed code (claimLink) — merging the
// anonymous game onto the Google account.
//
// If the Google account already had its own saved game, the merge surfaces TWO
// boards. We then prompt the player to keep one (keep-newer pre-selected) and
// discard the other (discardBoard). Otherwise we finish silently.
import { useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from '../module_bindings';
import { pendingLinkClaim, clearLinkClaim } from './google';
import Modal from './Modal.svelte';

const [me, meReady] = useTable(tables.meView);
const [boards, boardsReady] = useTable(tables.myBoards);
const claimLink = useReducer(reducers.claimLink);
const discardBoard = useReducer(reducers.discardBoard);

let claiming = $state(false); // a redeem is in flight / awaiting a choice
let claimed = $state(false); // the claimLink reducer has committed
let chosen = $state(false); // the conflict is resolved (or there was none)

// Redeem a stashed code once we're connected as a NON-anonymous (Google) user.
// Guarded to fire exactly once: clear the code up front and flip `claiming`, so a
// reactive re-run can't double-redeem. The await tells us when the merge has
// actually committed, so the conflict check below never reads a pre-merge count.
$effect(() => {
  const code = pendingLinkClaim();
  if (code && $meReady && $me[0] && !$me[0].isAnonymous && !claiming) {
    claiming = true;
    clearLinkClaim();
    void claimLink({ code }).then(() => {
      claimed = true;
    });
  }
});

// Newest board first (max createdAt, tiebreak on id) — same ordering App uses to
// pick the board it renders, so "newest" here is the game the player lands on.
const sorted = $derived(
  [...$boards].sort((a, b) => {
    const t = Number(
      b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch,
    );
    return t !== 0 ? t : Number(b.id - a.id);
  }),
);

// The merge brought in a second saved game → offer a choice.
const conflict = $derived(
  claiming && claimed && !chosen && $boardsReady && sorted.length > 1,
);

// The merge left a single board → nothing to choose, finish silently.
$effect(() => {
  if (claiming && claimed && !chosen && $boardsReady && sorted.length <= 1) {
    chosen = true;
    claiming = false;
  }
});

// Keep one board, discard the other of the two newest. Choosing the newest is the
// recommended keep-newer default; choosing the older overrides it.
function keep(discardId: bigint) {
  chosen = true;
  void discardBoard({ boardId: discardId }).then(() => {
    claiming = false;
  });
}

function fmt(micros: bigint): string {
  return new Date(Number(micros / 1000n)).toLocaleString();
}

// The "Restoring…" overlay shows while a redeem is in flight, until either it
// finishes or the conflict modal takes over.
const restoring = $derived(claiming && !conflict);
</script>

{#if restoring}
  <div class="lc-overlay" role="status" aria-live="polite">
    <div class="lc-orb"></div>
    <p>Restoring your saved game…</p>
  </div>
{/if}

{#if conflict}
  <Modal
    label="Two saved games"
    width="34rem"
    dismissible={false}
    eyebrow="Welcome back"
    title="Two saved games"
    onClose={() => {}}
  >
    <p class="modal-body">
      You have a game in progress and another saved to your account. Keep one to
      carry on — the other will be discarded.
    </p>
    <div class="lc-choices">
      <!-- Newest = the game just played (recommended); older = the cloud save. -->
      <div class="lc-choice lc-choice--rec">
        <span class="lc-tag">This game (in progress)</span>
        <span class="lc-date">Started {fmt(sorted[0].createdAt.microsSinceUnixEpoch)}</span>
        <span class="lc-badge">Recommended</span>
        <button class="pill pill--go pill--lg" onclick={() => keep(sorted[1].id)}>
          Keep this game
        </button>
      </div>
      <div class="lc-choice">
        <span class="lc-tag">Your cloud game</span>
        <span class="lc-date">Started {fmt(sorted[1].createdAt.microsSinceUnixEpoch)}</span>
        <button class="pill pill--lg" onclick={() => keep(sorted[0].id)}>
          Keep this game
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
.lc-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1rem;
  text-align: center;
  background: rgba(6, 8, 16, 0.82);
  backdrop-filter: blur(6px);
  color: var(--ink-soft);
  font-family: var(--display);
  font-size: 1.15rem;
}
.lc-orb {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 40% 35%,
    var(--brass-bright),
    var(--brass-deep) 60%,
    transparent 72%
  );
  box-shadow: 0 0 50px -6px rgba(var(--brass-rgb), 0.5);
  animation: lc-pulse 2.4s ease-in-out infinite;
}
@keyframes lc-pulse {
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
.lc-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
  margin-top: 1.2rem;
}
.lc-choice {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--panel-edge);
  background: rgba(var(--chrome-rgb), 0.5);
}
.lc-choice--rec {
  border-color: rgba(var(--edge-rgb), 0.45);
  box-shadow: 0 0 0 1px rgba(var(--edge-rgb), 0.25);
}
.lc-tag {
  font-family: var(--display);
  font-weight: 700;
  color: var(--ink);
}
.lc-date {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--ink-faint);
}
.lc-badge {
  font-family: var(--mono);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--astral);
}
.lc-choice button {
  margin-top: 0.4rem;
  align-self: stretch;
  cursor: pointer;
}
</style>
