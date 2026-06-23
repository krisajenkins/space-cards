<script lang="ts">
// ── About box ────────────────────────────────────────────────────────────
// A small "About" pill in the topbar opens this modal. Everything you'll want
// to edit is right here at the top: the blurb paragraph and the two link lists.
// Keep it copy — no game state, no props.
import Modal from "./Modal.svelte";

let open = $state(false);

// Who made this.
const me = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/krisjenkins/" },
  { label: "Bluesky", href: "https://bsky.app/profile/krisajenkins.com" },
  { label: "Youtube", href: "http://youtube.com/@developervoices" },
];

// What it's built on.
const builtWith = [
  { label: "SpacetimeDB (Engine)", href: "https://spacetimedb.com/" },
  { label: "Svelte (UI)", href: "https://svelte.dev/" },
  { label: "WebCola (Layout)", href: "https://ialab.it.monash.edu/webcola/" },
];
</script>

<button class="pill" title="About Space Cards" onclick={() => (open = true)}>
  About
</button>

{#if open}
  <Modal
    label="About Space Cards"
    width="34rem"
    eyebrow="A tabletop engine of factories & resources"
    title={"Space Cards"}
    onClose={() => (open = false)}
  >
    <p class="modal-body">
      Crash-land on the Moon and claw your way home: gather regolith, refine
      metal, fabricate parts, set drones to work, and build a rocket out of
      the wreck. Cards are either resources or processes — little
      machines you feed cards to and wait for it to turn time into something
      new.
    </p>

    <div class="about-cols">
      <section class="about-links">
        <h3>Made by Kris Jenkins</h3>
        <ul>
          {#each me as link (link.href)}
            <li>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </section>

      <section class="about-links">
        <h3>Built with</h3>
        <ul>
          {#each builtWith as link (link.href)}
            <li>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </Modal>
{/if}

<style>
.about-cols {
  display: flex;
  gap: 2.4rem;
  flex-wrap: wrap;
  margin-top: 1.6rem;
}
.about-links h3 {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.66rem;
  font-weight: 400;
  color: var(--ink-faint);
  margin: 0 0 0.7rem;
}
.about-links ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.about-links a {
  color: var(--astral);
  text-decoration: none;
  font-weight: 600;
  transition: color 0.12s ease;
}
.about-links a:hover {
  color: var(--astral-bright);
  text-decoration: underline;
}
</style>
