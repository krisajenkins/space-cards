import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt, Timestamp } from "spacetimedb";

// ──────────────────────────────────────────────────────────────────────────
// Durations (microseconds)
// ──────────────────────────────────────────────────────────────────────────
const MINUTE = 60_000_000n; // a literal minute (engine default fallback)
const REST = 15_000_000n; // You resting to generate one Health
const LUMBERJACK = 20_000_000n; // Lumberjack chopping one Wood in the Forest
const CHOP = 5_000_000n; // Forest chopping one Health
const MARKET = 3_000_000n; // Market selling one Wood
const HIRE = 8_000_000n; // Agency processing a hire
const FOREST_GROWTH = 60_000_000n; // a planted Seed maturing into a Forest

// ──────────────────────────────────────────────────────────────────────────
// Auth — trusted issuers. We split identity (the principal, `ctx.sender`) from
// user (the human); see docs/DATA_MODEL.md §11. A Google JWT auto-links by
// verified email; everything else must be linked explicitly. The client id is
// public (not a secret) so it lives here as a constant rather than in env.
// ──────────────────────────────────────────────────────────────────────────
// Google mints ID tokens with `iss` as EITHER form — accept both.
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_CLIENT_ID =
  "171597117898-udk35oal7pgj04a08uldr0k7cpa2tuaa.apps.googleusercontent.com";

// ──────────────────────────────────────────────────────────────────────────
// Where a card is. Mutually-exclusive places → a sum type.
// ──────────────────────────────────────────────────────────────────────────
const Location = t.enum("Location", {
  tabletop: t.object("Tabletop", { x: t.f32(), y: t.f32() }),
  slotted: t.object("Slotted", { verbCardId: t.u64(), slotIndex: t.u32() }),
  output: t.object("Output", { verbCardId: t.u64() }),
});

// ──────────────────────────────────────────────────────────────────────────
// Catalogue (public). Authored content describing what cards exist.
// ──────────────────────────────────────────────────────────────────────────
const cardDef = table(
  { name: "card_def", public: true },
  {
    defId: t.string().primaryKey(), // 'health', 'forest', ...
    name: t.string(),
    category: t.string(), // coarse nominal type a hole can accept
    isVerb: t.bool(),
    reusable: t.bool(), // verb only: survive completion?
    outputCap: t.u32(), // verb only: max cards the output tray holds (0 = inert)
  },
);

