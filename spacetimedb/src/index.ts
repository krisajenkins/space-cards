// Entry point. SpacetimeDB bundles from here: the default export is the schema,
// and every reducer / view / lifecycle hook must be reachable as a named export
// of this module to be registered. The actual definitions live in focused
// modules — this file just re-exports them.
//
//   constants  — durations + auth issuer constants
//   types      — Location / IdentityProvider sum types, Effects, MeRow
//   resolvers  — per-verb behaviour (the RESOLVERS map)
//   engine     — the generic verb engine (assembly, runs, output caps, spawning)
//   auth       — principal → identity → user resolution and membership gates
//   schema     — tables, the schema object, and the scheduled completeSituation
//   lifecycle  — init, connect/disconnect, first-admin bootstrap
//   reducers   — player actions (newGame, slotCard, collectAndSlot, moveCard)
//   views      — the per-player my_* read views

export { default } from "./schema";

// completeSituation is the scheduled target of situation_timer; it lives in
// schema.ts but must still be exported from the entry to be registered.
export { completeSituation } from "./schema";

export * from "./lifecycle";
export * from "./reducers";
export * from "./views";
