import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt, Timestamp } from "spacetimedb";

// ──────────────────────────────────────────────────────────────────────────
// Durations (microseconds)
// ──────────────────────────────────────────────────────────────────────────
const MINUTE = 60_000_000n;
const CHOP = 5_000_000n; // Forest chopping one Health
const MARKET = 3_000_000n; // Market selling one Wood

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
// Ownership. PRIVATE: clients never read these tables directly — they read the
// per-player `my_*` views below, scoped to board membership. See §2 of the doc.
// ──────────────────────────────────────────────────────────────────────────
const player = table(
  { name: "player" },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
  },
);

const board = table(
  { name: "board" },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    owner: t.identity(), // sole authority to transfer cards off this board
    createdAt: t.timestamp(),
  },
);

const boardMember = table(
  { name: "board_member" },
  {
    id: t.u64().primaryKey().autoInc(),
    boardId: t.u64().index("btree"),
    identity: t.identity().index("btree"),
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
  player,
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
type Effects = { consume: bigint[]; produce: string[]; again: bigint | null };

const RESOLVERS: Record<
  string,
  {
    duration: (holes: any[]) => bigint;
    resolve: (ctx: any, holes: any[]) => Effects;
  }
> = {
  // You: no inputs, emits one Health per minute (capped on the card_def).
  you: {
    duration: () => MINUTE,
    resolve: () => ({ consume: [], produce: ["health"], again: MINUTE }),
  },

  // Forest: dual-mode.
  //  - fed a Lumberjack: produce Wood every minute, keep the Lumberjack.
  //  - fed Health: chop once (consuming it), 10% chance of a Lumberjack too.
  forest: {
    duration: (holes) => (holes[0]?.defId === "lumberjack" ? MINUTE : CHOP),
    resolve: (ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      if (input.defId === "lumberjack") {
        return { consume: [], produce: ["wood"], again: MINUTE };
      }
      const produce = ["wood"];
      if (ctx.random() < 0.1) produce.push("lumberjack");
      return { consume: [input.id], produce, again: null };
    },
  },

  // Market: sell one Wood for one Coin.
  market: {
    duration: () => MARKET,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      return { consume: [input.id], produce: ["coin"], again: null };
    },
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

function requiredHolesFilled(ctx: any, verbCardId: bigint): boolean {
  const verb = ctx.db.card.id.find(verbCardId);
  if (!verb) return false;
  const required = [...ctx.db.slotDef.defId.filter(verb.defId)].filter(
    (s: any) => s.required,
  );
  const holes = holeCards(ctx, verbCardId);
  return required.every((s: any) =>
    holes.some((h: any) => h.location.value.slotIndex === s.slotIndex),
  );
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

function maybeAutostart(ctx: any, verbCardId: bigint): void {
  if (requiredHolesFilled(ctx, verbCardId)) tryBeginRun(ctx, verbCardId);
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
  ctx.db.card.insert({
    id: 0n,
    boardId,
    defId,
    location: { tag: "output", value: { verbCardId } },
  });
}

function assertMember(ctx: any, boardId: bigint): void {
  const ok = [...ctx.db.boardMember.boardId.filter(boardId)].some((m: any) =>
    m.identity.isEqual(ctx.sender),
  );
  if (!ok) throw new SenderError("not a member of this board");
}

function ensurePlayer(ctx: any): void {
  if (!ctx.db.player.identity.find(ctx.sender)) {
    ctx.db.player.insert({ identity: ctx.sender, name: "Player" });
  }
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

  verb("you", "You", "avatar", 5);
  verb("forest", "Forest", "station", 5);
  verb("market", "Market", "station", 10);

  ctx.db.slotDef.insert({
    id: 0n,
    defId: "forest",
    slotIndex: 0,
    accepts: ["health", "lumberjack"],
    required: true,
  });
  ctx.db.slotDef.insert({
    id: 0n,
    defId: "market",
    slotIndex: 0,
    accepts: ["wood"],
    required: true,
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  ensurePlayer(ctx);
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

// ──────────────────────────────────────────────────────────────────────────
// Reducers
// ──────────────────────────────────────────────────────────────────────────

// Start a fresh board for the caller, seeded with You + Forest + Market + Health.
export const newGame = spacetimedb.reducer((ctx) => {
  ensurePlayer(ctx);
  const b = ctx.db.board.insert({
    id: 0n,
    name: "New Game",
    owner: ctx.sender,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    identity: ctx.sender,
    role: "player",
  });
  spawnCard(ctx, b.id, "you", 0, 0);
  spawnCard(ctx, b.id, "forest", 200, 0);
  spawnCard(ctx, b.id, "market", 400, 0);
  spawnCard(ctx, b.id, "health", 0, 150);
  spawnCard(ctx, b.id, "health", 80, 150);
  spawnCard(ctx, b.id, "health", 160, 150);
});

// Drop a loose card into a verb's hole.
export const slotCard = spacetimedb.reducer(
  { cardId: t.u64(), verbCardId: t.u64(), slotIndex: t.u32() },
  (ctx, { cardId, verbCardId, slotIndex }) => {
    const c = ctx.db.card.id.find(cardId);
    const verb = ctx.db.card.id.find(verbCardId);
    if (!c || !verb) throw new SenderError("card not found");
    assertMember(ctx, c.boardId);
    if (c.boardId !== verb.boardId)
      throw new SenderError("cards are on different boards");
    if (c.location.tag !== "tabletop")
      throw new SenderError("card is not loose on the table");

    const def = ctx.db.cardDef.defId.find(verb.defId);
    if (!def || !def.isVerb) throw new SenderError("target is not a verb");
    const s = ctx.db.situation.cardId.find(verbCardId);
    if (!s || s.state !== "assembling") throw new SenderError("verb is busy");

    const slot = [...ctx.db.slotDef.defId.filter(verb.defId)].find(
      (sl: any) => sl.slotIndex === slotIndex,
    );
    if (!slot) throw new SenderError("no such hole");
    const cdef = ctx.db.cardDef.defId.find(c.defId);
    const cat = cdef ? cdef.category : "";
    if (!slot.accepts.includes(c.defId) && !slot.accepts.includes(cat)) {
      throw new SenderError("that card is not accepted here");
    }
    if (
      holeCards(ctx, verbCardId).some(
        (h: any) => h.location.value.slotIndex === slotIndex,
      )
    ) {
      throw new SenderError("hole already filled");
    }

    ctx.db.card.id.update({
      ...c,
      location: { tag: "slotted", value: { verbCardId, slotIndex } },
    });
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
    assertMember(ctx, c.boardId);

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
    for (const defId of eff.produce)
      spawnOutput(ctx, verb.boardId, defId, verbCardId);

    const def = ctx.db.cardDef.defId.find(verb.defId);
    const reusable = def ? def.reusable : false;
    if (!reusable) {
      ctx.db.situation.cardId.delete(verbCardId);
      ctx.db.card.id.delete(verbCardId);
      return;
    }

    if (eff.again !== null && requiredHolesFilled(ctx, verbCardId)) {
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
// Per-player views: the ONLY way clients read game state. Each is scoped to the
// boards the caller is a member of (a spectator membership counts), so you can
// never see another player's game unless you've been invited onto their board.
// (The catalogue — card_def / slot_def — is read directly; it's public.)
// ──────────────────────────────────────────────────────────────────────────
export const myBoards = spacetimedb.view(
  { name: "my_boards", public: true },
  t.array(board.rowType),
  (ctx) => {
    const out: any[] = [];
    for (const m of ctx.db.boardMember.identity.filter(ctx.sender)) {
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
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.identity.filter(ctx.sender)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId))
        out.push(peer);
    }
    return out;
  },
);

export const myPlayers = spacetimedb.view(
  { name: "my_players", public: true },
  t.array(player.rowType),
  (ctx) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.identity.filter(ctx.sender)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId)) {
        const hex = peer.identity.toHexString();
        if (seen.has(hex)) continue;
        seen.add(hex);
        const p = ctx.db.player.identity.find(peer.identity);
        if (p) out.push(p);
      }
    }
    return out;
  },
);

export const myCards = spacetimedb.view(
  { name: "my_cards", public: true },
  t.array(card.rowType),
  (ctx) => {
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.identity.filter(ctx.sender)) {
      for (const c of ctx.db.card.boardId.filter(mine.boardId)) out.push(c);
    }
    return out;
  },
);

export const mySituations = spacetimedb.view(
  { name: "my_situations", public: true },
  t.array(situation.rowType),
  (ctx) => {
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.identity.filter(ctx.sender)) {
      for (const s of ctx.db.situation.boardId.filter(mine.boardId))
        out.push(s);
    }
    return out;
  },
);