const slotDef = table(
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
// Auth — which provider minted an `identity` row. Payloadless variants.
// ──────────────────────────────────────────────────────────────────────────
const IdentityProvider = t.enum("IdentityProvider", {
  Google: t.unit(),
  Spacetime: t.unit(),
});

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
const user = table(
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
const identity = table(
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

const board = table(
  { name: "board" },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    owner: t.u64(), // user.id — sole authority to transfer cards off this board
    createdAt: t.timestamp(),
  },
);

const boardMember = table(
  { name: "board_member" },
  {
    id: t.u64().primaryKey().autoInc(),
    boardId: t.u64().index("btree"),
    userId: t.u64().index("btree"), // -> user.id
    role: t.string(), // 'player' | 'spectator'
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Instances. PRIVATE — exposed only through the per-player `my_*` views.
// ──────────────────────────────────────────────────────────────────────────
const card = table(
  { name: "card" },
  {
    id: t.u64().primaryKey().autoInc(),
    boardId: t.u64().index("btree"),
    defId: t.string(),
    location: Location,
  },
);

// Runtime state of an active verb-card. 1:1 with the verb card, keyed by its id.
const situation = table(
  { name: "situation" },
  {
    cardId: t.u64().primaryKey(),
    boardId: t.u64().index("btree"),
    state: t.string(), // 'assembling' | 'ongoing' | 'stalled'
    endsAt: t.option(t.timestamp()),
  },
);

// One one-shot timer per running call (private; server-only).
const situationTimer = table(
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
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes.
// ──────────────────────────────────────────────────────────────────────────
// `become` is transform-in-place: the verb card metamorphoses into a new card
// where it stood, instead of producing into its output tray (a planted Seed
// becoming a Forest). When set it supersedes `produce`/recycle — see
// completeSituation.
type Effects = {
  consume: bigint[];
  produce: string[];
  again: bigint | null;
  become?: string;
};

const RESOLVERS: Record<
  string,
  {
    duration: (holes: any[]) => bigint;
    resolve: (ctx: any, holes: any[]) => Effects;
  }
> = {
  // You: no inputs, emits one Health per minute (capped on the card_def).
  you: {
    duration: () => REST,
    resolve: () => ({ consume: [], produce: ["health"], again: REST }),
  },

  // Forest: dual-mode. Either way a chop yields Wood, or a 10% Seed instead.
  //  - fed a Lumberjack: chop every minute, keep the Lumberjack.
  //  - fed Health: chop once (consuming it), plus a 1% chance of a Lumberjack.
  forest: {
    duration: (holes) => (holes[0]?.defId === "lumberjack" ? LUMBERJACK : CHOP),
    resolve: (ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      // 10% of chops throw up a Seed instead of Wood — plant it for a Forest.
      const produce = [ctx.random() < 0.1 ? "seed" : "wood"];
      if (input.defId === "lumberjack") {
        return { consume: [], produce, again: LUMBERJACK };
      }
      if (ctx.random() < 0.01) produce.push("lumberjack");
      return { consume: [input.id], produce, again: null };
    },
  },

  // Market: an inbox queue. Sells the wood at the head of the queue (lowest
  // slot) for a Coin each cycle, then re-fires to work through whatever else is
  // waiting — `again` drains the queue while `verbReady` stops it when empty.
  market: {
    duration: () => MARKET,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      return { consume: [input.id], produce: ["coin"], again: MARKET };
    },
  },

  // Seed: a no-hole, one-shot grower. It only runs once on the tabletop (see
  // maybeAutostart's tabletop gate), so a Seed sitting in the Forest's tray
  // waits, inert-looking, until the player plants it. After FOREST_GROWTH it
  // metamorphoses into a Forest where it stood (`become`).
  seed: {
    duration: () => FOREST_GROWTH,
    resolve: () => ({
      consume: [],
      produce: [],
      again: null,
      become: "forest",
    }),
  },

  // Agency: a guaranteed Lumberjack for ten Coins — the deterministic path when
  // the Forest's 10% drop won't oblige. Eats every coin in its holes (all ten
  // are required, so a run only fires once full) and hands back one Lumberjack.
  agency: {
    duration: () => HIRE,
    resolve: (_ctx, holes) => ({
      consume: holes.map((h: any) => h.id),
      produce: ["lumberjack"],
      again: null,
    }),
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Engine helpers
// ──────────────────────────────────────────────────────────────────────────
function holeCards(ctx: any, verbCardId: bigint): any[] {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return [];
  return [...ctx.db.card.boardId.filter(verb.boardId)]
    .filter(
      (c: any) =>
        c.location.tag === "slotted" &&
        c.location.value.verbCardId === verbCardId,
    )
    .sort(
      (a: any, b: any) =>
        a.location.value.slotIndex - b.location.value.slotIndex,
    );
}

function outputCount(ctx: any, verbCardId: bigint): number {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return 0;
  return [...ctx.db.card.boardId.filter(verb.boardId)].filter(
    (c: any) =>
      c.location.tag === "output" && c.location.value.verbCardId === verbCardId,
  ).length;
}

// A verb is ready to run when every required hole is filled AND — if it has any
// holes at all — at least one of them is filled. The second clause is what lets
// a hole-less verb (You, Seed) fire while self-contained, yet stops a verb with
// optional holes from firing on nothing: the Market's five wood holes are all
// optional, so it fires whenever any wood is waiting and drains the queue one
// per cycle, but sits idle when empty.
function verbReady(ctx: any, verbCardId: bigint): boolean {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return false;
  const slots = [...ctx.db.slotDef.defId.filter(verb.defId)];
  const holes = holeCards(ctx, verbCardId);
  const filled = new Set(holes.map((h: any) => h.location.value.slotIndex));
  const requiredFilled = slots
    .filter((s: any) => s.required)
    .every((s: any) => filled.has(s.slotIndex));
  if (!requiredFilled) return false;
  if (slots.length > 0 && holes.length === 0) return false; // has holes, none filled
  return true;
}

// Begin (or re-begin) a run, unless the output tray is full → then stall.
function tryBeginRun(ctx: any, verbCardId: bigint): void {
  const s = ctx.db.situation.cardId.find(verbCardId);
  const verb = ctx.db.card.id.find(verbCardId);
  if (!s || !verb) return;
  const def = ctx.db.cardDef.defId.find(verb.defId);
  const cap = def ? def.outputCap : 0;
  if (cap > 0 && outputCount(ctx, verbCardId) >= cap) {
    ctx.db.situation.cardId.update({
      ...s,
      state: "stalled",
      endsAt: undefined,
    });
    return;
  }
  const r = RESOLVERS[verb.defId];
  const dur = r ? r.duration(holeCards(ctx, verbCardId)) : MINUTE;
  const endMicros = ctx.timestamp.microsSinceUnixEpoch + dur;
  ctx.db.situation.cardId.update({
    ...s,
    state: "ongoing",
    endsAt: new Timestamp(endMicros),
  });
  ctx.db.situationTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(endMicros),
    verbCardId,
  });
}

// A verb begins a run only when it is idle (assembling) AND on the tabletop.
// The tabletop gate is what makes "grows once planted" work: a no-hole verb
// like a Seed won't run while it sits in an output tray, and repositioning an
// already-running card is a no-op rather than a double-fire.
function maybeAutostart(ctx: any, verbCardId: bigint): void {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb || verb.location.tag !== "tabletop") return;
  const s = ctx.db.situation.cardId.find(verbCardId);
  if (!s || s.state !== "assembling") return;
  if (verbReady(ctx, verbCardId)) tryBeginRun(ctx, verbCardId);
}

function spawnCard(
  ctx: any,
  boardId: bigint,
  defId: string,
  x: number,
  y: number,
): any {
  const def = ctx.db.cardDef.defId.find(defId);
  const c = ctx.db.card.insert({
    id: 0n,
    boardId,
    defId,
    location: { tag: "tabletop", value: { x, y } },
  });
  if (def && def.isVerb) {
    ctx.db.situation.insert({
      cardId: c.id,
      boardId,
      state: "assembling",
      endsAt: undefined,
    });
    maybeAutostart(ctx, c.id);
  }
  return c;
}

function spawnOutput(
  ctx: any,
  boardId: bigint,
  defId: string,
  verbCardId: bigint,
): void {
  const c = ctx.db.card.insert({
    id: 0n,
    boardId,
    defId,
    location: { tag: "output", value: { verbCardId } },
  });
  // A verb produced into a tray (e.g. a Seed) gets run-state like any verb, but
  // we do NOT autostart it: it isn't on the tabletop, so it can't run yet. It
  // begins when the player collects it onto the table — see moveCard.
  const def = ctx.db.cardDef.defId.find(defId);
  if (def && def.isVerb) {
    ctx.db.situation.insert({
      cardId: c.id,
      boardId,
      state: "assembling",
      endsAt: undefined,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Auth helpers. Resolve principal → identity → user. NOTE: `.find()` returns
// `null` (not `undefined`) when absent — always compare against `null`, or the
// check is an always-true auth bypass.
// ──────────────────────────────────────────────────────────────────────────
function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

function lookupCaller(ctx: any): { identity: any; user: any } | null {
  const ident = ctx.db.identity.id.find(ctx.sender);
  if (ident === null) return null; // unknown principal
  const u = ctx.db.user.id.find(ident.userId);
  if (u === null) return null; // dangling FK (shouldn't happen)
  return { identity: ident, user: u };
}

function requireCaller(ctx: any): { identity: any; user: any } {
  const caller = lookupCaller(ctx);
  if (caller === null) {
    throw new SenderError(
      "Sign in first — no linked profile for this identity.",
    );
  }
  return caller;
}

function requireAdmin(ctx: any, action: string): { identity: any; user: any } {
  const caller = requireCaller(ctx);
  if (!caller.user.isAdmin) {
    throw new SenderError(`${action} requires admin privileges.`);
  }
  return caller;
}

// Resolve the caller and assert they are a member of the board. Returns the
// caller's user so callers can use `me.id` for ownership checks.
function requireMember(ctx: any, boardId: bigint): { user: any } {
  const { user: me } = requireCaller(ctx);
  const ok = [...ctx.db.boardMember.boardId.filter(boardId)].some(
    (m: any) => m.userId === me.id,
  );
  if (!ok) throw new SenderError("not a member of this board");
  return { user: me };
}

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────
export const init = spacetimedb.init((ctx) => {
  // Seed the catalogue.
  const inert = (defId: string, name: string, category: string) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: false,
      reusable: false,
      outputCap: 0,
    });
  const verb = (
    defId: string,
    name: string,
    category: string,
    outputCap: number,
  ) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: true,
      reusable: true,
      outputCap,
    });

  inert("health", "Health", "health");
  inert("wood", "Wood", "wood");
  inert("coin", "Coin", "coin");
  inert("lumberjack", "Lumberjack", "lumberjack");

  // Seed: a verb, but one-shot and hole-less — it looks inert until planted on
  // the tabletop, then grows into a Forest. outputCap 0 (it never trays output;
  // it transforms in place), not reusable (a single metamorphosis).
  ctx.db.cardDef.insert({
    defId: "seed",
    name: "Seed",
    category: "seed",
    isVerb: true,
    reusable: false,
    outputCap: 0,
  });

  verb("you", "You", "avatar", 5);
  verb("forest", "Forest", "station", 5);
  verb("market", "Market", "station", 10);
  verb("agency", "Agency", "station", 3);

  ctx.db.slotDef.insert({
    id: 0n,
    defId: "forest",
    slotIndex: 0,
    accepts: ["health", "lumberjack"],
    required: true,
  });
  // Market: a five-deep inbox queue for wood. None required — it sells whatever
  // is waiting, one per cycle (see the market resolver + verbReady), so a single
  // wood fires it and you can keep topping up the queue while it runs.
  for (let i = 0; i < 5; i++) {
    ctx.db.slotDef.insert({
      id: 0n,
      defId: "market",
      slotIndex: i,
      accepts: ["wood"],
      required: false,
    });
  }

  // Agency: ten Coin holes (no quantity in the model — multiplicity is multiple
  // holes; see DATA_MODEL §3.1). All required, so the hire fires only once paid.
  for (let i = 0; i < 10; i++) {
    ctx.db.slotDef.insert({
      id: 0n,
      defId: "agency",
      slotIndex: i,
      accepts: ["coin"],
      required: true,
    });
  }
});

// Auto-link trusted (Google) logins on connect. Connecting is permissive — any
// principal may open a socket — but the `identity` table is the gate: only a
// linked principal can do anything (see reducers below). Untrusted providers
// (e.g. SpacetimeAuth CLI tokens) are NOT auto-linked; they link explicitly via
// `bootstrap_first_admin` / a future "link account" reducer. See doc §11.
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const jwt = ctx.senderAuth.jwt;

  // Trust check: BOTH issuer and audience (issuer alone would accept a token
  // minted for a different app by the same IdP).
  const isGoogle =
    jwt !== null &&
    GOOGLE_ISSUERS.includes(jwt.issuer) &&
    jwt.audience.includes(GOOGLE_CLIENT_ID);

  const payload = jwt?.fullPayload ?? null;
  const email = normaliseEmail(payload?.["email"]);
  const pictureClaim = payload?.["picture"];
  const pictureUrl =
    typeof pictureClaim === "string" ? pictureClaim : undefined;
  const nameClaim = payload?.["name"];
  const displayName =
    typeof nameClaim === "string" && nameClaim.trim().length > 0
      ? nameClaim.trim()
      : (email?.split("@")[0] ?? "Player");

  const existing = ctx.db.identity.id.find(ctx.sender);

  // Known principal → refresh ONLY provider-owned fields (email, picture).
  // Never re-sync displayName: the human owns that once they've edited it.
  if (existing !== null) {
    if (!isGoogle || email === null) return;
    const u = ctx.db.user.id.find(existing.userId);
    if (u === null) return;
    // Email rotation: skip the email change if that address now belongs to a
    // DIFFERENT user (would violate the unique constraint); still refresh picture.
    const collision = ctx.db.user.primaryEmail.find(email);
    const nextEmail =
      collision !== null && collision.id !== u.id ? u.primaryEmail : email;
    ctx.db.user.id.update({
      ...u,
      primaryEmail: nextEmail,
      pictureUrl: pictureUrl ?? u.pictureUrl,
    });
    return;
  }

  // New principal. Only auto-link providers we trust to assert a verified email.
  if (!isGoogle || email === null) return;

  // Find-or-create the user by email, then attach this principal. This is what
  // merges providers: an existing user with that email (CLI bootstrap, prior
  // login) gets a second identity rather than forking a second human.
  const existingUser = ctx.db.user.primaryEmail.find(email);
  const userId =
    existingUser?.id ??
    ctx.db.user.insert({
      id: 0n,
      primaryEmail: email,
      displayName,
      pictureUrl,
      isAdmin: false,
      createdAt: ctx.timestamp,
    }).id;

  ctx.db.identity.insert({
    id: ctx.sender,
    userId,
    provider: { tag: "Google" },
    linkedAt: ctx.timestamp,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

// Explicit linking for non-auto providers (the CLI / SpacetimeAuth path), which
// also bootstraps the first admin. Find-or-create the same user the web login
// resolves to (by email), link THIS principal, and flip isAdmin. One-shot: it
// refuses once any admin exists, so it closes itself. See doc §5.
export const bootstrapFirstAdmin = spacetimedb.reducer(
  { email: t.string() },
  (ctx, { email }) => {
    for (const u of ctx.db.user.iter()) {
      if (u.isAdmin)
        throw new SenderError("An admin already exists; bootstrap is closed.");
    }
    const trimmed = normaliseEmail(email);
    if (trimmed === null)
      throw new SenderError("requires the human's primary email.");

    const target =
      ctx.db.user.primaryEmail.find(trimmed) ??
      ctx.db.user.insert({
        id: 0n,
        primaryEmail: trimmed,
        displayName: trimmed.split("@")[0] ?? trimmed,
        pictureUrl: undefined,
        isAdmin: false,
        createdAt: ctx.timestamp,
      });

    const existing = ctx.db.identity.id.find(ctx.sender);
    if (existing === null) {
      ctx.db.identity.insert({
        id: ctx.sender,
        userId: target.id,
        provider: { tag: "Spacetime" },
        linkedAt: ctx.timestamp,
      });
    } else if (existing.userId !== target.id) {
      throw new SenderError(
        "This identity is already linked to a different user.",
      );
    }

    ctx.db.user.id.update({ ...target, isAdmin: true });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Reducers
// ──────────────────────────────────────────────────────────────────────────

// Start a fresh board for the caller, seeded with You + Forest + Market + Health.
export const newGame = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  const b = ctx.db.board.insert({
    id: 0n,
    name: "New Game",
    owner: me.id,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    userId: me.id,
    role: "player",
  });
  // Lay the opening table out with room to breathe — the verb cards are wide
  // (trays, sockets), so these are spaced for their real footprints: the three
  // machines along the top, the starting Health beneath You (its source), and
  // the broad Agency in the bottom-left.
  spawnCard(ctx, b.id, "you", 40, 40);
  spawnCard(ctx, b.id, "forest", 360, 40);
  spawnCard(ctx, b.id, "market", 660, 40);
  spawnCard(ctx, b.id, "agency", 40, 480);
  spawnCard(ctx, b.id, "health", 40, 300);
  spawnCard(ctx, b.id, "health", 150, 300);
  spawnCard(ctx, b.id, "health", 260, 300);
});

// Shared gate for slotting card `c` into verb `verb`'s hole `slotIndex`: the
// verb must exist, the hole must exist, accept the card, and be empty. Throws a
// SenderError on any failure. Source-location rules are the caller's to enforce
// (slotCard wants a tabletop card; collectAndSlot allows any source).
//
// Note we DON'T require the verb to be idle: you can top up an empty hole while
// the verb is mid-run, which is what makes the Market an inbox queue (drop more
// wood while it sells). Single-hole verbs are still effectively locked while
// running — their one hole is occupied, so the "hole already filled" check below
// rejects the drop anyway.
function assertSlottable(ctx: any, c: any, verb: any, slotIndex: number): void {
  if (c.boardId !== verb.boardId)
    throw new SenderError("cards are on different boards");
  const def = ctx.db.cardDef.defId.find(verb.defId);
  if (!def || !def.isVerb) throw new SenderError("target is not a verb");
  const s = ctx.db.situation.cardId.find(verb.id);
  if (!s) throw new SenderError("target is not a verb");

  const slot = [...ctx.db.slotDef.defId.filter(verb.defId)].find(
    (sl: any) => sl.slotIndex === slotIndex,
  );
  if (!slot) throw new SenderError("no such hole");
  const cdef = ctx.db.cardDef.defId.find(c.defId);
  const cat = cdef ? cdef.category : "";
  if (!slot.accepts.includes(c.defId) && !slot.accepts.includes(cat))
    throw new SenderError("that card is not accepted here");
  if (
    holeCards(ctx, verb.id).some(
      (h: any) => h.location.value.slotIndex === slotIndex,
    )
  )
    throw new SenderError("hole already filled");
}

// Drop a loose card into a verb's hole.
export const slotCard = spacetimedb.reducer(
  { cardId: t.u64(), verbCardId: t.u64(), slotIndex: t.u32() },
  (ctx, { cardId, verbCardId, slotIndex }) => {
    const c = ctx.db.card.id.find(cardId);
    const verb = ctx.db.card.id.find(verbCardId);
    if (!c || !verb) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);
    if (c.location.tag !== "tabletop")
      throw new SenderError("card is not loose on the table");

    assertSlottable(ctx, c, verb, slotIndex);

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });
    maybeAutostart(ctx, verbCardId);
  },
);

// Collect a produced (output) or slotted card and drop it straight into another
// verb's hole — atomically. This is the one-gesture equivalent of moveCard then
// slotCard, but in a single transaction, so the target verb can't slip out of
// `assembling` in the gap. Freeing an output slot may resume a stalled emitter,
// exactly as moveCard's collect path does.
export const collectAndSlot = spacetimedb.reducer(
  { cardId: t.u64(), verbCardId: t.u64(), slotIndex: t.u32() },
  (ctx, { cardId, verbCardId, slotIndex }) => {
    const c = ctx.db.card.id.find(cardId);
    const verb = ctx.db.card.id.find(verbCardId);
    if (!c || !verb) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);

    const old = c.location;
    // A card bound to a verb that's mid-run can't be pulled out.
    if (old.tag === "slotted") {
      const src = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (src && src.state !== "assembling")
        throw new SenderError("cannot take a card out of a running verb");
    }

    assertSlottable(ctx, c, verb, slotIndex);

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });

    // Vacating an output tray can un-stall the verb that produced this card.
    if (old.tag === "output") {
      const src = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (src && src.state === "stalled")
        tryBeginRun(ctx, old.value.verbCardId);
    }

    maybeAutostart(ctx, verbCardId);
  },
);

