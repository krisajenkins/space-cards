<script lang="ts">
import { useTable, useReducer } from "spacetimedb/svelte";
import { tables, reducers } from "../module_bindings";
import { playFinale } from "./finale";

// Earned milestones (id + achId + seen + title/description). The catalogue text
// is folded into the view because achievement_def is private — you can't read
// the blurb of a milestone you haven't unlocked. Only UNSEEN rows pop as
// toasters; clicking one calls mark_achievement_seen to silence it (the earned
// row stays).
const [earned] = useTable(tables.myAchievements);
const markSeen = useReducer(reducers.markAchievementSeen);

// Newest first, so a freshly-earned milestone stacks on top.
const toasts = $derived(
  $earned
    .filter((a) => !a.seen)
    .sort(
      (x, y) =>
        Number(y.earnedAt.microsSinceUnixEpoch) -
        Number(x.earnedAt.microsSinceUnixEpoch),
    ),
);

function dismiss(id: bigint, achId: string) {
  markSeen({ achievementId: id });
  // The win toast doesn't just go quiet — dismissing it rolls the credits:
  // launch the endgame cinematic over the (now-faded) board.
  if (achId === "escape") playFinale();
}

// Most milestones are trophies. Two bookend the story and get their own voice:
// `crash` is the opening distress log (not a reward), `escape` is the win. Falls
// back to the trophy for everything in between.
const ICON: Record<string, string> = { crash: "☄", escape: "✦" };
const EYEBROW: Record<string, string> = {
  crash: "Distress log",
  escape: "Mission complete",
};
const iconFor = (achId: string) => ICON[achId] ?? "🏆";
const eyebrowFor = (achId: string) => EYEBROW[achId] ?? "Achievement unlocked";
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <button
      class="toast"
      class:win={t.achId === "escape"}
      class:intro={t.achId === "crash"}
      onclick={() => dismiss(t.id, t.achId)}
      title="Dismiss"
    >
      <span class="trophy">{iconFor(t.achId)}</span>
      <span class="body">
        <span class="eyebrow">{eyebrowFor(t.achId)}</span>
        <span class="title">{t.title || t.achId}</span>
        {#if t.description}
          <span class="desc">{t.description}</span>
        {/if}
      </span>
      <span class="dismiss" aria-hidden="true">×</span>
    </button>
  {/each}
</div>

<style>
.toasts {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-width: min(360px, 80vw);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  text-align: left;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--panel-edge);
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(20, 24, 38, 0.96), rgba(10, 12, 22, 0.96));
  box-shadow:
    0 10px 30px -8px rgba(0, 0, 0, 0.6),
    0 0 22px -6px rgba(203, 166, 90, 0.35);
  cursor: pointer;
  color: var(--ink);
  font-family: var(--body);
  animation: slide-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.toast:hover {
  transform: translateX(2px);
  border-color: var(--brass);
}
.toast.win {
  border-color: var(--astral);
  box-shadow:
    0 10px 30px -8px rgba(0, 0, 0, 0.7),
    0 0 30px -4px rgba(116, 199, 214, 0.55);
}
/* The crash distress log: a warm ember alert, set apart from the brass trophies. */
.toast.intro {
  border-color: var(--ember);
  box-shadow:
    0 10px 30px -8px rgba(0, 0, 0, 0.7),
    0 0 30px -4px rgba(239, 122, 82, 0.5);
}
.toast.intro .eyebrow,
.toast.intro .title {
  color: var(--ember);
}
.trophy {
  font-size: 1.5rem;
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(203, 166, 90, 0.5));
}
.body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.eyebrow {
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.58rem;
  color: var(--astral);
}
.title {
  font-family: var(--display);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--brass-bright);
}
.toast.win .title {
  color: var(--astral-bright);
}
.desc {
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.dismiss {
  margin-left: auto;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--ink-faint);
  flex: 0 0 auto;
}
.toast:hover .dismiss {
  color: var(--ink);
}
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(-16px) scale(0.96);
  }
}
</style>
