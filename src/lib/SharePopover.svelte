<script lang="ts">
// ── Share popover ─────────────────────────────────────────────────────────────
// A small menu of per-network share links (X, Bluesky, Mastodon, LinkedIn,
// WhatsApp) plus a "Copy link" item. Replaces the native OS share sheet so the
// player gets a real prefilled post on the network of their choice. Anchored by
// its caller (positioned relative to the Share button). Dismisses on
// outside-click and Escape; styled to match the topbar's brass/astral pills.
import { copyLink, shareLinks } from "./share";

let {
  text,
  open = $bindable(),
  placement = "below",
}: {
  text: string;
  open: boolean;
  placement?: "above" | "below";
} = $props();

const links = $derived(shareLinks({ text }));

let copyLabel = $state("Copy link");
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function onCopy() {
  const ok = await copyLink();
  if (ok) {
    copyLabel = "Link copied!";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copyLabel = "Copy link"), 2000);
  }
}

function close() {
  open = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

// Outside-click dismissal. The popover's own clicks are stopped (below) so they
// never bubble to this window handler.
function onWindowPointerdown() {
  if (open) close();
}
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onWindowPointerdown} />

{#if open}
  <!-- Stop pointer events bubbling so a click inside the menu doesn't trip the
       outside-click dismissal on the window. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="share-menu"
    class:above={placement === "above"}
    role="menu"
    tabindex="-1"
    aria-label="Share Escape the Moon"
    onpointerdown={(e) => e.stopPropagation()}
  >
    {#each links as link (link.label)}
      <a
        class="share-item"
        role="menuitem"
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        onclick={close}
      >
        {link.label}
      </a>
    {/each}
    <button class="share-item share-copy" role="menuitem" onclick={onCopy}>
      {copyLabel}
    </button>
  </div>
{/if}

<style>
.share-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 60;
  min-width: 12rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 12px;
  box-shadow:
    0 1px 0 rgba(var(--highlight-rgb), 0.08) inset,
    0 24px 50px -18px rgba(var(--shadow-rgb), 0.85);
  animation: share-rise 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.share-menu.above {
  top: auto;
  bottom: calc(100% + 0.5rem);
  animation-name: share-rise-above;
}
@keyframes share-rise {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
@keyframes share-rise-above {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.share-item {
  appearance: none;
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.7rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--ink-soft);
  font-family: var(--body);
  font-weight: 600;
  font-size: 0.85rem;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition:
    color 0.12s ease,
    background-color 0.12s ease;
}
.share-item:hover {
  color: var(--brass-bright);
  background: rgba(var(--chrome-rgb), 0.7);
}
.share-copy {
  margin-top: 0.2rem;
  border-top: 1px solid var(--panel-edge);
  border-radius: 0 0 8px 8px;
  color: var(--astral);
}
.share-copy:hover {
  color: var(--astral-bright);
}
</style>
