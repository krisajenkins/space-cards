// ── The endgame cinematic flag ───────────────────────────────────────────────
// A transient, in-session signal. Dismissing the "escape" win toast flips this
// true; App mounts <Finale> over the board; closing the finale flips it back.
//
// Deliberately NOT persisted: the launch plays once, in the moment you earn it.
// A reload just drops you back onto your finished board — the win already
// happened, the achievement row is already `seen`, so nothing re-pops.
import { writable } from "svelte/store";

export const finalePlaying = writable(false);

export function playFinale(): void {
  finalePlaying.set(true);
}

export function endFinale(): void {
  finalePlaying.set(false);
}
