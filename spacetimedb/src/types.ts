import { t } from "spacetimedb/server";
import type {
  InferSchema,
  ReducerCtx,
  ViewCtx,
  Infer,
} from "spacetimedb/server";
// Type-only — erased at runtime, so this does not create an import cycle with
// schema.ts (which imports the Location / IdentityProvider / MeRow *values* from
// here). It lets us derive a single, authoritative set of row + context types
// from the schema instead of sprinkling `any` through the engine.
import type spacetimedb from "./schema";
import type {
  card,
  cardHistory,
  situation,
  user,
  board,
  boardMember,
  cardDef,
  slotDef,
  identity,
} from "./schema";

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
// Closed value sets that used to be free `t.string()` columns. As sum types a
// stray spelling (`{ tag: "ongong" }`) or a `=== "ongoing"` comparison against
// the whole row is now a compile error instead of a silent always-false.
// ──────────────────────────────────────────────────────────────────────────
export const SituationState = t.enum("SituationState", {
  assembling: t.unit(),
  ongoing: t.unit(),
  stalled: t.unit(),
});

export const MemberRole = t.enum("MemberRole", {
  player: t.unit(),
  spectator: t.unit(),
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
// `moves` relocates cards that already exist on the board, rather than creating
// or destroying them — the Worker uses it to shuttle a card out of an output
// tray and into an open hole. Each entry sets a card's `location` to `to`; the
// engine then runs the same side-effects a player's slot/collect would (a
// vacated tray can un-stall its emitter; a freshly-filled hole can autostart its
// verb). See completeSituation.
export type Effects = {
  consume: bigint[];
  produce: string[];
  again: boolean;
  become?: string;
  moves?: { cardId: bigint; to: LocationValue }[];
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

// ──────────────────────────────────────────────────────────────────────────
// Schema-derived types. `Ctx` / `ViewContext` are what the framework hands a
// reducer / view callback; the row types are the concrete shape of each table.
// Engine and helper functions take these instead of `any` so a typo in a column
// name or a missing null-check is a compile error.
// ──────────────────────────────────────────────────────────────────────────
export type Schema = InferSchema<typeof spacetimedb>;
export type Ctx = ReducerCtx<Schema>;
export type ViewContext = ViewCtx<Schema>;
// lookupCaller runs from both reducers (read+write db) and views (read-only db),
// so its ctx is the union of the two.
export type ReadCtx = Ctx | ViewContext;

export type Card = Infer<typeof card.rowType>;
export type CardHistory = Infer<typeof cardHistory.rowType>;
export type Situation = Infer<typeof situation.rowType>;
export type User = Infer<typeof user.rowType>;
export type Board = Infer<typeof board.rowType>;
export type BoardMember = Infer<typeof boardMember.rowType>;
export type CardDef = Infer<typeof cardDef.rowType>;
export type SlotDef = Infer<typeof slotDef.rowType>;
export type IdentityRow = Infer<typeof identity.rowType>;

// The `Location` sum type as a discriminated union, plus cards whose place is
// statically known. A `SlottedCard` carries a `slotIndex`; an `OutputCard`
// knows its producing verb — narrowing once (in holeCards / outputCount) lets
// every downstream access reach `.location.value.slotIndex` without a cast.
export type LocationValue = Infer<typeof Location>;
export type SlottedCard = Card & {
  location: Extract<LocationValue, { tag: "slotted" }>;
};
export type OutputCard = Card & {
  location: Extract<LocationValue, { tag: "output" }>;
};
