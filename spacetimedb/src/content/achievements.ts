import type { Ctx } from "../platform/types";

// ──────────────────────────────────────────────────────────────────────────
// Achievements — milestones earned by playing. This is "what the game IS": the
// trophy shelf. BOTH halves live here now — the *display* content (title /
// description / order, authored as ACHIEVEMENT_DEFS and seeded into
// achievement_def) AND the *condition* that earns each one (ACHIEVEMENTS, a
// predicate over the board's lifetime card-history). They are keyed to each
// other by `achId`; keeping them in one file is the whole point of this module
// (previously the text was buried in lifecycle.ts and the conditions sat alone).
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

// ── Display content (seeded into achievement_def by seedCatalogue) ──────────
// The trophy shelf, ordered as the story unfolds: crash → scavenge → research →
// build → power → automate → fuel → assemble → escape. Each description is a
// beat in that arc, not a dry "did X" line. The first is the inciting incident,
// not a reward: it fires the instant a board is dealt (keyed on the Survivor),
// so the story opens with a line of its own before the player has done anything.
// `sort` orders the shelf roughly along that arc.
export type AchievementDef = {
  achId: string;
  title: string;
  description: string;
  sort: number;
};
export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    achId: "crash",
    title: "Crash Landing",
    description:
      "Your ship is scattered across the regolith and you're the only thing still moving. No rescue is coming - the only way off this rock is the one you build. So get to work.",
    sort: 0,
  },
  {
    achId: "prospector",
    title: "Prospector",
    description:
      "You claw the first regolith from the lunar dust. It isn't much — but the moon has materials, and that's where it starts.",
    sort: 1,
  },
  {
    achId: "salvage_printer",
    title: "Spare Parts",
    description:
      "You manage to salvage a working printer from the wreckage. Now you can make tools, and that could give you a fighting chance...",
    sort: 2,
  },
  {
    achId: "salvage_workshop",
    title: "A Fighting Chance",
    description:
      "A workshop, dragged intact from the wreck. With this, could you build your way off the moon?",
    sort: 3,
  },
  {
    achId: "wreck_exhausted",
    title: "Picked Clean",
    description:
      "You've stripped the wreck to its bones - there's nothing left to scavenge. From here, everything you build comes from your own effort and industry.",
    sort: 4,
  },
  {
    achId: "researcher",
    title: "Eureka",
    description:
      "You reverse-engineer your first blueprint. The long road home begins to take shape.",
    sort: 5,
  },
  {
    achId: "industrialist",
    title: "Industrialist",
    description:
      "Your first self-built machine stands and hums. The crash site is becoming a factory.",
    sort: 6,
  },
  {
    achId: "power_up",
    title: "Let There Be Light",
    description:
      "Power of your own, at last. The base wakes up - and the heavy machines can finally run.",
    sort: 7,
  },
  {
    achId: "automation",
    title: "Hands Off",
    description:
      "A drone to take over the grind. The work can do itself now, and your hands will be free for bigger things. But one drone may not be enough...",
    sort: 8,
  },
  {
    achId: "chemist",
    title: "Rocket Fuel",
    description:
      "The first fuel is refined - the slowest, hardest step on the whole moon. The rocket will drink every drop.",
    sort: 9,
  },
  {
    achId: "launch_ready",
    title: "All Systems Go",
    description:
      "Engine, hull, avionics, life support, heat shield - every subsystem built. The rocket is whole and waiting.",
    sort: 10,
  },
  {
    achId: "escape",
    title: "Escape the Moon",
    description:
      "Ignition. The wreck and the grey dust fall away beneath you. You're going home.",
    sort: 11,
  },
];

// ── Conditions (the code keyed to each achId above) ─────────────────────────
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
