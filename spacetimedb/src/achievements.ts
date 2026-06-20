import type { Ctx } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Achievements — milestones earned by playing. The *condition* lives here as
// code (a predicate over the board's lifetime card-history); the *display* text
// (title/description/order) is content, authored as achievement_def rows in
// init (lifecycle.ts). Same split as card_def (data) vs RESOLVERS (behaviour).
// The `id` of each rule below MUST match an achievement_def `achId`.
//
// Each predicate reads `counts`: a map of defId → lifetime count for one board
// (the my_card_history numbers). IMPORTANT: every milestone keys off a card that
// is NEVER in the opening deal (newGame deals only the four tier-0 stations — no
// resources, no blueprints — so do not base an achievement on those) — otherwise
// it would fire the instant a new game is dealt instead of when the player earns it.
// The Printer and Workshop are NO LONGER dealt (they're salvaged from the Wreck —
// see wreckDrop), so they're now legitimate bases: their first tally is the moment
// the player digs one out of the wreckage.
//
// The ONE deliberate exception is `crash`: the story's opening line, which we WANT
// to fire the instant a board is dealt. It keys on the Survivor (always dealt), so
// awardAchievements pops it on the very first tally of a new game.
// ──────────────────────────────────────────────────────────────────────────
export type AchievementRule = {
  id: string;
  earned: (counts: Map<string, bigint>) => boolean;
};

const has = (counts: Map<string, bigint>, defId: string): boolean =>
  (counts.get(defId) ?? 0n) > 0n;

// Machines the player *builds* (none are in the opening deal — the dealt
// stations are survivor/regolith_field/wreck/research).
const BUILT_MACHINES = [
  "solar_array",
  "refinery",
  "fabricator",
  "kiln",
  "electronics_fab",
  "ice_mine",
  "electrolysis",
  "chem_reactor",
  "assembler",
];
const SUBSYSTEMS = [
  "engine",
  "hull",
  "avionics",
  "life_support",
  "heat_shield",
];
const DRONES = ["drone_1", "drone_2", "drone_3", "drone_4"];

export const ACHIEVEMENTS: AchievementRule[] = [
  // The opening beat — fires at the deal (keyed on the always-dealt Survivor).
  { id: "crash", earned: (c) => has(c, "survivor") },
  { id: "prospector", earned: (c) => has(c, "regolith") },
  // The two things you dig out of the Wreck — no longer dealt at the start, so
  // their first tally is the salvage moment.
  { id: "salvage_printer", earned: (c) => has(c, "printer") },
  { id: "salvage_workshop", earned: (c) => has(c, "workshop") },
  // The Wreck picked clean — its husk (exhausted_wreck) is only ever created by
  // the Wreck running dry, so its first tally closes the scavenging story.
  { id: "wreck_exhausted", earned: (c) => has(c, "exhausted_wreck") },
  // Any blueprint discovered — none are in the opening deal now, so the first
  // one can only come from the Research bench.
  {
    id: "researcher",
    earned: (c) => [...c.keys()].some((k) => k.startsWith("blueprint_")),
  },
  { id: "power_up", earned: (c) => has(c, "power") },
  { id: "industrialist", earned: (c) => BUILT_MACHINES.some((m) => has(c, m)) },
  { id: "automation", earned: (c) => DRONES.some((d) => has(c, d)) },
  { id: "chemist", earned: (c) => has(c, "fuel") },
  { id: "launch_ready", earned: (c) => SUBSYSTEMS.every((s) => has(c, s)) },
  { id: "escape", earned: (c) => has(c, "escape") },
];

// Award any newly-satisfied achievements for `boardId`. Called from tally() —
// the single funnel every card birth passes through — so progress is re-checked
// exactly when the counts that feed the predicates change. Idempotent: a
// milestone already recorded is skipped, so each fires once and pops one toaster.
export function awardAchievements(ctx: Ctx, boardId: bigint): void {
  // defId → lifetime count for this board. We iterate-and-filter rather than a
  // prefix scan on the [boardId, defId] index: a one-column prefix (bare value)
  // panics in serializeRange inside SDK 2.5.0, and only the full two-column key
  // is safe. Per-board history is a few dozen rows, so the scan is cheap.
  const counts = new Map<string, bigint>();
  for (const h of ctx.db.cardHistory.iter())
    if (h.boardId === boardId) counts.set(h.defId, h.count);

  for (const a of ACHIEVEMENTS) {
    if (!a.earned(counts)) continue;
    const already = [
      ...ctx.db.achievement.by_board_ach.filter([boardId, a.id]),
    ][0];
    if (already) continue;
    ctx.db.achievement.insert({
      id: 0n,
      boardId,
      achId: a.id,
      earnedAt: ctx.timestamp,
      seen: false,
    });
  }
}