// Move a card to a tabletop position. Doubles as unslot (from an assembling
// verb) and collect (from an output tray, which can un-stall the verb).
export const moveCard = spacetimedb.reducer(
  { cardId: t.u64(), x: t.f32(), y: t.f32() },
  (ctx, { cardId, x, y }) => {
    const c = ctx.db.card.id.find(cardId);
    if (!c) throw new SenderError("card not found");
    requireMember(ctx, c.boardId);

    const old = c.location;
    if (old.tag === "slotted") {
      const s = ctx.db.situation.cardId.find(old.value.verbCardId);
      if (s && s.state !== "assembling") {
        throw new SenderError("cannot take a card out of a running verb");
      }
    }

    ctx.db.card.id.update({
      ...c,
      location: { tag: "tabletop", value: { x, y } },
    });

    if (old.tag === "output") {
      const v = old.value.verbCardId;
      const s = ctx.db.situation.cardId.find(v);
      if (s && s.state === "stalled") tryBeginRun(ctx, v);
    }

    // Planting: a card just placed on the table may now begin (a no-hole verb
    // like a Seed starts growing the moment it's on the tabletop). Inert cards
    // and verbs with unfilled holes are no-ops inside maybeAutostart.
    maybeAutostart(ctx, cardId);
  },
);

