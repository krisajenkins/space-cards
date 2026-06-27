<script lang="ts">
import { useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from '../module_bindings';
import {
  GOOGLE_CLIENT_ID,
  renderGoogleButton,
  signOutGoogle,
  rememberLinkClaim,
  promptGoogleSignIn,
} from './google';
import Modal from './Modal.svelte';

// `me_view` returns one row once this principal is linked to a user, else [].
const [me, meReady] = useTable(tables.meView);
// The pending link-claim code for the anonymous "Save game" flow (empty until
// beginLink mints one, then this principal — and only it — can read it back).
const [linkClaim] = useTable(tables.myLinkClaim);

const deleteMyAccount = useReducer(reducers.deleteMyAccount);
const beginLink = useReducer(reducers.beginLink);

// "Save game": ask the server to mint a claim code, then (once it arrives) stash
// it and trigger Google sign-in — which reloads the page, after which LinkClaim
// redeems the code as the now-Google connection. `prompted` keeps the reactive
// $effect from re-firing the prompt while we wait on the reload.
let saving = $state(false);
let prompted = $state(false);
function startSave() {
  if (saving) return;
  saving = true;
  prompted = false;
  beginLink();
}
$effect(() => {
  if (saving && !prompted && $linkClaim.length > 0) {
    prompted = true;
    rememberLinkClaim($linkClaim[0].code);
    void promptGoogleSignIn();
  }
});

let buttonEl = $state<HTMLDivElement>();
// The avatar opens a profile modal (also the GDPR "right of access" surface — it
// shows the data we hold). Account deletion lives a layer deeper, behind its own
// typed confirmation, so it can't be hit by a stray click in the topbar.
let profileOpen = $state(false);
let confirmDelete = $state(false);
let deleting = $state(false);

$effect(() => {
  // Render the Google button only while signed out and once the element exists.
  if (buttonEl && $meReady && $me.length === 0) {
    renderGoogleButton(buttonEl);
  }
});

// Erasure completes when our `me_view` row vanishes (the server deleted the user
// + every identity). Only THEN do we sign out — which clears BOTH the SpacetimeDB
// session token AND the Google ID token. Clearing the Google token is the bit
// that matters: leave it and the next reconnect would re-link the still-valid
// ~1h JWT in onConnect and silently re-create the account we just erased.
$effect(() => {
  if (deleting && $meReady && $me.length === 0) {
    signOutGoogle(); // clears tokens + reloads to a fresh anonymous session
  }
});

function requestDelete() {
  deleting = true;
  confirmDelete = false;
  profileOpen = false;
  deleteMyAccount();
}

const profile = $derived($me[0]);
const initial = $derived((profile?.displayName?.trim()?.[0] ?? '?').toUpperCase());
</script>

<div class="signin">
  {#if !$meReady}
    <span class="muted">Connecting…</span>
  {:else if profile && profile.isAnonymous}
    <!-- Anonymous play: a highlighted CTA to link a Google account so the game
         is saved and portable across devices. -->
    <button
      class="pill pill--go save-btn"
      onclick={startSave}
      disabled={saving}
      title="Saving links your game to Google so you can play on any device"
    >
      <svg class="g-glyph" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3.01-2.34z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
      </svg>
      {saving ? 'Saving…' : 'Save game'}
    </button>
  {:else if profile}
    {#if profile.isAdmin}<span class="badge">admin</span>{/if}
    <button
      class="avatar-btn"
      title="Your profile"
      aria-haspopup="dialog"
      onclick={() => (profileOpen = true)}
    >
      {#if profile.pictureUrl}
        <img class="avatar" src={profile.pictureUrl} alt={profile.displayName} referrerpolicy="no-referrer" />
      {:else}
        <span class="avatar avatar-fallback">{initial}</span>
      {/if}
    </button>
    <button class="pill" onclick={signOutGoogle}>Sign out</button>
  {:else}
    {#if GOOGLE_CLIENT_ID}
      <div bind:this={buttonEl}></div>
    {:else}
      <span class="muted">Google sign-in not configured.</span>
    {/if}
  {/if}
</div>

<!-- ── Profile modal: the data we hold + a way out (close) and a way to erase ── -->
{#if profileOpen && profile}
  <Modal
    label="Your profile"
    zIndex={110}
    eyebrow="Your account"
    onClose={() => (profileOpen = false)}
  >
      <div class="pf-head">
        {#if profile.pictureUrl}
          <img class="pf-avatar" src={profile.pictureUrl} alt={profile.displayName} referrerpolicy="no-referrer" />
        {:else}
          <span class="pf-avatar pf-avatar-fallback">{initial}</span>
        {/if}
        <h2 class="pf-name">{profile.displayName}</h2>
      </div>

      <p class="pf-intro">This is all the personal data we hold about you:</p>
      <dl class="pf-data">
        <dt>Name</dt>
        <dd>{profile.displayName}</dd>
        <dt>Email</dt>
        <dd>{profile.primaryEmail}</dd>
        <dt>Picture</dt>
        <dd>{profile.pictureUrl ?? '—'}</dd>
        <dt>Role</dt>
        <dd>{profile.isAdmin ? 'Administrator' : 'Player'}</dd>
        <dt>Account&nbsp;ID</dt>
        <dd>#{profile.userId}</dd>
      </dl>

      <div class="modal-actions">
        <button class="pill pill--lg" onclick={() => (profileOpen = false)}>Close</button>
        <button class="pill pill--lg pill--danger" onclick={() => (confirmDelete = true)}>
          Delete account
        </button>
      </div>
  </Modal>
{/if}

<!-- ── Delete confirmation (layered above the profile) ───────────────────────── -->
{#if confirmDelete || deleting}
  <Modal
    label="Delete your account"
    zIndex={120}
    dismissible={!deleting}
    eyebrow="This can't be undone"
    eyebrowTone="ember"
    title="Delete your account"
    titleTone="plain"
    onClose={() => (confirmDelete = false)}
  >
    {#if deleting}
      <p class="modal-body">Erasing your account and all its data…</p>
    {:else}
      <p class="modal-body">
        This permanently erases everything we hold about you: your profile
        (name, email and picture), every game board you've started, and all
        its cards, history and achievements. There is no recovery and no
        backup — once it's gone, it's gone.
      </p>
      <div class="modal-actions">
        <button class="pill pill--lg" onclick={() => (confirmDelete = false)}>Cancel</button>
        <button class="pill pill--lg pill--danger-go" onclick={requestDelete}>Delete everything</button>
      </div>
    {/if}
  </Modal>
{/if}

<style>
.signin {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.g-glyph {
  width: 1rem;
  height: 1rem;
  /* Sit the multicolour Google mark on a white chip so it reads on the brass
     pill without the coloured strokes muddying into the background. */
  background: #fff;
  border-radius: 2px;
  padding: 1px;
  box-sizing: content-box;
}
.avatar-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  border-radius: 50%;
  line-height: 0;
  cursor: pointer;
  outline-offset: 2px;
  transition:
    box-shadow 0.12s ease,
    transform 0.12s ease;
}
.avatar-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 0 2px rgba(var(--edge-rgb), 0.35);
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: block;
}
.avatar-fallback {
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, var(--brass), var(--brass-deep));
  color: #0c0e18;
  font-family: var(--display);
  font-weight: 700;
  font-size: 0.85rem;
}
.muted {
  color: #888;
}
.badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  background: #4338ca;
  color: white;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

/* ── Profile modal — the bits unique to the account view; the backdrop, panel,
   close button and eyebrow come from <Modal>. ─────────────────────────────── */
.pf-head {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin: 0 0 1.4rem;
}
.pf-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: block;
  flex: 0 0 auto;
}
.pf-avatar-fallback {
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, var(--brass), var(--brass-deep));
  color: #0c0e18;
  font-family: var(--display);
  font-weight: 700;
  font-size: 1.4rem;
}
.pf-name {
  font-family: var(--display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1.1;
  margin: 0;
  color: var(--ink);
}
.pf-intro {
  color: var(--ink-soft);
  font-size: 0.9rem;
  margin: 0 0 0.9rem;
}
.pf-data {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1.1rem;
  margin: 0;
  font-size: 0.9rem;
}
.pf-data dt {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.64rem;
  color: var(--ink-faint);
  align-self: center;
}
.pf-data dd {
  margin: 0;
  color: var(--ink-soft);
  word-break: break-word;
  overflow-wrap: anywhere;
}
</style>
