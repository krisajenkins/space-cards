import { t } from "spacetimedb/server";

// ──────────────────────────────────────────────────────────────────────────
// Where a card is. Mutually-exclusive places → a sum type.
// ──────────────────────────────────────────────────────────────────────────
export const Location = t.enum("Location", {
  tabletop: t.object("Tabletop", { x: t.f32(), y: t.f32() }),
  slotted: t.object("Slotted", { verbCardId: t.u64(), slotIndex: t.u32() }),
  output: t.object("Output", { verbCardId: t.u64() }),
});

// ──────────────────────────────────────────────────────────────────────────
// Auth — which provider minted an `identity` row. Payloadless variants.
// ──────────────────────────────────────────────────────────────────────────
export const IdentityProvider = t.enum("IdentityProvider", {
  Google: t.unit(),
  Spacetime: t.unit(),
});

// ──────────────────────────────────────────────────────────────────────────
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes.
// ──────────────────────────────────────────────────────────────────────────
// `become` is transform-in-place: the verb card metamorphoses into a new card
// where it stood, instead of producing into its output tray (a planted Seed
// becoming a Forest). When set it supersedes `produce`/recycle — see
// completeSituation.
// `again` is the re-fire flag: when true, the verb starts another run as soon
// as this one completes (if its holes are still filled); when false it falls
// idle and waits for the player. The next run's length is recomputed from
// `duration()` — `again` does not carry it.
export type Effects = {
  consume: bigint[];
  produce: string[];
  again: boolean;
  become?: string;
};

// "Me": who the client is signed in as, and their capabilities. Empty until the
// caller's principal is linked to a user. NOTE: primaryEmail IS projected here
// (the caller's own email, to themselves) — but NOT in any cross-user view.
export const MeRow = t.object("MeRow", {
  userId: t.u64(),
  primaryEmail: t.string(),
  displayName: t.string(),
  pictureUrl: t.option(t.string()),
  isAdmin: t.bool(),
});
