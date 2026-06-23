// ──────────────────────────────────────────────────────────────────────────
// Durations (microseconds) — Escape the Moon.
//
// Per-verb run lengths: game-balance tuning, the timing sibling of the recipe
// data in recipes.ts. Read by engine/resolvers.ts, which turns them into each
// verb's countdown. Kept short so the whole gather → refine → fabricate →
// assemble → launch chain is observable in a live session within a minute or
// two. The chemistry branch (CHEM) is the deliberate late bottleneck; the drone
// heartbeat (DRONE_TICK) is the fastest clock so a drone keeps its machine fed
// faster than it consumes.
//
// (The engine's own unknown-verb fallback is not a balance number and lives in
// engine/engine.ts, not here.)
// ──────────────────────────────────────────────────────────────────────────
export const DRONE_TICK = 2_000_000n; // a bay drone feeds its machine one card per tick
// When a drone wakes and finds nothing to do (host stalled, every input hole
// full, or no loot to fetch) it backs off to this slower poll instead of the
// 2s feed cadence. A saturated endgame board can carry a dozen-plus idle drones;
// polling each every 2s dominated completeSituation CPU, so idle drones tick
// ~6×/min instead of 30×/min. They snap back to DRONE_TICK the moment they find
// real work to do (a feed move). See droneResolve / tryBeginRun.
export const DRONE_IDLE_TICK = 10_000_000n; // idle bay drone re-poll interval
export const EFFORT = 6_000_000n; // the Survivor producing one Effort
export const SOLAR = 5_000_000n; // the Solar Array producing one Power
export const GATHER = 4_000_000n; // gathering one raw (Field / Wreck) per Effort
export const PRINT = 6_000_000n; // the crude Printer turning raw into a Component
export const BUILD = 6_000_000n; // the Workshop assembling one machine from a blueprint
export const RESEARCH = 8_000_000n; // the Research bench turning Effort into the next blueprint

export const REFINE = 5_000_000n; // raw → Metal
export const FABRICATE = 6_000_000n; // Metal → Component
export const KILN = 6_000_000n; // raw → Silicon / Glass
export const ELECTRONICS = 7_000_000n; // Silicon → Circuit
export const MINE_ICE = 6_000_000n; // subsurface ice → Water
export const ELECTROLYSIS = 7_000_000n; // Water → Hydrogen + Oxygen
export const CHEM = 10_000_000n; // Hydrogen + Oxygen → Fuel (the bottleneck)
export const ASSEMBLE = 12_000_000n; // components → a rocket Subsystem
export const LAUNCH = 15_000_000n; // the Rocket counting down to escape
