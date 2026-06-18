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
// and line-drawn so the whole deck feels like one engraved set: thin engraved
// lines, the occasional solid accent. Theme: "Escape the Moon".
//
// A shared drone silhouette (a rounded body slung under twin rotor arms) is
// reused by the catalyst drones and every courier, varied only by the cargo it
// carries — so the fleet reads as one family.
const G = {
  // ── Resources ────────────────────────────────────────────────────────────
  // Effort: a worked hand with a sweat-drop.
  effort: `<path d="M8.5 12V6.4a1.3 1.3 0 012.6 0V11M11.1 11V5.2a1.3 1.3 0 012.6 0V11M13.7 11.4V6.6a1.3 1.3 0 012.6 0V13c0 3.2-2 5.6-5 5.6-2 0-3.2-.8-4.4-2.4L5 13.4a1.3 1.3 0 012.2-1.4L8.5 14"/><path d="M17.4 4.4c.9.7.9 2 0 2.7" stroke-linecap="round"/>`,
  // Power: a lightning bolt.
  power: `<path d="M13 2.5 5.5 13.2h5L9.5 21.5 18 10.4h-5z" fill="currentColor" stroke="none"/>`,
  // Regolith: a granular pile of moon dust.
  regolith: `<path d="M3 18h18"/><path d="M3 18c2-5 4-7 5.5-7s2.5 2 3.5 2 2-4 4-4 3.4 4 5 9"/><circle cx="8" cy="14" r=".5" fill="currentColor" stroke="none"/><circle cx="13" cy="13" r=".5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r=".5" fill="currentColor" stroke="none"/>`,
  // Scrap: a bent, dented metal sheet.
  scrap: `<path d="M4 9l5-3 4 2 3-2 4 4-3 3 2 4-6 1-3-3-5 2 1-5z"/>`,
  // Salvage: a usable reclaimed part — a bracket with a bolt hole.
  salvage: `<path d="M6 5h7l5 5v9H6z"/><path d="M13 5v5h5"/><circle cx="11.5" cy="14" r="2"/>`,
  // Metal: an ingot / bar.
  metal: `<path d="M4 14.5l3-4h10l3 4-3 4H7z"/><path d="M7 10.5l1.5-1.8h7L17 10.5"/>`,
  // Silicon: a wafer disc with a flat edge.
  silicon: `<circle cx="12" cy="12" r="8.4"/><path d="M6.2 17.8L17.8 6.2"/><path d="M9 4.4l-4.6 4.6"/>`,
  // Glass: a pane / lens with a glint.
  glass: `<rect x="5.5" y="4" width="13" height="16" rx="1.5"/><path d="M8.5 7l4 4M8.5 11l2 2" stroke-linecap="round"/>`,
  // Circuit: a chip with traces.
  circuit: `<rect x="7" y="7" width="10" height="10" rx="1"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>`,
  // Component: a cog / machined part.
  component: `<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M5.8 5.8l2.1 2.1M16.1 16.1l2.1 2.1M18.2 5.8l-2.1 2.1M7.9 16.1l-2.1 2.1"/>`,
  // Water: a droplet.
  water: `<path d="M12 3.5c3 4 5 6.4 5 9.2a5 5 0 01-10 0c0-2.8 2-5.2 5-9.2Z"/>`,
  // Hydrogen: a gas canister marked H.
  hydrogen: `<rect x="7" y="6" width="10" height="14" rx="2"/><path d="M10 4h4v2h-4z"/><path d="M10 11v4M14 11v4M10 13h4" stroke-linecap="round"/>`,
  // Oxygen: a gas canister marked O.
  oxygen: `<rect x="7" y="6" width="10" height="14" rx="2"/><path d="M10 4h4v2h-4z"/><circle cx="12" cy="13" r="2.2"/>`,
  // Fuel: a flask / fuel can with a flame mouth.
  fuel: `<path d="M9 4h6v3l3 5v7H6v-7l3-5z"/><path d="M9 7h6"/><path d="M12 14c1.4-.6 1.4-2 .6-3 .4 1-.6 1.4-1 .6-.4-.8 0-1.6 0-1.6-1.6.8-1.6 3 .4 4z" fill="currentColor" stroke="none"/>`,

  // ── Rocket subsystems ────────────────────────────────────────────────────
  // Engine: a bell nozzle with a flame.
  engine: `<path d="M9 4h6l1 6 3 5H5l3-5z"/><path d="M9.5 15l-.5 4M14.5 15l.5 4M12 15v4" stroke-linecap="round"/>`,
  // Hull: a riveted fuselage segment / nose cone.
  hull: `<path d="M12 3c3 3 4 7 4 11v6H8v-6c0-4 1-8 4-11Z"/><path d="M8 14h8" /><circle cx="12" cy="9" r="1" fill="currentColor" stroke="none"/>`,
  // Avionics: a circuit-board panel with a screen readout.
  avionics: `<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M7 9h6v4H7z"/><path d="M15.5 9h2M15.5 11h2M15.5 13h2M7 16h10" stroke-linecap="round"/>`,
  // Life support: a breathing-loop sphere with a leaf inside.
  life_support: `<circle cx="12" cy="12" r="8.2"/><path d="M12 16c0-3 1.5-5 4.5-5.5C16 14 14 16 12 16Z" fill="currentColor" stroke="none"/><path d="M12 16c0-3-1.5-5-4.5-5.5C8 14 10 16 12 16Z"/>`,
  // Heat shield: a layered ablative dome.
  heat_shield: `<path d="M3.5 13a8.5 8.5 0 0117 0Z"/><path d="M5.5 16a6.5 6.5 0 0113 0Z"/><path d="M3.5 13h17M5.5 16h13"/>`,

  // ── Win token ────────────────────────────────────────────────────────────
  // Escape: a rocket lifting off, trailing exhaust and stars.
  escape: `<path d="M12 2c2.6 2.6 4 6 4 9.5L12 15l-4-3.5C8 8 9.4 4.6 12 2Z"/><circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none"/><path d="M8 11.5l-2.5 1 1.5 2M16 11.5l2.5 1-1.5 2"/><path d="M10.5 16.5l-1.5 4M13.5 16.5l1.5 4M12 16v5" stroke-linecap="round"/>`,

  // ── Catalyst drones ──────────────────────────────────────────────────────
  // Mining drone: a rover-drone with a digging scoop.
  mining_drone: `<rect x="6" y="8" width="12" height="6" rx="2"/><path d="M8 14v2M16 14v2"/><circle cx="9" cy="17.5" r="1.6"/><circle cx="15" cy="17.5" r="1.6"/><path d="M6 11L2.5 8l2-2 3 3" stroke-linecap="round"/>`,
  // Survey drone: a scanning eye-drone with rotor arms.
  survey_drone: `<path d="M4 6h4M16 6h4M6 6v2M18 6v2"/><path d="M3.5 12c2.4-3.2 4.8-4.8 8.5-4.8s6.1 1.6 8.5 4.8c-2.4 3.2-4.8 4.8-8.5 4.8S5.9 15.2 3.5 12Z"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>`,

  // ── Blueprint ────────────────────────────────────────────────────────────
  // A rolled schematic sheet with grid + a drawn part.
  blueprint: `<path d="M5 5h11l3 3v11H5z"/><path d="M16 5v3h3"/><path d="M8 11h5M8 14h5M8 8h3" stroke-linecap="round"/><circle cx="15" cy="14.5" r="1.6"/>`,

  // ── Machine verbs (one each) ─────────────────────────────────────────────
  // Survivor: an astronaut figure.
  survivor: `<circle cx="12" cy="6" r="3"/><path d="M12 6h.01" /><path d="M8.5 13a3.5 3.5 0 017 0v3h-7z"/><path d="M8.5 16l-2.5 4M15.5 16l2.5 4" stroke-linecap="round"/><circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none"/>`,
  // Regolith field: a scoop digging a furrow of dust.
  regolith_field: `<path d="M3 19h18"/><path d="M4 19c1.5-3 3.5-5 5-5"/><path d="M13 7l5 2-2 5-5-2z"/><path d="M11 12l-3 3" stroke-linecap="round"/>`,
  // Wreck: a crashed ship, broken on the surface.
  wreck: `<path d="M3 19h18"/><path d="M5 19l3-9 6-2 3 4-2 7z"/><path d="M9 9l3 5M16 12l-5 1" stroke-linecap="round"/>`,
  // Printer: a 3D-printer / fabricator nozzle laying a bead.
  printer: `<rect x="5" y="4" width="14" height="3" rx="1"/><path d="M12 7v4"/><path d="M10 11h4l-1 3h-2z"/><path d="M8 19h8M8 19l1-2M16 19l-1-2"/>`,
  // Workshop: a workbench with a wrench crossing a gear.
  workshop: `<path d="M3 16h18v3H3z"/><circle cx="9" cy="9.5" r="2.6"/><path d="M9 6.9V9.5l1.8 1"/><path d="M13.5 6l4.5 4.5-1.5 1.5L12 7.5z" fill="currentColor" stroke="none"/>`,
  // Solar array: a tilted panel of cells on a post.
  solar_array: `<path d="M4 6h14l2 7H6z"/><path d="M8.7 6l-1 7M13.4 6l.6 7M4 9.5h16"/><path d="M12 13v6M9 19h6" stroke-linecap="round"/>`,
  // Refinery: a smelter / furnace pouring molten metal.
  refinery: `<path d="M5 5h9v7l3 7H5z"/><path d="M14 8l4-1v3l-3 1"/><path d="M8 19v-3h3v3" /><path d="M9 9h1.5" stroke-linecap="round"/>`,
  // Fabricator: a stamping press driving down onto a die.
  fabricator: `<path d="M5 4h14M5 4v4h14V4"/><path d="M9 8v4h6V8"/><path d="M12 12v3"/><path d="M5 18h14v2H5z"/>`,
  // Kiln: a domed oven with a flame inside.
  kiln: `<path d="M4 20V11a8 8 0 0116 0v9z"/><path d="M4 16h16"/><path d="M12 14c1.6-.7 1.6-2.2.7-3.3.5 1.1-.7 1.5-1.1.6-.4-.9 0-1.8 0-1.8-1.8.9-1.8 3.4.4 4.5z" fill="currentColor" stroke="none"/>`,
  // Electronics fab: a print-head laying chips onto a board.
  electronics_fab: `<rect x="4" y="13" width="16" height="6" rx="1"/><path d="M10 7h4v4h-4z"/><path d="M12 4v3"/><path d="M7 16h2M11 16h2M15 16h2" stroke-linecap="round"/>`,
  // Ice mine: a drill bit boring into a layered ice cap.
  ice_mine: `<path d="M3 13a9 4 0 0118 0"/><path d="M11 6h2v6h-2z"/><path d="M11 12l1 3 1-3"/><path d="M6 16l1 2M18 16l-1 2" stroke-linecap="round"/>`,
  // Electrolysis: a tank with two electrodes and rising bubbles.
  electrolysis: `<rect x="5" y="8" width="14" height="12" rx="1.5"/><path d="M9 4v4M15 4v4"/><circle cx="10" cy="14" r="1"/><circle cx="13" cy="16" r="1.2"/><circle cx="14.5" cy="12.5" r=".8"/>`,
  // Chem reactor: a round flask with bubbling reaction.
  chem_reactor: `<path d="M10 3h4M11 3v5l-5 9a2 2 0 002 3h8a2 2 0 002-3l-5-9V3"/><circle cx="11" cy="16" r="1"/><circle cx="14" cy="18" r="1.2"/><path d="M8 17h8" stroke-linecap="round"/>`,
  // Assembler: a robotic arm placing a part.
  assembler: `<circle cx="5" cy="6" r="1.8"/><path d="M6.5 7L11 10l-1 4"/><path d="M11 10l5-1"/><rect x="9" y="15" width="9" height="4" rx="1"/>`,
  // Rocket (launchpad): the pre-launch craft standing on a gantry.
  rocket: `<path d="M12 3c2.4 2.6 3.5 6 3.5 9.5V16h-7v-3.5C8.5 9 9.6 5.6 12 3Z"/><circle cx="12" cy="9.5" r="1.4" fill="currentColor" stroke="none"/><path d="M8.5 14H6v6M15.5 14H18v6"/><path d="M9 16l-1 4M15 16l1 4" stroke-linecap="round"/>`,

  // ── Couriers (drone + cargo) ─────────────────────────────────────────────
  // Hauler: drone carrying a lightning bolt.
  hauler: `<path d="M3 7h3M18 7h3M5 7v1.5M19 7v1.5"/><rect x="6" y="8" width="12" height="5" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M9 13l-1.5 3M15 13l1.5 3"/><path d="M12.5 8.6l-2 2.4h1.6l-.6 2 2-2.4h-1.6z" fill="currentColor" stroke="none"/>`,
  // Feeder: drone carrying an ingot.
  feeder: `<path d="M3 7h3M18 7h3M5 7v1.5M19 7v1.5"/><rect x="6" y="8" width="12" height="5" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M9 13l-1.5 3M15 13l1.5 3"/><path d="M10 11l.8-1.4h2.4L14 11z" fill="currentColor" stroke="none"/>`,
  // Fitter: drone carrying a cog.
  fitter: `<path d="M3 7h3M18 7h3M5 7v1.5M19 7v1.5"/><rect x="6" y="8" width="12" height="5" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M9 13l-1.5 3M15 13l1.5 3"/><circle cx="12" cy="10.5" r="1.3"/><path d="M12 8.6v.7M12 11.7v.7M10.1 10.5h.7M13.2 10.5h.7"/>`,
  // Tanker: drone carrying a droplet / tank.
  tanker: `<path d="M3 7h3M18 7h3M5 7v1.5M19 7v1.5"/><rect x="6" y="8" width="12" height="5" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M9 13l-1.5 3M15 13l1.5 3"/><path d="M12 8.4c1 1.2 1.6 2 1.6 2.8a1.6 1.6 0 01-3.2 0c0-.8.6-1.6 1.6-2.8Z" fill="currentColor" stroke="none"/>`,
  // Cargo: drone carrying a finished-goods box.
  cargo: `<path d="M3 7h3M18 7h3M5 7v1.5M19 7v1.5"/><rect x="6" y="8" width="12" height="5" rx="2"/><circle cx="9" cy="16" r="1.4"/><circle cx="15" cy="16" r="1.4"/><path d="M9 13l-1.5 3M15 13l1.5 3"/><path d="M10 9.5h4v2.6h-4zM10 10.6h4" stroke-linecap="round"/>`,

  // Generic fallback.
  token: `<rect x="5" y="5" width="14" height="14" rx="3"/>`,
};

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
  fuel: { color: "var(--cat-fuel)", glyph: G.fuel },

  // Rocket subsystems
  engine: { color: "var(--cat-subsystem)", glyph: G.engine },
  hull: { color: "var(--cat-subsystem)", glyph: G.hull },
  avionics: { color: "var(--cat-subsystem)", glyph: G.avionics },
  life_support: { color: "var(--cat-subsystem)", glyph: G.life_support },
  heat_shield: { color: "var(--cat-subsystem)", glyph: G.heat_shield },

  // Win token
  escape: { color: "var(--cat-escape)", glyph: G.escape },

  // Catalyst drones
  mining_drone: { color: "var(--cat-drone)", glyph: G.mining_drone },
  survey_drone: { color: "var(--cat-drone)", glyph: G.survey_drone },

  // Machine verbs
  survivor: { color: "var(--cat-avatar)", glyph: G.survivor },
  regolith_field: { color: "var(--cat-station)", glyph: G.regolith_field },
  wreck: { color: "var(--cat-station)", glyph: G.wreck },
  printer: { color: "var(--cat-station)", glyph: G.printer },
  workshop: { color: "var(--cat-station)", glyph: G.workshop },
  solar_array: { color: "var(--cat-power)", glyph: G.solar_array },
  refinery: { color: "var(--cat-fuel)", glyph: G.refinery },
  fabricator: { color: "var(--cat-station)", glyph: G.fabricator },
  kiln: { color: "var(--cat-fuel)", glyph: G.kiln },
  electronics_fab: { color: "var(--cat-circuit)", glyph: G.electronics_fab },
  ice_mine: { color: "var(--cat-water)", glyph: G.ice_mine },
  electrolysis: { color: "var(--cat-water)", glyph: G.electrolysis },
  chem_reactor: { color: "var(--cat-fuel)", glyph: G.chem_reactor },
  assembler: { color: "var(--cat-station)", glyph: G.assembler },
  rocket: { color: "var(--cat-launchpad)", glyph: G.rocket },

  // Couriers
  hauler: { color: "var(--cat-power)", glyph: G.hauler },
  feeder: { color: "var(--cat-metal)", glyph: G.feeder },
  fitter: { color: "var(--cat-component)", glyph: G.fitter },
  tanker: { color: "var(--cat-water)", glyph: G.tanker },
  cargo: { color: "var(--cat-courier)", glyph: G.cargo },
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
  fuel: { color: "var(--cat-fuel)", glyph: G.fuel },

  // Structural / endgame categories
  subsystem: { color: "var(--cat-subsystem)", glyph: G.hull },
  drone: { color: "var(--cat-drone)", glyph: G.survey_drone },
  station: { color: "var(--cat-station)", glyph: G.workshop },
  avatar: { color: "var(--cat-avatar)", glyph: G.survivor },
  courier: { color: "var(--cat-courier)", glyph: G.cargo },
  launchpad: { color: "var(--cat-launchpad)", glyph: G.rocket },
  endgame: { color: "var(--cat-escape)", glyph: G.escape },
  blueprint: { color: "var(--cat-blueprint)", glyph: G.blueprint },
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
