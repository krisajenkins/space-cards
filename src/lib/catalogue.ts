// ──────────────────────────────────────────────────────────────────────────
// Presentation metadata for the catalogue.
//
// The server's `card_def` table tells us what a card IS (name, category, verb).
// This module is the *look* — a colour and a hand-drawn glyph per card — plus a
// few formatting helpers. It is pure presentation; nothing here is authoritative
// game state. Keyed by `defId`, with a category fallback so a brand-new card
// def still renders something sensible.
// ──────────────────────────────────────────────────────────────────────────

import type { Card, Situation } from "../module_bindings/types";

export type Visual = { color: string; glyph: string };

// 24×24 glyphs, stroke = currentColor unless a path opts into fill. Kept spare
// and line-drawn so the whole deck feels like one engraved set.
const G = {
  // A four-point spark — vitality / energy.
  health: `<path d="M12 2.4c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z" fill="currentColor" stroke="none"/>`,
  // A felled log, end-grain rings showing.
  wood: `<rect x="3" y="8.6" width="12.5" height="6.8" rx="3.4"/><ellipse cx="15.5" cy="12" rx="2.6" ry="3.4"/><ellipse cx="15.5" cy="12" rx="0.9" ry="1.3"/>`,
  // A struck coin.
  coin: `<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="5.4"/><path d="M12 9.3l.95 1.95 2.15.31-1.55 1.51.37 2.14L12 14.71l-1.94 1.01.37-2.14L8.9 11.56l2.15-.31z" fill="currentColor" stroke="none"/>`,
  // A felling axe.
  lumberjack: `<path d="M5 19L15 9"/><path d="M14.2 5.6c2.6-1.4 5.2-1 6.2 1.1 1 2.1-.2 4.4-2.9 5.3-.7-2.3-2.9-4.2-3.3-6.4Z" fill="currentColor" stroke="none"/>`,
  // A radiant sun — "You", the centre of your little system.
  avatar: `<circle cx="12" cy="12" r="4.3"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1"/>`,
  // A pine.
  forest: `<path d="M12 3l4.4 6.4h-2.6L18 15H6l4.2-5.6H7.6z"/><path d="M12 15v6"/>`,
  // A sprouting seed — a stem with two opening leaves above a buried kernel.
  seed: `<path d="M12 21v-7"/><path d="M12 14c-1.4 0-4-.6-4-3.2C8 8.6 10.4 8 12 8M12 14c1.4 0 4-.6 4-3.2C16 8.6 13.6 8 12 8"/><ellipse cx="12" cy="18.4" rx="2" ry="2.6" fill="currentColor" stroke="none"/>`,
  // Balance scales — the Market.
  market: `<path d="M12 4v15M7 19h10M5.5 7.5h13M5.5 7.5L3 13a3 3 0 006 0L8 7.5M18.5 7.5L16 13a3 3 0 006 0L21 7.5"/><circle cx="12" cy="4.6" r="1.2" fill="currentColor" stroke="none"/>`,
  // Generic fallback.
  token: `<rect x="5" y="5" width="14" height="14" rx="3"/>`,
};

const BY_DEF: Record<string, Visual> = {
  health: { color: "var(--cat-health)", glyph: G.health },
  wood: { color: "var(--cat-wood)", glyph: G.wood },
  coin: { color: "var(--cat-coin)", glyph: G.coin },
  lumberjack: { color: "var(--cat-lumberjack)", glyph: G.lumberjack },
  you: { color: "var(--cat-avatar)", glyph: G.avatar },
  forest: { color: "var(--cat-lumberjack)", glyph: G.forest },
  market: { color: "var(--cat-coin)", glyph: G.market },
  seed: { color: "var(--cat-seed)", glyph: G.seed },
};

const BY_CATEGORY: Record<string, Visual> = {
  health: { color: "var(--cat-health)", glyph: G.health },
  wood: { color: "var(--cat-wood)", glyph: G.wood },
  coin: { color: "var(--cat-coin)", glyph: G.coin },
  lumberjack: { color: "var(--cat-lumberjack)", glyph: G.lumberjack },
  avatar: { color: "var(--cat-avatar)", glyph: G.avatar },
  station: { color: "var(--cat-station)", glyph: G.market },
  seed: { color: "var(--cat-seed)", glyph: G.seed },
};

export function visualFor(defId: string, category: string): Visual {
  return (
    BY_DEF[defId] ??
    BY_CATEGORY[category] ?? { color: "var(--brass)", glyph: G.token }
  );
}

// ── Location helpers ───────────────────────────────────────────────────────
// The generated `Location` enum tag may arrive capitalised ("Tabletop") or
// lower-cased depending on codegen; normalise so comparisons are stable.
export type Place = "tabletop" | "slotted" | "output";

export function placeOf(card: Card): Place {
  return card.location.tag.toLowerCase() as Place;
}

// Same codegen-casing caveat as placeOf: the generated `SituationState` tag may
// arrive "Ongoing" or "ongoing", so normalise rather than `=== "Ongoing"`.
export type RunState = "assembling" | "ongoing" | "stalled";

export function stateOf(s: Situation): RunState {
  return s.state.tag.toLowerCase() as RunState;
}

// ── Time formatting ────────────────────────────────────────────────────────
// Show a fine-grained "4.2s" under ten seconds (so short verbs feel alive),
// and m:ss above that.
export function formatRemaining(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.ceil(s % 60);
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

// A Timestamp's micros → epoch millis (number). The client SDK exposes
// `microsSinceUnixEpoch` as a bigint.
export function microsToMillis(micros: bigint): number {
  return Number(micros / 1000n);
}
