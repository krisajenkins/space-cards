<script lang="ts">
// A single inert resource card — a warm parchment token engraved with its
// glyph. Purely presentational: the Board owns position and drag handling and
// wraps this in a draggable surface. `size` lets a hole render a snug copy.
import { visualFor } from "./catalogue";

let {
  defId,
  name,
  category,
  size = "md",
  grabbing = false,
}: {
  defId: string;
  name: string;
  category: string;
  size?: "sm" | "md" | "xl";
  grabbing?: boolean;
} = $props();

const v = $derived(visualFor(defId, category));
</script>

<div
  class="token"
  class:sm={size === "sm"}
  class:xl={size === "xl"}
  class:grabbing
  style="--tint: {v.color}"
>
  <div class="glyph" aria-hidden="true">
    <!-- glyph is a complete <svg>; colour comes from .glyph's `color` via currentColor -->
    {@html v.glyph}
  </div>
  <div class="name">{name}</div>
</div>

<style>
.token {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  width: 92px;
  height: 116px;
  padding: 0.5rem;
  border-radius: 13px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent 30%),
    linear-gradient(180deg, var(--parchment), var(--parchment-2));
  color: var(--parchment-ink);
  border: 1px solid rgba(120, 96, 50, 0.45);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 -10px 18px -14px rgba(70, 50, 10, 0.6) inset,
    0 14px 22px -14px rgba(var(--shadow-rgb), 0.85);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

/* a coloured spine across the top, tinted by category */
.token::before {
  content: "";
  position: absolute;
  inset: 6px 6px auto 6px;
  height: 5px;
  border-radius: 4px;
  background: var(--tint);
  opacity: 0.92;
  box-shadow: 0 0 10px -1px var(--tint);
}

.token.grabbing {
  cursor: grabbing;
}

.glyph {
  color: var(--tint);
  margin-top: 0.35rem;
}
/* :global — the glyph is injected via {@html}, so Svelte's scoping attribute
   never lands on it; an unscoped descendant selector is the only thing that matches. */
.glyph :global(svg) {
  width: 46px;
  height: 46px;
  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.45));
}

.name {
  font-family: var(--display);
  font-weight: 600;
  font-size: 0.86rem;
  line-height: 1;
  text-align: center;
  color: #3a311f;
}

/* compact variant for slots / trays */
.token.sm {
  width: 64px;
  height: 80px;
  border-radius: 10px;
  gap: 0.15rem;
}
.token.sm .glyph :global(svg) {
  width: 30px;
  height: 30px;
}
.token.sm .name {
  font-size: 0.62rem;
}
.token.sm::before {
  height: 4px;
}

/* extra-large variant — the Escape win token, kept prominent on the tabletop
   (2× the standard token). Footprint mirrored in engine/layout.ts. */
.token.xl {
  width: 184px;
  height: 232px;
  border-radius: 22px;
  gap: 0.6rem;
  padding: 1rem;
}
.token.xl .glyph :global(svg) {
  width: 92px;
  height: 92px;
}
.token.xl .name {
  font-size: 1.4rem;
}
.token.xl::before {
  inset: 10px 10px auto 10px;
  height: 8px;
}
</style>
