<script lang="ts">
import { useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from '../module_bindings';
import {
  GOOGLE_CLIENT_ID,
  renderGoogleButton,
  signOutGoogle,
  rememberLinkClaim,
} from './google';
import Modal from './Modal.svelte';

// `me_view` returns one row once this principal is linked to a user, else [].
const [me, meReady] = useTable(tables.meView);
// The pending link-claim code for the anonymous "Save game" flow (empty until
// beginLink mints one, then this principal — and only it — can read it back).
const [linkClaim] = useTable(tables.myLinkClaim);

const deleteMyAccount = useReducer(reducers.deleteMyAccount);
const beginLink = useReducer(reducers.beginLink);

const profile = $derived($me[0]);

// "Save game" via Google's official button: the button's callback reloads the
// page the instant sign-in completes, so there's no "on click" window to mint a
// claim code first. Instead we mint it EAGERLY while still anonymous and stash it
// in localStorage, so it's already there when the reload fires. After the reload
// LinkClaim redeems it as the now-Google connection. (The code is single-use and
// TTL'd; if the player never signs in it just expires.)
let minted = $state(false);
$effect(() => {
  if ($meReady && profile?.isAnonymous && !minted) {
    minted = true;
    beginLink();
  }
});
$effect(() => {
  if ($linkClaim.length > 0) rememberLinkClaim($linkClaim[0].code);
});

// The "Save game" pill opens an explainer modal (auto-saved here vs. link to
// Google for cross-device play); Google's official button is rendered inside it.
let saveOpen = $state(false);
let saveButtonEl = $state<HTMLDivElement>();
$effect(() => {
  if (
    saveOpen &&
    saveButtonEl &&
    $meReady &&
    profile?.isAnonymous &&
    GOOGLE_CLIENT_ID
  ) {
    renderGoogleButton(saveButtonEl);
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

const initial = $derived((profile?.displayName?.trim()?.[0] ?? '?').toUpperCase());
</script>

<div class="signin">
  {#if !$meReady}
    <span class="muted">Connecting…</span>
  {:else if profile && profile.isAnonymous}
    <!-- Anonymous play: a quiet brass "Save game" pill that opens an explainer
         modal. The game is already auto-saved to this browser; the modal offers
         linking to Google for cross-device play. The claim code is minted eagerly
         (see <script>) so it's stashed before Google's callback reloads. -->
    {#if GOOGLE_CLIENT_ID}
      <button
        class="pill pill--go"
        title="Save your game so you can play on any device"
        onclick={() => (saveOpen = true)}
      >
        Save game
      </button>
    {/if}
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

<!-- ── Save-game modal: reassure that play is already saved locally, and offer the
     Google link for cross-device play. Google's (un-restylable) button lives
     inside, so the bright G mark is contained to this deliberate moment. ─────── -->
{#if saveOpen && profile?.isAnonymous}
  <Modal
    label="Save your game"
    zIndex={110}
    eyebrow="Your game"
    onClose={() => (saveOpen = false)}
  >
    <p class="modal-body">
      Your game is <strong>already saved to this browser</strong> — close the tab
      and come straight back to it whenever you like.
    </p>
    <p class="modal-body">
      To play across devices and browsers — or to keep it safe if your browser
      data ever gets cleared — link this game to your Google account.
    </p>
    <div class="save-modal-cta">
      <div bind:this={saveButtonEl}></div>
    </div>
  </Modal>
{/if}

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
/* Centres Google's (un-restylable, cross-origin) button within the save modal,
   set off from the explanatory copy above it. */
.save-modal-cta {
  display: flex;
  justify-content: center;
  margin-top: 1.6rem;
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
