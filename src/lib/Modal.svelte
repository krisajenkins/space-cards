<script module lang="ts">
// A stack of the currently-mounted modals. Only the topmost one responds to
// Escape, so nested modals (e.g. the delete-account confirm layered over the
// profile in SignIn) peel one layer at a time instead of all closing at once.
const stack: symbol[] = [];
</script>

<script lang="ts">
// ── Modal ──────────────────────────────────────────────────────────────────
// The shared "celestial workbench" modal chrome: a blurred backdrop, a rising
// panel, a × close button, and an optional eyebrow + title. Mount it behind an
// `{#if open}` and pass `onClose` to dismiss; Modal wires up Escape and
// click-outside for you. Bodies are written by the caller as children, using
// the global `.modal-body` / `.modal-actions` / `.pill` helpers in app.css.
import type { Snippet } from "svelte";

let {
  label,
  width = "30rem",
  zIndex = 100,
  scroll = false,
  dismissible = true,
  onClose,
  eyebrow,
  eyebrowTone = "astral",
  title,
  titleTone = "brass",
  children,
}: {
  label: string;
  width?: string;
  zIndex?: number;
  scroll?: boolean;
  dismissible?: boolean;
  onClose: () => void;
  eyebrow?: string;
  eyebrowTone?: "astral" | "ember";
  title?: string;
  titleTone?: "brass" | "plain";
  children: Snippet;
} = $props();

const id = Symbol();

$effect(() => {
  stack.push(id);
  return () => {
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
  };
});

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !dismissible) return;
  if (stack[stack.length - 1] !== id) return; // only the top modal closes
  onClose();
}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop: click outside the panel to dismiss. The × button and Escape are
     the keyboard-accessible close affordances; the backdrop click is a
     mouse-only enhancement. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="modal-backdrop"
  role="presentation"
  style="z-index: {zIndex}"
  onclick={(e) => {
    if (dismissible && e.target === e.currentTarget) onClose();
  }}
>
  <div
    class="modal-panel"
    class:scroll
    role="dialog"
    aria-modal="true"
    aria-label={label}
    style="width: min({width}, 100%)"
  >
    {#if dismissible}
      <button class="modal-close" aria-label="Close" onclick={onClose}>×</button>
    {/if}

    {#if eyebrow}
      <p class="modal-eyebrow" class:ember={eyebrowTone === "ember"}>{eyebrow}</p>
    {/if}
    {#if title}
      <h2 class="modal-title" class:plain={titleTone === "plain"}>{title}</h2>
    {/if}

    {@render children()}
  </div>
</div>

<style>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(4, 6, 14, 0.66);
  backdrop-filter: blur(3px);
  animation: modal-fade 0.16s ease both;
}
@keyframes modal-fade {
  from {
    opacity: 0;
  }
}

.modal-panel {
  position: relative;
  background: linear-gradient(180deg, var(--panel), var(--void-2));
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  padding: 2rem 2.2rem 2.2rem;
  box-shadow:
    0 1px 0 rgba(255, 240, 200, 0.08) inset,
    0 30px 70px -20px rgba(0, 0, 0, 0.9);
  animation: modal-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.modal-panel.scroll {
  max-height: 82vh;
  overflow-y: auto;
}
@keyframes modal-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

.modal-close {
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
.modal-close:hover {
  color: var(--ink);
}

.modal-eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 0.62rem;
  color: var(--astral);
  margin: 0 0 0.6rem;
  padding-left: 0.28em;
}
.modal-eyebrow.ember {
  color: var(--ember);
}

.modal-title {
  font-family: var(--display);
  font-weight: 900;
  font-size: 2.2rem;
  line-height: 1.2;
  margin: 0 0 1.1rem;
  background: linear-gradient(180deg, #fbf4e2 8%, var(--brass) 92%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.modal-title.plain {
  background: none;
  color: var(--ink);
}
</style>
