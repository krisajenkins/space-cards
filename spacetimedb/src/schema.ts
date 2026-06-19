import { schema, table, t, SenderError } from "spacetimedb/server";
import {
  Location,
  IdentityProvider,
  SituationState,
  MemberRole,
  type Effects,
} from "./types";
import { RESOLVERS } from "./resolvers";
import {
  holeCards,
  maybeAutostart,
  spawnCard,
  spawnOutput,
  tryBeginRun,
  verbReady,
} from "./engine";
import { relayout } from "./layout";

// ──────────────────────────────────────────────────────────────────────────
// Catalogue (public). Authored content describing what cards exist.
// ──────────────────────────────────────────────────────────────────────────
export const cardDef = table(
  { name: "card_def", public: true },
  {
    defId: t.string().primaryKey(), // 'regolith', 'refinery', ...
    name: t.string(),
    category: t.string(), // coarse nominal type a hole can accept
    isVerb: t.bool(),
    reusable: t.bool(), // verb only: survive completion?
    outputCap: t.u32(), // verb only: max cards the output tray holds (0 = inert)
  },
);

export const slotDef = table(
  { name: "slot_def", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    defId: t.string().index("btree"), // -> card_def (a verb)
    slotIndex: t.u32(),
    accepts: t.array(t.string()), // category names and/or defIds
    required: t.bool(),
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Ownership. PRIVATE: clients never read these tables directly — they read the
// per-player `my_*` views below, scoped to board membership. See §2 of the doc.
//
// A `user` is a human; an `identity` is one authenticated principal
// (`ctx.sender`). MANY identities point at one user, so a human who signs in
// from several providers/devices is one account. Domain tables key on
// `user.id` (NOT the principal) — keying on the principal would lock out
// multi-provider auth. See docs/DATA_MODEL.md §11.
// ──────────────────────────────────────────────────────────────────────────
export const user = table(
  { name: "user" },
  {
    id: t.u64().primaryKey().autoInc(),
    primaryEmail: t.string().unique(), // lower-cased; the cross-provider join key
    displayName: t.string(),
    pictureUrl: t.option(t.string()),
    isAdmin: t.bool(),
    createdAt: t.timestamp(),
  },
);

// One row per linked principal. PK == ctx.sender → O(1) caller resolution.
export const identity = table(
  {
    name: "identity",
    indexes: [{ accessor: "by_user", algorithm: "btree", columns: ["userId"] }],
  },
  {
    id: t.identity().primaryKey(), // == ctx.sender
    userId: t.u64(), // FK → user.id
    provider: IdentityProvider,
    linkedAt: t.timestamp(),
  },
);

export const board = table(
  { name: "board" },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    owner: t.u64(), // user.id — sole authority to transfer cards off this board
    createdAt: t.timestamp(),
  },
);

export const boardMember = table(
  { name: "board_member" },
  {
    id: t.u64().primaryKey().autoInc(),
    boardId: t.u64().index("btree"),
    userId: t.u64().index("btree"), // -> user.id
    role: MemberRole,
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Instances. PRIVATE — exposed only through the per-player `my_*` views.
// ──────────────────────────────────────────────────────────────────────────
export const card = table(
  { name: "card" },
  {
    id: t.u64().primaryKey().autoInc(),
    boardId: t.u64().index("btree"),
    defId: t.string(),
    location: Location,
  },
);

// Runtime state of an active verb-card. 1:1 with the verb card, keyed by its id.
export const situation = table(
  { name: "situation" },
  {
    cardId: t.u64().primaryKey(),
    boardId: t.u64().index("btree"),
    state: SituationState,
    endsAt: t.option(t.timestamp()),
  },
);

// One one-shot timer per running call (private; server-only).
export const situationTimer = table(
  { name: "situation_timer", scheduled: (): any => completeSituation },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    verbCardId: t.u64(),
  },
);

const spacetimedb = schema({
  cardDef,
  slotDef,
  user,
  identity,
  board,
  boardMember,
  card,
  situation,
  situationTimer,
});
export default spacetimedb;

// ──────────────────────────────────────────────────────────────────────────
// Scheduled: a call has finished. Resolve it, then recycle or retire.
//
// This reducer is colocated with the schema because `situation_timer` above
// names it as its scheduled target. The lazy `(): any => completeSituation`
// arrow defers the reference until the scheduler fires, by which point this
// `const` is initialised — splitting it into another module would make the
// table definition reach across an init-order cycle.
// ──────────────────────────────────────────────────────────────────────────
export const completeSituation = spacetimedb.reducer(
  { timer: situationTimer.rowType },
  (ctx, { timer }) => {
    // Scheduler-only. A scheduled reducer is callable over the wire like any
    // other, so without this a client could forge a `timer` row and force-
    // resolve any verb on any board (skipping durations, mutating cards on
    // boards they aren't a member of). The scheduler invokes us as the module
    // itself, so the gate is: sender must be the database's own identity.
    // (`databaseIdentity` is the non-deprecated accessor; old code used
    // `ctx.identity`.)
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("completeSituation is scheduler-only");
    }

    ctx.db.situationTimer.scheduledId.delete(timer.scheduledId);

    const verbCardId = timer.verbCardId;
    const s = ctx.db.situation.cardId.find(verbCardId);
    if (!s || s.state.tag !== "ongoing") return; // cancelled/changed → no-op
    const verb = ctx.db.card.id.find(verbCardId);
    if (!verb) {
      ctx.db.situation.cardId.delete(verbCardId);
      return;
    }

    const r = RESOLVERS[verb.defId];
    const holes = holeCards(ctx, verbCardId);
    const eff: Effects = r
      ? r.resolve(ctx, holes, verb)
      : { consume: [], produce: [], again: false };

    for (const id of eff.consume) ctx.db.card.id.delete(id);

    // Relocations (the Worker shuttling a card from a tray into a hole). Apply
    // each move, then mirror the side-effects a player's slot/collect triggers:
    // vacating an output tray can un-stall its emitter, and filling a hole can
    // autostart the destination verb.
    for (const mv of eff.moves ?? []) {
      const moving = ctx.db.card.id.find(mv.cardId);
      if (!moving) continue;
      const from = moving.location;
      ctx.db.card.id.update({ ...moving, location: mv.to });
      if (from.tag === "output") {
        const src = ctx.db.situation.cardId.find(from.value.verbCardId);
        if (src && src.state.tag === "stalled")
          tryBeginRun(ctx, from.value.verbCardId);
      }
      if (mv.to.tag === "slotted") maybeAutostart(ctx, mv.to.value.verbCardId);
    }

    // Transform-in-place: the verb metamorphoses into a new card where it stood
    // (a Seed → Forest), rather than producing into a tray it would orphan when
    // it retires. Supersedes produce/recycle — we're done after the swap.
    if (eff.become) {
      const pos =
        verb.location.tag === "tabletop" ? verb.location.value : { x: 0, y: 0 };
      ctx.db.situation.cardId.delete(verbCardId);
      ctx.db.card.id.delete(verbCardId);
      const grown = spawnCard(ctx, verb.boardId, eff.become, pos.x, pos.y);
      // The new card holds the old verb's spot (pinned); its larger footprint
      // nudges neighbours aside if it now needs more room.
      relayout(ctx, verb.boardId, grown.id);
      return;
    }

    for (const defId of eff.produce)
      spawnOutput(ctx, verb.boardId, defId, verbCardId);

    const def = ctx.db.cardDef.defId.find(verb.defId);
    const reusable = def ? def.reusable : false;
    if (!reusable) {
      ctx.db.situation.cardId.delete(verbCardId);
      ctx.db.card.id.delete(verbCardId);
      return;
    }

    if (eff.again && verbReady(ctx, verbCardId)) {
      tryBeginRun(ctx, verbCardId);
    } else {
      ctx.db.situation.cardId.update({
        ...s,
        state: { tag: "assembling" },
        endsAt: undefined,
      });
    }
  },
);
