<script lang="ts">
// ── Privacy notice ─────────────────────────────────────────────────────────
// A "Privacy" trigger that opens the privacy policy in a modal. The canonical
// text lives in docs/PRIVACY.md; this is its user-facing copy. Shown both in the
// signed-in topbar (a pill) and on the sign-in screen (a plain link, `link`
// prop) so the notice is reachable at the point data is first collected.
//
// Keep the prose here in step with docs/PRIVACY.md.
import Modal from "./Modal.svelte";

let { link = false }: { link?: boolean } = $props();

let open = $state(false);
</script>

<button
  class:pill={!link}
  class:privacy-link={link}
  title="Privacy policy"
  onclick={() => (open = true)}
>
  Privacy
</button>

{#if open}
  <Modal
    label="Privacy policy"
    width="38rem"
    zIndex={110}
    scroll
    eyebrow="Last updated 23 June 2026"
    title="Privacy"
    onClose={() => (open = false)}
  >
    <div class="modal-body">
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
  </Modal>
{/if}

<style>
/* Hero-footer link — quiet, inline with the connection status. The topbar
   variant uses the shared `.pill` class instead. */
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
</style>
