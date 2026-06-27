import { CARDS } from "./cards";

// ──────────────────────────────────────────────────────────────────────────
// The opening deal — Escape the Moon's crash-site tableau.
//
// "What the game IS" at turn zero: the board's name, the tier-0 stations dealt
// onto the table, and the starting Effort. The per-card `opening` field is the
// source — a station's left-to-right order and any cards seeded into its tray —
// and this module projects it into the two lists the platform `newGame` reducer
// reads. (Which cards to deal is content; the spawning is mechanism.) See
// docs/ESCAPE_THE_MOON.md.
// ──────────────────────────────────────────────────────────────────────────

export const OPENING_BOARD_NAME = "Crash Site";

// Tier-0 stations along the top, in the order each card declares (opening.station):
// the Survivor (your hands), the Research bench, the Wreck, and the Regolith Field.
// The Printer and Workbench are NOT dealt — you salvage them from the Wreck (see
// the Wreck's wreckManifest), which softens the opening. Everything else is
// earned: gather by hand, RESEARCH a blueprint, BUILD it, and climb to a Rocket.
export const OPENING_STATIONS: string[] = CARDS.filter(
  (c) => c.opening?.station !== undefined,
)
  .sort((a, b) => a.opening!.station! - b.opening!.station!)
  .map((c) => c.defId);

// Starting cards seeded into a station's output tray (produced-but-uncollected,
// exactly as a normal cycle would leave them — each is its own card row, there is
// no quantity). `into` names the station defId whose tray the card lands in: three
// Effort under the Survivor, ready to crank the first station by hand.
export const OPENING_OUTPUTS: { def: string; into: string }[] = CARDS.flatMap(
  (c) =>
    (c.opening?.outputs ?? []).flatMap((o) =>
      Array.from({ length: o.count }, () => ({ def: o.def, into: c.defId })),
    ),
);
