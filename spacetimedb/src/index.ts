// Entry point. SpacetimeDB bundles from here: the default export is the schema,
// and every reducer / view / lifecycle hook must be reachable as a named export
// of this module to be registered. The actual definitions live in focused
// modules under three folders — this file just re-exports them.
//
// content/   — "what the game IS" (authoring + data)
//   catalogue     — card_def / slot_def / achievement_def authoring (seedCatalogue)
//   recipes       — BUILDS / SUBSYSTEMS / RESEARCH_TREE / WRECK_CONTENTS data
//   achievements  — milestone text + the conditions that earn each one
//
// engine/    — "how it RUNS" (mechanism)
//   engine        — the generic verb engine (assembly, runs, output caps, spawning)
//   resolvers     — per-verb behaviour (the RESOLVERS map + drone/research/wreck logic)
//   layout        — the authoritative tabletop layout (VPSC overlap removal)
//
// platform/  — the SpacetimeDB surface + shared infra
//   schema        — tables, the schema object, and the scheduled completeSituation
//   reducers      — player actions (newGame, slotCard, collectAndSlot, moveCard)
//   views         — the per-player my_* read views
//   graph         — the progression-graph projection (admin visualiser)
//   lifecycle     — init, connect/disconnect, first-admin bootstrap
//   auth          — principal → identity → user resolution and membership gates
//   constants     — durations + auth issuer constants
//   types         — Location / IdentityProvider sum types, Effects, MeRow

export { default } from "./platform/schema";

// completeSituation is the scheduled target of situation_timer; it lives in
// platform/schema.ts but must still be exported from the entry to be registered.
export { completeSituation } from "./platform/schema";

export * from "./platform/lifecycle";
export * from "./platform/reducers";
export * from "./platform/views";
