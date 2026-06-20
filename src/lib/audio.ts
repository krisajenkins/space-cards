// ── The table's voice ────────────────────────────────────────────────────────
// A tiny Web Audio synth for the celestial workbench. No asset files — every
// sound is generated from oscillators, gain envelopes and filtered noise so the
// repo stays binary-free. Three voices:
//   • whirr  — a soft low hum + filtered-noise bed that LOOPS while any verb is
//              running, and fades out when the bench goes quiet.
//   • ping   — a gentle two-partial bell when a run completes / a card is born.
//   • jingle — a short brass-feel arpeggio when a milestone is earned.
//
// Everything is gated behind the browser autoplay policy: an AudioContext is
// born suspended and may only be resumed inside a user gesture. We create the
// context lazily on the FIRST pointer/key/touch and resume it then; until that
// happens every play call is a silent no-op (no console errors on load). Mute is
// a single source of truth, persisted to localStorage, and silences the master
// gain instantly + suspends the context so nothing leaks while muted.

import { writable, get, type Writable } from "svelte/store";

const MUTE_KEY = "spacecards.muted";

// Persisted mute flag. Default unmuted; sticky across reloads.
function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

// ── Audio graph state (declared before the mute store, because store.subscribe
// fires its callback synchronously on subscribe — which calls applyMute() during
// module evaluation. These must already be initialised by then or applyMute hits
// a temporal-dead-zone error reading `ctx`). The graph itself is built lazily on
// the first user gesture; until then these stay null and every play call no-ops.
let ctx: AudioContext | null = null;
let master: GainNode | null = null; // global volume / mute control
let unlocked = false; // has a user gesture armed the context yet?

// The whirr is a persistent sub-graph kept around between starts; we only ride
// its gain up/down rather than rebuild it each time.
let whirr: {
  bus: GainNode;
  stop: () => void;
} | null = null;
let whirrWanted = false; // desired state, set by setWhirring()

// Tasteful, quiet master ceiling — this is a calm bench, not a klaxon.
const MASTER_VOLUME = 0.6;

export const muted: Writable<boolean> = writable(loadMuted());

muted.subscribe((m) => {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* private mode etc. — non-fatal */
  }
  applyMute(m);
});

export function toggleMute(): void {
  muted.update((m) => !m);
}

// ── Audio graph (built lazily on first gesture; state declared up top) ────────
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = get(muted) ? 0 : MASTER_VOLUME;
  master.connect(ctx.destination);
  return ctx;
}

// Called from the first user gesture (see armAudio). Creates + resumes the
// context, then reconciles the whirr to whatever state was wanted before audio
// was available.
function unlock(): void {
  if (unlocked) return;
  const c = ensureContext();
  if (!c) return;
  unlocked = true;
  if (c.state === "suspended" && !get(muted)) void c.resume();
  reconcileWhirr();
}

// Wire the autoplay-unlock gesture. Idempotent; safe to call from onMount. The
// listeners self-remove after the first successful unlock.
export function armAudio(): () => void {
  if (typeof window === "undefined") return () => {};
  const onGesture = () => unlock();
  const opts = { passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", onGesture, opts);
  window.addEventListener("keydown", onGesture, opts);
  window.addEventListener("touchstart", onGesture, opts);
  return () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    window.removeEventListener("touchstart", onGesture);
  };
}

function applyMute(m: boolean): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, t, 0.05);
  if (m) {
    // Suspend so nothing runs while silenced (saves the oscillators too).
    if (ctx.state === "running") void ctx.suspend();
  } else if (unlocked && ctx.state === "suspended") {
    void ctx.resume();
  }
}

