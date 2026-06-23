<script lang="ts">
import { useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from '../module_bindings';
import { GOOGLE_CLIENT_ID, renderGoogleButton, signOutGoogle } from './google';

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

// Escape peels one layer at a time (confirm → profile), and never while the
// erase is in flight.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || deleting) return;
  if (confirmDelete) confirmDelete = false;
  else if (profileOpen) profileOpen = false;
}

const profile = $derived($me[0]);
const initial = $derived((profile?.displayName?.trim()?.[0] ?? '?').toUpperCase());
</script>

<svelte:window onkeydown={onKeydown} />

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
    <button class="signout-btn" onclick={signOutGoogle}>Sign out</button>
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
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="pf-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) profileOpen = false;
    }}
  >
    <div class="pf-panel" role="dialog" aria-modal="true" aria-label="Your profile">
      <button class="pf-close" aria-label="Close" onclick={() => (profileOpen = false)}>×</button>

      <p class="pf-eyebrow">Your account</p>
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

      <div class="pf-actions">
        <button class="pf-btn" onclick={() => (profileOpen = false)}>Close</button>
        <button class="pf-btn pf-btn-danger" onclick={() => (confirmDelete = true)}>
          Delete account
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Delete confirmation (layered above the profile) ───────────────────────── -->
{#if confirmDelete || deleting}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="del-backdrop"
    role="presentation"
    onclick={(e) => {
      if (!deleting && e.target === e.currentTarget) confirmDelete = false;
    }}
  >
    <div class="del-panel" role="dialog" aria-modal="true" aria-label="Delete your account">
      {#if !deleting}
        <button class="del-close" aria-label="Close" onclick={() => (confirmDelete = false)}>×</button>
      {/if}

      <p class="del-eyebrow">This can't be undone</p>
      <h2 class="del-title">Delete your account</h2>

      {#if deleting}
        <p class="del-body">Erasing your account and all its data…</p>
      {:else}
        <p class="del-body">
          This permanently erases everything we hold about you: your profile
          (name, email and picture), every game board you've started, and all
          its cards, history and achievements. There is no recovery and no
          backup — once it's gone, it's gone.
        </p>
        <div class="del-actions">
          <button class="del-btn" onclick={() => (confirmDelete = false)}>Cancel</button>
          <button class="del-btn del-btn-go" onclick={requestDelete}>Delete everything</button>
        </div>
      {/if}
    </div>
  </div>
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

/* Account pill — matches the Privacy/About topbar pills, with a quiet inset
   highlight and a brass hover. (Without this the button fell back to the bare
   browser default and stood out against the styled topbar.) */
.signout-btn {
  appearance: none;
  padding: 0.3rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(20, 26, 46, 0.7);
  color: var(--ink-soft);
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(255, 240, 200, 0.05) inset;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}
.signout-btn:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
  background: rgba(28, 36, 62, 0.8);
}

/* ── Profile modal ─────────────────────────────────────────────────────────
   Adapted from About.svelte's backdrop/panel so the modals match. */
.pf-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.66);
  backdrop-filter: blur(3px);
  animation: pf-fade 0.16s ease both;
}
@keyframes pf-fade {
  from {
    opacity: 0;
  }
}
.pf-panel {
  position: relative;
  width: min(30rem, 100%);
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  padding: 2rem 2.2rem 2.2rem;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  animation: pf-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes pf-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
.pf-close {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  appearance: none;
  border: none;
  background: none;
  color: var(--ink-faint);
  font-size: 1.6rem;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  transition: color 0.12s ease;
}
.pf-close:hover {
  color: var(--ink);
}
.pf-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.62rem;
  color: var(--astral);
  margin: 0 0 0.9rem;
  padding-left: 0.28em;
}
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
  margin: 0 0 1.8rem;
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
.pf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
}
.pf-btn {
  appearance: none;
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(20, 26, 46, 0.7);
  color: var(--ink-soft);
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease;
}
.pf-btn:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
}
.pf-btn-danger {
  color: var(--ember, #d2603a);
  border-color: rgba(210, 96, 58, 0.4);
}
.pf-btn-danger:hover {
  color: #ff8a63;
  border-color: rgba(210, 96, 58, 0.7);
}

/* ── Delete-account confirmation modal ─────────────────────────────────────
   Layered above the profile (higher z-index); cancel returns to the profile. */
.del-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.66);
  backdrop-filter: blur(3px);
  animation: del-fade 0.16s ease both;
}
@keyframes del-fade {
  from {
    opacity: 0;
  }
}
.del-panel {
  position: relative;
  width: min(30rem, 100%);
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  padding: 2rem 2.2rem 2.2rem;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  animation: del-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes del-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
.del-close {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  appearance: none;
  border: none;
  background: none;
  color: var(--ink-faint);
  font-size: 1.6rem;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  transition: color 0.12s ease;
}
.del-close:hover {
  color: var(--ink);
}
.del-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.62rem;
  color: var(--ember, #d2603a);
  margin: 0 0 0.6rem;
  padding-left: 0.28em;
}
.del-title {
  font-family: var(--display);
  font-weight: 900;
  font-size: 2rem;
  line-height: 1;
  margin: 0 0 1.1rem;
  color: var(--ink);
}
.del-body {
  color: var(--ink-soft);
  line-height: 1.55;
  margin: 0 0 1.8rem;
}
.del-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
}
.del-btn {
  appearance: none;
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: rgba(20, 26, 46, 0.7);
  color: var(--ink-soft);
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.12s ease,
    border-color 0.12s ease;
}
.del-btn:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
}
.del-btn-go {
  color: #ff8a63;
  border-color: rgba(210, 96, 58, 0.6);
  background: rgba(210, 96, 58, 0.14);
}
.del-btn-go:hover {
  color: #ffae90;
  border-color: rgba(210, 96, 58, 0.9);
}
</style>
