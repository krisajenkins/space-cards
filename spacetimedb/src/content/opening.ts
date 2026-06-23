// ──────────────────────────────────────────────────────────────────────────
// The opening deal — Escape the Moon's crash-site tableau.
//
// "What the game IS" at turn zero: the board's name, the tier-0 stations dealt
// onto the table (and, by their absence, the ones deliberately WITHHELD), and
// the starting Effort. Pure data — the platform `newGame` reducer reads this and
// spawns the instances (the spawning is mechanism; which cards to deal is
// content). Kept here, beside the recipes and the catalogue, so the game's
// turn-zero design lives with the rest of the content rather than buried in a
// reducer. See docs/ESCAPE_THE_MOON.md.
// ──────────────────────────────────────────────────────────────────────────

export const OPENING_BOARD_NAME = "Crash Site";

// Tier-0 stations along the top: the Survivor (your hands), the two gatherers,
// and the Research bench (earns blueprints). The Printer and Workshop are NOT
// dealt — you salvage them from the Wreck (see WRECK_CONTENTS / wreckDrop in
// resolvers.ts), which softens the opening and tells the story of saving a few
// things from the crash. Everything else is earned: gather by hand, RESEARCH a
// blueprint, BUILD it at the Workshop, and climb the tree to a Rocket.
export const OPENING_STATIONS = [
  "survivor",
  "regolith_field",
  "wreck",
  "research",
];

// Starting cards seeded into a station's output tray (produced-but-uncollected,
// exactly as a normal cycle would leave them — each is its own card row, there is
// no quantity). `into` names the station defId whose tray the card lands in: two
// Effort under the Survivor, ready to crank the first station by hand.
export const OPENING_OUTPUTS: { def: string; into: string }[] = [
  { def: "effort", into: "survivor" },
  { def: "effort", into: "survivor" },
];
