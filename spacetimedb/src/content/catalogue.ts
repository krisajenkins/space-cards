import type { Ctx } from "../platform/types";
import { CARDS } from "./cards";

// ──────────────────────────────────────────────────────────────────────────
// The card catalogue — "what the game IS". `seedCatalogue` writes the authored
// content (card_def + the holes on each verb in slot_def + the milestone display
// text in achievement_def) into the database, PROJECTED from the per-card modules
// in content/cards/. The cards themselves are defined one-per-file there; this is
// just the loader that turns that array into rows.
//
// `seedCatalogue` is idempotent: it wipes card_def + slot_def + achievement_def
// and rebuilds from scratch. Safe to re-run on a LIVE database — cards reference
// card_defs by their string `defId` (not a row id) and a slotted card stores a
// `slotIndex` (not a slot_def id), so a full catalogue refresh inside one
// transaction never disturbs boards, cards or situations. This is the migration
// path for any catalogue change after first publish: `init` runs only once, so
// `reseed_catalogue` (lifecycle.ts) re-applies this to an already-initialised DB.
// ──────────────────────────────────────────────────────────────────────────
export function seedCatalogue(ctx: Ctx) {
  for (const s of [...ctx.db.slotDef.iter()]) ctx.db.slotDef.id.delete(s.id);
  for (const d of [...ctx.db.cardDef.iter()])
    ctx.db.cardDef.defId.delete(d.defId);
  for (const a of [...ctx.db.achievementDef.iter()])
    ctx.db.achievementDef.achId.delete(a.achId);

  // ── card_def + slot_def, one card at a time ──────────────────────────────
  for (const c of CARDS) {
    const isVerb = c.isVerb ?? false;
    ctx.db.cardDef.insert({
      defId: c.defId,
      name: c.name,
      category: c.category,
      isVerb,
      reusable: c.reusable ?? isVerb,
      outputCap: c.outputCap ?? 0,
      droneLevel: c.droneLevel ?? 0,
    });
    for (const s of c.slots ?? [])
      ctx.db.slotDef.insert({
        id: 0n,
        slotIndex: s.slotIndex,
        defId: c.defId,
        accepts: s.accepts,
        required: s.required,
        droneLevel: s.droneLevel,
      });
  }

  // ── achievement_def (display text) ───────────────────────────────────────
  // The condition that earns each one is the same card's `achievement.earned`
  // predicate, run by awardAchievements (content/achievements.ts) keyed on the
  // same achId. Insert the text + sort order here, in shelf order.
  const achs = CARDS.filter((c) => c.achievement)
    .map((c) => c.achievement!)
    .sort((a, b) => a.sort - b.sort);
  for (const a of achs)
    ctx.db.achievementDef.insert({
      achId: a.achId,
      title: a.title,
      description: a.description,
      sort: a.sort,
    });
}
