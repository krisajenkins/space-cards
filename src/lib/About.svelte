<script lang="ts">
// ── About box ────────────────────────────────────────────────────────────
// A small "?" in the topbar opens this modal. Everything you'll want to edit
// is right here at the top: the blurb paragraphs and the two link lists.
// Keep it copy — no game state, no props.

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

function close() {
  open = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}
</script>

<svelte:window onkeydown={onKeydown} />

<button
  class="about-trigger"
  title="About Space Cards"
  onclick={() => (open = true)}
>
  About
</button>

{#if open}
  <!-- Backdrop: click outside the panel to dismiss. The × button and Escape
       (svelte:window above) are the keyboard-accessible close affordances; the
       backdrop click is a mouse-only enhancement. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="about-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="about-panel"
      role="dialog"
      aria-modal="true"
      aria-label="About Space Cards"
    >
      <button class="about-close" aria-label="Close" onclick={close}>×</button>

      <p class="about-eyebrow">A tabletop engine of factories &amp; resources</p>
      <h2 class="about-title">Space&nbsp;Cards</h2>

      <p class="about-body">
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
    </div>
  </div>
{/if}

<style>
.about-trigger {
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
  transition:
    color 0.12s ease,
    border-color 0.12s ease;
}
.about-trigger:hover {
  color: var(--brass-bright);
  border-color: rgba(201, 214, 255, 0.25);
}

.about-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.66);
  backdrop-filter: blur(3px);
  animation: about-fade 0.16s ease both;
}
@keyframes about-fade {
  from {
    opacity: 0;
  }
}

.about-panel {
  position: relative;
  width: min(34rem, 100%);
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  padding: 2rem 2.2rem 2.2rem;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  animation: about-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes about-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

.about-close {
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
  transition: color 0.12s ease;
}
.about-close:hover {
  color: var(--ink);
}

.about-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.62rem;
  color: var(--astral);
  margin: 0 0 0.6rem;
  padding-left: 0.28em;
}
.about-title {
  font-family: var(--display);
  font-weight: 900;
  font-size: 2.4rem;
  line-height: 1.3;
  margin: 0 0 1.1rem;
  background: linear-gradient(180deg, #fbf4e2 8%, var(--brass) 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.about-body {
  color: var(--ink-soft);
  line-height: 1.55;
  margin: 0 0 1.6rem;
}
.about-body em {
  color: var(--brass-bright);
  font-style: italic;
}

.about-cols {
  display: flex;
  gap: 2.4rem;
  flex-wrap: wrap;
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
