import type { Ctx } from "../platform/types";
import { CARDS } from "./cards";

// ──────────────────────────────────────────────────────────────────────────
// Achievements — the earning mechanism. The milestones themselves (title /
// description / sort / earning predicate) now live ON the card that triggers
// them: a card's `achievement` field (see content/cards/*). Most key on that
// card's own first appearance; the two cross-card ones are owned by the card they
// thematically belong to — `researcher` (any blueprint discovered) on research.ts,
// `launch_ready` (all five subsystems) on rocket.ts. The display text is seeded
// into achievement_def by seedCatalogue; this module just runs the predicates.
//
// Each predicate reads `counts`: a map of defId → lifetime count for one board
// (the my_card_history numbers). IMPORTANT: every milestone keys off a card that
// is NEVER in the opening deal (newGame deals only the four tier-0 stations) —
// otherwise it would fire the instant a new game is dealt. The ONE deliberate
// exception is `crash` (survivor.ts): the story's opening line, which keys on the
// always-dealt Survivor so it pops on the very first tally of a new game.
// ──────────────────────────────────────────────────────────────────────────

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

  for (const c of CARDS) {
    const a = c.achievement;
    if (!a || !a.earned(counts)) continue;
    const already = [
      ...ctx.db.achievement.by_board_ach.filter([boardId, a.achId]),
    ][0];
    if (already) continue;
    ctx.db.achievement.insert({
      id: 0n,
      boardId,
      achId: a.achId,
      earnedAt: ctx.timestamp,
      seen: false,
    });
  }
}
