// ──────────────────────────────────────────────────────────────────────────
// Presentation metadata for the catalogue.
//
// The server's `card_def` table tells us what a card IS (name, category, verb).
// This module is the *look* — a colour and a hand-drawn glyph per card — plus a
// few formatting helpers. It is pure presentation; nothing here is authoritative
// game state. Keyed by `defId`, with a category fallback so a brand-new card
// def still renders something sensible.
// ──────────────────────────────────────────────────────────────────────────

import type { Card, CardDef, SlotDef } from "../module_bindings/types";
import type { Situation } from "../module_bindings/types";

export type Visual = { color: string; glyph: string };

// 24×24 glyphs live as individual, Inkscape-editable documents under
// src/assets/glyphs/<name>.svg. Each is a complete <svg> carrying the shared
// engraved-set attributes (stroke=currentColor, stroke-width 1.6, round caps),
// so a consumer drops the whole file into the DOM and colours it by setting
// `color` on a parent. Spare, line-drawn — the whole deck reads as one engraved
// set. Theme: "Escape the Moon". The drone Mk I–IV share a silhouette, varied
// only by the count of body pips, so the fleet reads as one family.
//
// import.meta.glob with ?raw inlines each file's text into the bundle at build
// time: no extra requests, no runtime cost, same payload as the old inline strings.
const G: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../assets/glyphs/*.svg", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  ).map(([path, svg]) => [path.slice(path.lastIndexOf("/") + 1, -4), svg]),
);

// Blueprints are seeded as `blueprint_<target>` cards. They share the schematic
// glyph but are colour-coded by the *family* they build — power, station, drone,
// or the launchpad endgame — so the deck of plans reads by category at a glance.
const BLUEPRINT_FAMILY: Record<string, string> = {
  solar: "power",
  refinery: "station",
  fabricator: "station",
  kiln: "station",
  electronics_fab: "station",
  ice_mine: "station",
  electrolysis: "station",
  chem_reactor: "station",
  assembler: "station",
  rocket: "launchpad",
  warehouse: "warehouse",
  drone_1: "drone",
  drone_2: "drone",
  drone_3: "drone",
  drone_4: "drone",
};

const BLUEPRINT_DEFS: Record<string, Visual> = Object.fromEntries(
  Object.entries(BLUEPRINT_FAMILY).map(([target, family]) => [
    `blueprint_${target}`,
    { color: `var(--cat-${family})`, glyph: G.blueprint },
  ]),
);

const BY_DEF: Record<string, Visual> = {
  // Resources
  effort: { color: "var(--cat-effort)", glyph: G.effort },
  power: { color: "var(--cat-power)", glyph: G.power },
  regolith: { color: "var(--cat-raw)", glyph: G.regolith },
  scrap: { color: "var(--cat-raw)", glyph: G.scrap },
  salvage: { color: "var(--cat-salvage)", glyph: G.salvage },
  metal: { color: "var(--cat-metal)", glyph: G.metal },
  silicon: { color: "var(--cat-silicon)", glyph: G.silicon },
  glass: { color: "var(--cat-glass)", glyph: G.glass },
  circuit: { color: "var(--cat-circuit)", glyph: G.circuit },
  component: { color: "var(--cat-component)", glyph: G.component },
  water: { color: "var(--cat-water)", glyph: G.water },
  hydrogen: { color: "var(--cat-hydrogen)", glyph: G.hydrogen },
  oxygen: { color: "var(--cat-oxygen)", glyph: G.oxygen },
  fuel_tank: { color: "var(--cat-fuel)", glyph: G.fuel_tank },
  fuel: { color: "var(--cat-fuel)", glyph: G.fuel },

  // Rocket subsystems
  engine: { color: "var(--cat-subsystem)", glyph: G.engine },
  hull: { color: "var(--cat-subsystem)", glyph: G.hull },
  avionics: { color: "var(--cat-subsystem)", glyph: G.avionics },
  life_support: { color: "var(--cat-subsystem)", glyph: G.life_support },
  heat_shield: { color: "var(--cat-subsystem)", glyph: G.heat_shield },

  // Win token
  escape: { color: "var(--cat-escape)", glyph: G.escape },

  // Drones (one family, Mk shown by pip count)
  drone_1: { color: "var(--cat-drone)", glyph: G.drone_1 },
  drone_2: { color: "var(--cat-drone)", glyph: G.drone_2 },
  drone_3: { color: "var(--cat-drone)", glyph: G.drone_3 },
  drone_4: { color: "var(--cat-drone)", glyph: G.drone_4 },

  // Machine verbs
  survivor: { color: "var(--cat-avatar)", glyph: G.survivor },
  regolith_field: { color: "var(--cat-station)", glyph: G.regolith_field },
  wreck: { color: "var(--cat-station)", glyph: G.wreck },
  exhausted_wreck: { color: "var(--ink-faint)", glyph: G.exhausted_wreck },
  printer: { color: "var(--cat-station)", glyph: G.printer },
  workbench: { color: "var(--cat-station)", glyph: G.workbench },
  research: { color: "var(--cat-research)", glyph: G.research },
  solar_array: { color: "var(--cat-power)", glyph: G.solar_array },
  refinery: { color: "var(--cat-fuel)", glyph: G.refinery },
  fabricator: { color: "var(--cat-station)", glyph: G.fabricator },
  kiln: { color: "var(--cat-fuel)", glyph: G.kiln },
  electronics_fab: { color: "var(--cat-circuit)", glyph: G.electronics_fab },
  ice_mine: { color: "var(--cat-water)", glyph: G.ice_mine },
  electrolysis: { color: "var(--cat-water)", glyph: G.electrolysis },
  chem_reactor: { color: "var(--cat-fuel)", glyph: G.chem_reactor },
  assembler: { color: "var(--cat-station)", glyph: G.assembler },
  // The Rocket is the finale — tinted astral light-blue (the Escape colour it
  // becomes, matching the "Escape the Moon" finale text), not brass machinery.
  rocket: { color: "var(--cat-escape)", glyph: G.rocket },
  warehouse: { color: "var(--cat-warehouse)", glyph: G.warehouse },

  // Blueprints (colour-coded by the family they build)
  ...BLUEPRINT_DEFS,
};

const BY_CATEGORY: Record<string, Visual> = {
  // Resource categories
  effort: { color: "var(--cat-effort)", glyph: G.effort },
  power: { color: "var(--cat-power)", glyph: G.power },
  raw: { color: "var(--cat-raw)", glyph: G.regolith },
  salvage: { color: "var(--cat-salvage)", glyph: G.salvage },
  metal: { color: "var(--cat-metal)", glyph: G.metal },
  silicon: { color: "var(--cat-silicon)", glyph: G.silicon },
  glass: { color: "var(--cat-glass)", glyph: G.glass },
  circuit: { color: "var(--cat-circuit)", glyph: G.circuit },
  component: { color: "var(--cat-component)", glyph: G.component },
  water: { color: "var(--cat-water)", glyph: G.water },
  hydrogen: { color: "var(--cat-hydrogen)", glyph: G.hydrogen },
  oxygen: { color: "var(--cat-oxygen)", glyph: G.oxygen },
  fuel_tank: { color: "var(--cat-fuel)", glyph: G.fuel_tank },
  fuel: { color: "var(--cat-fuel)", glyph: G.fuel },

  // Structural / endgame categories
  subsystem: { color: "var(--cat-subsystem)", glyph: G.hull },
  drone: { color: "var(--cat-drone)", glyph: G.drone },
  station: { color: "var(--cat-station)", glyph: G.workbench },
  avatar: { color: "var(--cat-avatar)", glyph: G.survivor },
  launchpad: { color: "var(--cat-launchpad)", glyph: G.rocket },
  warehouse: { color: "var(--cat-warehouse)", glyph: G.warehouse },
  endgame: { color: "var(--cat-escape)", glyph: G.escape },
  blueprint: { color: "var(--cat-blueprint)", glyph: G.blueprint },
  debris: { color: "var(--ink-faint)", glyph: G.exhausted_wreck },
};

export function visualFor(defId: string, category: string): Visual {
  return (
    BY_DEF[defId] ??
    BY_CATEGORY[category] ?? { color: "var(--brass)", glyph: G.token }
  );
}

// ── Hole hint labels ───────────────────────────────────────────────────────
// A verb hole's `accepts` is a list of *tokens* — each is either a card `defId`
// or a coarse `category` name (see slot_def.accepts in the server catalogue).
// On the wire these are machine ids (lower-case, underscore-joined). For a hint
// we want a HUMAN display name with real spaces, so it line-breaks cleanly
// across the narrow socket instead of being one unbreakable WORD_LIKE_THIS
// token. The uppercase *look* is kept purely as CSS (`text-transform`), not by
// storing upper-cased ids.
//
// Categories have no `card_def` row, so they need their own copy here. Where a
// category coincides with a single card (Metal, Engine…) we still spell it out
// rather than depend on def lookup, since `accepts` is matched by category.
const CATEGORY_LABELS: Record<string, string> = {
  drone: "Drone",
  effort: "Effort",
  power: "Power",
  raw: "Raw Material",
  salvage: "Salvage",
  metal: "Metal",
  silicon: "Silicon",
  glass: "Glass",
  circuit: "Circuit",
  component: "Component",
  water: "Water",
  hydrogen: "Hydrogen",
  oxygen: "Oxygen",
  fuel_tank: "Fuel Tank",
  fuel: "Fuel",
  subsystem: "Subsystem",
  engine: "Engine",
  hull: "Hull",
  avionics: "Avionics",
  life_support: "Life Support",
  heat_shield: "Heat Shield",
  blueprint: "Blueprint",
  station: "Station",
  warehouse: "Warehouse",
  launchpad: "Launchpad",
  avatar: "Survivor",
  endgame: "Escape",
};

// Turn a single accepts-token into its display name: a card's own name wins,
// then the category map, then a humanised fallback (split on underscores,
// Title-Case) so a brand-new token still reads as words.
function acceptLabel(token: string, defsById: Map<string, CardDef>): string {
  const def = defsById.get(token);
  if (def) return def.name;
  if (CATEGORY_LABELS[token]) return CATEGORY_LABELS[token];
  return token
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Mechanical drones top out at Mk IV; a higher requirement is a worker-only bay
// (the Workbench & Research benches), which only Effort can fill.
const MAX_MK = 4;

// Every display label a hole should advertise. For a drone bay this is its Mk
// requirement — and ALWAYS "Effort" too, because Effort is the universal Mk-0
// worker that fits any bay. For an input hole it's each accepted category/def.
export function holeLabels(
  slot: SlotDef,
  defsById: Map<string, CardDef>,
): string[] {
  if (slot.droneLevel > 0) {
    if (slot.droneLevel > MAX_MK) return ["Effort"]; // worker-only bay
    return [`Mk ${slot.droneLevel}+`, "Effort"];
  }
  return slot.accepts.map((t) => acceptLabel(t, defsById));
}

// ── Location helpers ───────────────────────────────────────────────────────
// The generated `Location` enum tag may arrive capitalised ("Tabletop") or
// lower-cased depending on codegen; normalise so comparisons are stable.
export type Place = "tabletop" | "slotted" | "output" | "housed";

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