// Scheduled: a call has finished. Resolve it, then recycle or retire.
export const completeSituation = spacetimedb.reducer(
  { timer: situationTimer.rowType },
  (ctx, { timer }) => {
    ctx.db.situationTimer.scheduledId.delete(timer.scheduledId);

    const verbCardId = timer.verbCardId;
    const s = ctx.db.situation.cardId.find(verbCardId);
    if (!s || s.state !== "ongoing") return; // cancelled/changed → no-op
    const verb = ctx.db.card.id.find(verbCardId);
    if (!verb) {
      ctx.db.situation.cardId.delete(verbCardId);
      return;
    }

    const r = RESOLVERS[verb.defId];
    const holes = holeCards(ctx, verbCardId);
    const eff: Effects = r
      ? r.resolve(ctx, holes)
      : { consume: [], produce: [], again: null };

    for (const id of eff.consume) ctx.db.card.id.delete(id);

    // Transform-in-place: the verb metamorphoses into a new card where it stood
    // (a Seed → Forest), rather than producing into a tray it would orphan when
    // it retires. Supersedes produce/recycle — we're done after the swap.
    if (eff.become) {
      const pos =
        verb.location.tag === "tabletop" ? verb.location.value : { x: 0, y: 0 };
      ctx.db.situation.cardId.delete(verbCardId);
      ctx.db.card.id.delete(verbCardId);
      spawnCard(ctx, verb.boardId, eff.become, pos.x, pos.y);
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

    if (eff.again !== null && verbReady(ctx, verbCardId)) {
      tryBeginRun(ctx, verbCardId);
    } else {
      ctx.db.situation.cardId.update({
        ...s,
        state: "assembling",
        endsAt: undefined,
      });
    }
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Views: the ONLY way clients read game state. Each `my_*` view resolves the
// caller (principal → identity → user) and returns rows on boards that user is
// a member of (a spectator membership counts), so you can never see another
// player's game unless you've been invited onto their board. An unlinked caller
// resolves to nothing and sees empty results. (The catalogue — card_def /
// slot_def — is read directly; it's public.)
// ──────────────────────────────────────────────────────────────────────────

// "Me": who the client is signed in as, and their capabilities. Empty until the
// caller's principal is linked to a user. NOTE: primaryEmail IS projected here
// (the caller's own email, to themselves) — but NOT in any cross-user view.
const MeRow = t.object("MeRow", {
  userId: t.u64(),
  primaryEmail: t.string(),
  displayName: t.string(),
  pictureUrl: t.option(t.string()),
  isAdmin: t.bool(),
});

export const meView = spacetimedb.view(
  { name: "me_view", public: true },
  t.array(MeRow),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const { user: u } = caller;
    return [
      {
        userId: u.id,
        primaryEmail: u.primaryEmail,
        displayName: u.displayName,
        pictureUrl: u.pictureUrl,
        isAdmin: u.isAdmin,
      },
    ];
  },
);

export const myBoards = spacetimedb.view(
  { name: "my_boards", public: true },
  t.array(board.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const m of ctx.db.boardMember.userId.filter(caller.user.id)) {
      const b = ctx.db.board.id.find(m.boardId);
      if (b) out.push(b);
    }
    return out;
  },
);

export const myBoardMembers = spacetimedb.view(
  { name: "my_board_members", public: true },
  t.array(boardMember.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId))
        out.push(peer);
    }
    return out;
  },
);

// Co-members of your boards, as `user` rows — but with primaryEmail BLANKED.
// Email is the cross-provider join key; keep it off the wire (doc §9).
export const myPlayers = spacetimedb.view(
  { name: "my_players", public: true },
  t.array(user.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const seen = new Set<bigint>();
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId)) {
        if (seen.has(peer.userId)) continue;
        seen.add(peer.userId);
        const u = ctx.db.user.id.find(peer.userId);
        if (u) out.push({ ...u, primaryEmail: "" });
      }
    }
    return out;
  },
);

export const myCards = spacetimedb.view(
  { name: "my_cards", public: true },
  t.array(card.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const c of ctx.db.card.boardId.filter(mine.boardId)) out.push(c);
    }
    return out;
  },
);

export const mySituations = spacetimedb.view(
  { name: "my_situations", public: true },
  t.array(situation.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const s of ctx.db.situation.boardId.filter(mine.boardId))
        out.push(s);
    }
    return out;
  },
);
