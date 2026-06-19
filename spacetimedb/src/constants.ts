// ──────────────────────────────────────────────────────────────────────────
// Durations (microseconds) — Escape the Moon.
//
// Kept short so the whole gather → refine → fabricate → assemble → launch chain
// is observable in a live session within a minute or two. The chemistry branch
// (CHEM) is the deliberate late bottleneck; the drone heartbeat (DRONE_TICK) is
// the fastest clock so a drone keeps its machine fed faster than it consumes.
// ──────────────────────────────────────────────────────────────────────────
export const MINUTE = 60_000_000n; // engine default fallback for an unknown verb

export const DRONE_TICK = 2_000_000n; // a bay drone feeds its machine one card per tick
export const EFFORT = 6_000_000n; // the Survivor producing one Effort
export const SOLAR = 5_000_000n; // the Solar Array producing one Power
export const GATHER = 4_000_000n; // gathering one raw (Field / Wreck) per Effort
export const PRINT = 6_000_000n; // the crude Printer turning raw into a Component
export const BUILD = 6_000_000n; // the Workshop assembling one machine from a blueprint

export const REFINE = 5_000_000n; // raw → Metal
export const FABRICATE = 6_000_000n; // Metal → Component
export const KILN = 6_000_000n; // raw → Silicon / Glass
export const ELECTRONICS = 7_000_000n; // Silicon → Circuit
export const MINE_ICE = 6_000_000n; // subsurface ice → Water
export const ELECTROLYSIS = 7_000_000n; // Water → Hydrogen + Oxygen
export const CHEM = 10_000_000n; // Hydrogen + Oxygen → Fuel (the bottleneck)
export const ASSEMBLE = 12_000_000n; // components → a rocket Subsystem
export const LAUNCH = 15_000_000n; // the Rocket counting down to escape

// ──────────────────────────────────────────────────────────────────────────
// Auth — trusted issuers. We split identity (the principal, `ctx.sender`) from
// user (the human); see docs/DATA_MODEL.md §11. A Google JWT auto-links by
// verified email; everything else must be linked explicitly. The client id is
// public (not a secret) so it lives here as a constant rather than in env.
// ──────────────────────────────────────────────────────────────────────────
// Google mints ID tokens with `iss` as EITHER form — accept both.
export const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
];
export const GOOGLE_CLIENT_ID =
  "171597117898-udk35oal7pgj04a08uldr0k7cpa2tuaa.apps.googleusercontent.com";
