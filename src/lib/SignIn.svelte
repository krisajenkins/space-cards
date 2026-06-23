<script lang="ts">
import { useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from '../module_bindings';
import { GOOGLE_CLIENT_ID, renderGoogleButton, signOutGoogle } from './google';
import Modal from './Modal.svelte';

// `me_view` returns one row once this principal is linked to a user, else [].
const [me, meReady] = useTable(tables.meView);

const deleteMyAccount = useReducer(reducers.deleteMyAccount);

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
  box-shadow: 0 0 0 2px rgba(201, 214, 255, 0.35);
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
  background: linear-gradient(180deg, var(--brass), var(--brass-deep, #8a6a2f));
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
  background: linear-gradient(180deg, var(--brass), var(--brass-deep, #8a6a2f));
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