// ── Whirr: low hum + filtered-noise bed, looped while work is in progress ─────
function buildWhirr(
  c: AudioContext,
  out: GainNode,
): { bus: GainNode; stop: () => void } {
  const bus = c.createGain();
  bus.gain.value = 0; // we fade in via setWhirring
  bus.connect(out);

  // A soft low sine hum with a slow tremolo — the "machine turning".
  const hum = c.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 70;
  const humGain = c.createGain();
  humGain.gain.value = 0.18;
  hum.connect(humGain).connect(bus);

  // A faint fifth above for a little body.
  const hum2 = c.createOscillator();
  hum2.type = "sine";
  hum2.frequency.value = 105;
  const hum2Gain = c.createGain();
  hum2Gain.gain.value = 0.07;
  hum2.connect(hum2Gain).connect(bus);

  // Slow tremolo on the hum so it breathes rather than drones flat.
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.22;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain).connect(humGain.gain);

  // A low-passed noise bed — the "whirring" texture, kept very quiet.
  const bufLen = c.sampleRate * 2;
  const buffer = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.Q.value = 0.7;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.05;
  noise.connect(lp).connect(noiseGain).connect(bus);

  hum.start();
  hum2.start();
  lfo.start();
  noise.start();

  return {
    bus,
    stop: () => {
      try {
        hum.stop();
        hum2.stop();
        lfo.stop();
        noise.stop();
      } catch {
        /* already stopped */
      }
      bus.disconnect();
    },
  };
}

// Reconcile the live whirr graph with `whirrWanted`. Fades the bus gain up/down;
// builds the graph on demand and tears it down a moment after fade-out.
function reconcileWhirr(): void {
  if (!unlocked) return; // no audio yet — state is remembered in whirrWanted
  const c = ensureContext();
  if (!c || !master) return;
  const t = c.currentTime;
  if (whirrWanted) {
    if (!whirr) whirr = buildWhirr(c, master);
    whirr.bus.gain.cancelScheduledValues(t);
    whirr.bus.gain.setTargetAtTime(1, t, 0.4); // gentle fade-in
  } else if (whirr) {
    whirr.bus.gain.cancelScheduledValues(t);
    whirr.bus.gain.setTargetAtTime(0, t, 0.5); // gentle fade-out
    const dying = whirr;
    whirr = null;
    setTimeout(() => dying.stop(), 2500); // tear down after the fade settles
  }
}

// Public: drive the whirr from the "is any verb running" boolean.
export function setWhirring(on: boolean): void {
  if (whirrWanted === on) return;
  whirrWanted = on;
  reconcileWhirr();
}

// ── Ping: a soft two-partial bell when a run completes ────────────────────────
export function playPing(): void {
  if (get(muted) || !unlocked) return;
  const c = ensureContext();
  if (!c || !master || c.state !== "running") return;
  const t = c.currentTime;
  const root = 880; // A5 — bright but soft
  const partials: Array<[number, number]> = [
    [root, 0.18],
    [root * 2.01, 0.06], // slightly inharmonic shimmer
  ];
  for (const [freq, peak] of partials) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008); // fast soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); // bell decay
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.0);
  }
}

// ── Jingle: a short brass-feel arpeggio when a milestone is earned ────────────
export function playJingle(): void {
  if (get(muted) || !unlocked) return;
  const c = ensureContext();
  if (!c || !master || c.state !== "running") return;
  const t0 = c.currentTime;
  // A consistent, pleasant arpeggio (A major add9: A C# E B), astral/brass feel.
  const notes = [440, 554.37, 659.25, 987.77];
  const step = 0.12;
  notes.forEach((freq, i) => {
    const t = t0 + i * step;
    // Two stacked oscillators (saw + sine) for a warm brass-ish timbre, low-passed.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    lp.connect(g).connect(master!);

    const saw = c.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    const sawG = c.createGain();
    sawG.gain.value = 0.5;
    saw.connect(sawG).connect(lp);

    const sine = c.createOscillator();
    sine.type = "sine";
    sine.frequency.value = freq;
    const sineG = c.createGain();
    sineG.gain.value = 0.6;
    sine.connect(sineG).connect(lp);

    saw.start(t);
    sine.start(t);
    saw.stop(t + 0.55);
    sine.stop(t + 0.55);
  });
}
