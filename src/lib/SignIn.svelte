<script lang="ts">
import { useTable } from 'spacetimedb/svelte';
import { tables } from '../module_bindings';
import { GOOGLE_CLIENT_ID, renderGoogleButton, signOutGoogle } from './google';

// `me_view` returns one row once this principal is linked to a user, else [].
const [me, meReady] = useTable(tables.meView);

let buttonEl = $state<HTMLDivElement>();

$effect(() => {
  // Render the Google button only while signed out and once the element exists.
  if (buttonEl && $meReady && $me.length === 0) {
    renderGoogleButton(buttonEl);
  }
});

const profile = $derived($me[0]);
</script>

<div class="signin">
  {#if !$meReady}
    <span class="muted">Connecting…</span>
  {:else if profile}
    {#if profile.pictureUrl}
      <img class="avatar" src={profile.pictureUrl} alt="" referrerpolicy="no-referrer" />
    {/if}
    <span>Signed in as <strong>{profile.displayName}</strong></span>
    {#if profile.isAdmin}<span class="badge">admin</span>{/if}
    <button onclick={signOutGoogle}>Sign out</button>
  {:else}
    {#if GOOGLE_CLIENT_ID}
      <div bind:this={buttonEl}></div>
    {:else}
      <span class="muted">Google sign-in not configured.</span>
    {/if}
  {/if}
</div>

<style>
.signin {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
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
</style>
