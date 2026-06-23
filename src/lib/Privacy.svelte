<script lang="ts">
// ── Privacy notice ─────────────────────────────────────────────────────────
// A "Privacy" trigger that opens the privacy policy in a modal. The canonical
// text lives in docs/PRIVACY.md; this is its user-facing copy. Shown both in the
// signed-in topbar (a pill) and on the sign-in screen (a plain link, `link`
// prop) so the notice is reachable at the point data is first collected.
//
// Keep the prose here in step with docs/PRIVACY.md.

let { link = false }: { link?: boolean } = $props();

let open = $state(false);

function close() {
  open = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}
</script>

<svelte:window onkeydown={onKeydown} />

<button
  class:privacy-trigger={!link}
  class:privacy-link={link}
  title="Privacy policy"
  onclick={() => (open = true)}
>
  Privacy
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="privacy-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="privacy-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Privacy policy"
    >
      <button class="privacy-close" aria-label="Close" onclick={close}>×</button>

      <p class="privacy-eyebrow">Last updated 23 June 2026</p>
      <h2 class="privacy-title">Privacy</h2>

      <div class="privacy-body">
        <p>
          This explains what personal data <strong>Space Cards</strong> collects,
          why, where it goes, and the rights you have over it.
        </p>

        <h3>Who is responsible</h3>
        <p>
          Space Cards is a personal project run by Kris Jenkins (the data
          controller). For any privacy question, or to exercise any right below,
          contact <a href="mailto:krisajenkins@gmail.com">krisajenkins@gmail.com</a>.
        </p>

        <h3>What we collect</h3>
        <p>
          When you sign in with Google we store your <strong>email address</strong>
          (which identifies your account), your <strong>display name</strong>, and
          your <strong>profile picture</strong>. As you play, we store your
          <strong>game data</strong> — the boards you start, their cards, your
          achievements, and when they were created.
        </p>
        <p>
          We do not collect your IP address, device identifiers, location, or any
          advertising/analytics profile. There are no tracking scripts in the game.
        </p>

        <h3>Why, and our lawful basis</h3>
        <p>
          We process this on the basis of <strong>legitimate interest</strong>: to
          sign you in and recognise you when you return, and to run your game and
          identify the players in it. Your email is never shown to other players —
          it is removed before it leaves the server in any shared view.
        </p>

        <h3>Where it's stored</h3>
        <p>
          Your account and game data live in <strong>SpacetimeDB Maincloud</strong>,
          a hosted database that acts as our processor. Its servers are in the
          <strong>United States</strong>, so playing involves an international
          transfer of your data outside the UK/EU. We share your sign-in with
          <strong>Google</strong>, which authenticates you. We never sell your data.
        </p>

        <h3>Browser storage</h3>
        <p>
          To keep you signed in, the game stores two authentication tokens in your
          browser's local storage. They are strictly necessary and are cleared when
          you sign out. We set no advertising or tracking cookies.
        </p>

        <h3>How long we keep it</h3>
        <p>
          We keep your data until <strong>you delete your account</strong>. The
          "Delete account" button (next to "Sign out") erases your profile and all
          your game data immediately and permanently.
        </p>

        <h3>Your rights</h3>
        <p>
          You can access, correct, erase, restrict, object to, or get a copy of your
          data. Erasure is built in via "Delete account"; for anything else, email
          the address above. If you think we've mishandled your data, you can
          complain to the UK's Information Commissioner's Office
          (<a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>).
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
/* Topbar pill — matches About/Tree/Share triggers. */
.privacy-trigger {
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
  transition:
    color 0.12s ease,
    border-color 0.12s ease;
}
.privacy-trigger:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
}

/* Hero-footer link — quiet, inline with the connection status. */
.privacy-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
  cursor: pointer;
  transition: color 0.12s ease;
}
.privacy-link:hover {
  color: var(--astral-bright);
}

.privacy-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.66);
  backdrop-filter: blur(3px);
  animation: privacy-fade 0.16s ease both;
}
@keyframes privacy-fade {
  from {
    opacity: 0;
  }
}

.privacy-panel {
  position: relative;
  width: min(38rem, 100%);
  max-height: 82vh;
  overflow-y: auto;
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  padding: 2rem 2.2rem 2.2rem;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  animation: privacy-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes privacy-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

.privacy-close {
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
.privacy-close:hover {
  color: var(--ink);
}

.privacy-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.62rem;
  color: var(--astral);
  margin: 0 0 0.6rem;
  padding-left: 0.28em;
}
.privacy-title {
  font-family: var(--display);
  font-weight: 900;
  font-size: 2.2rem;
  line-height: 1.3;
  margin: 0 0 1.3rem;
  background: linear-gradient(180deg, #fbf4e2 8%, var(--brass) 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.privacy-body {
  color: var(--ink-soft);
  line-height: 1.55;
}
.privacy-body h3 {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.66rem;
  font-weight: 400;
  color: var(--ink-faint);
  margin: 1.4rem 0 0.5rem;
}
.privacy-body p {
  margin: 0 0 0.8rem;
}
.privacy-body strong {
  color: var(--ink);
  font-weight: 600;
}
.privacy-body a {
  color: var(--astral);
  text-decoration: none;
  font-weight: 600;
}
.privacy-body a:hover {
  color: var(--astral-bright);
  text-decoration: underline;
}
</style>
