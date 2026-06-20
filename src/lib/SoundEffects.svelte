<script lang="ts">
// The audio conductor. Renders nothing — it just subscribes to the same live
// `my_*` views the board reads and drives the Web Audio synth in `audio.ts`:
//   • whirr  ← derived boolean "is any situation currently running"
//   • ping   ← a situation leaving the running (Ongoing) state, or being deleted
//   • jingle ← a fresh row appearing in my_achievements
//
// All three hook the SAME reactive signals the rest of the UI already uses, via
// `useTable`'s onInsert/onUpdate/onDelete callbacks — no polling, no new server
// signal. The synth itself is silent until the player's first gesture (autoplay
// policy), which `armAudio` wires up on mount.
import { onMount, onDestroy } from "svelte";
import { get } from "svelte/store";
import { useTable } from "spacetimedb/svelte";
import { tables } from "../module_bindings";
import { stateOf } from "./catalogue";
import { armAudio, setWhirring, playPing, playJingle } from "./audio";

// ── Completion ping: coalesced ───────────────────────────────────────────────
// A burst of completions (e.g. five cards born from one run, or several verbs
// finishing in the same tick) must not fire five overlapping pings into a wall
// of noise. We mark "a completion happened" and flush at most one ping per
// window via a trailing debounce, so any flurry collapses to a single soft bell.
const PING_WINDOW_MS = 180;
let pingPending = false;
let pingTimer: ReturnType<typeof setTimeout> | undefined;
function notePing() {
  pingPending = true;
  if (pingTimer) return;
  pingTimer = setTimeout(() => {
    pingTimer = undefined;
    if (pingPending) {
      pingPending = false;
      playPing();
    }
  }, PING_WINDOW_MS);
}

// A situation is "running" while its state is Ongoing. Completion is the
// transition OUT of Ongoing (onUpdate) or the row vanishing entirely (onDelete).
const wasOngoing = (s: { state: { tag: string } }) =>
  stateOf(s as any) === "ongoing";

const [situations] = useTable(tables.mySituations, {
  onUpdate: (oldRow, newRow) => {
    if (wasOngoing(oldRow) && !wasOngoing(newRow)) notePing();
  },
  onDelete: (row) => {
    // A run that completed and tidied itself away. Re-firing verbs replace their
    // timer rather than delete, so this is a genuine finish.
    if (wasOngoing(row)) notePing();
  },
});

// ── Whirr: any situation currently Ongoing ───────────────────────────────────
// Derived reactively from the live table rows — exactly the same source the
// board's countdown rings read. Goes true the moment a verb starts running,
// false when the last one stops; the synth fades the loop in/out to match.
const anyRunning = $derived($situations.some((s) => stateOf(s) === "ongoing"));
$effect(() => {
  setWhirring(anyRunning);
});

// ── Jingle: a freshly-earned achievement ─────────────────────────────────────
// Mirrors Achievements.svelte, which reacts to unseen achievement rows. The
// cleanest "a NEW one arrived" signal is the table's onInsert. We must skip the
// initial backfill (milestones earned in a past session) so we don't play a
// fanfare on every reload. The subscription's existing rows arrive as onInsert
// callbacks DURING the initial apply, BEFORE onApplied flips isReady true — so
// gating each insert on the live isReady value cleanly silences history and only
// jingles for inserts that land after the snapshot has settled.
const [, achReady] = useTable(tables.myAchievements, {
  onInsert: () => {
    // get() reads the live isReady value without making this callback reactive.
    if (get(achReady)) playJingle();
  },
});

let disarm: () => void = () => {};
onMount(() => {
  disarm = armAudio();
});
onDestroy(() => {
  disarm();
  setWhirring(false);
  if (pingTimer) clearTimeout(pingTimer);
});
</script>
