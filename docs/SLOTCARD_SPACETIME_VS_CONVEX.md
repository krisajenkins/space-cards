# `slotCard` + the one-shot run timer: SpacetimeDB vs Convex

A side-by-side of how this project's `slotCard` reducer and the per-situation
verb-completion timer would read in **SpacetimeDB** (the actual code here) versus
an **idiomatic Convex** translation.

## Takeaway

- **Structurally near-identical.** Both are transactional TS functions over a
  `ctx.db`; the body of `slotCard` — find rows, guard, `update` the location,
  re-check autostart — transcribes almost line-for-line.
- **The auth guard is the same shape** either way: resolve the caller, assert
  board membership in code. STDB does it in `assertMember`; Convex does it in the
  identical hand-written check. Neither gets it for free.
- **One real mechanism difference:** STDB schedules by *inserting a row* into a
  scheduled table (`situation_timer`) that auto-deletes when the reducer fires;
  Convex schedules the *function call itself* (`ctx.scheduler.runAfter`) — no
  timer table, no row to clean up.
- **One real model difference:** STDB replicates rows into a client-side cache the
  UI reads/animates locally; Convex re-runs reactive `query` functions and pushes
  results. For a freeform card tabletop the row-replica wins (see the close).

---

## 1. The `slotCard` mutation

```ts
// SpacetimeDB — actual (platform/reducers.ts)         │  // Convex — idiomatic (convex/cards.ts)
export const slotCard = spacetimedb.reducer(           │  export const slotCard = mutation({
  { cardId: t.u64(), verbCardId: t.u64(),              │    args: { cardId: v.id("card"),
    slotIndex: t.u32() },                              │            verbCardId: v.id("card"),
  (ctx, { cardId, verbCardId, slotIndex }) => {        │            slotIndex: v.number() },
    const c = ctx.db.card.id.find(cardId);             │    handler: async (ctx, { cardId, verbCardId, slotIndex }) => {
    const verb = ctx.db.card.id.find(verbCardId);      │      const c = await ctx.db.get(cardId);
    if (!c || !verb) throw new SenderError(…);          │      const verb = await ctx.db.get(verbCardId);
    requireMember(ctx, c.boardId);                     │      if (!c || !verb) throw new Error("card not found");
    if (c.location.tag !== "tabletop")                 │      await requireMember(ctx, c.boardId);   // same guard, in code
      throw new SenderError(…);                         │      if (c.location.tag !== "tabletop") throw new Error(…);
    assertSlottable(ctx, c, verb, slotIndex);          │      await assertSlottable(ctx, c, verb, slotIndex);
                                                        │
    ctx.db.card.id.update({ ...c,                      │      await ctx.db.patch(cardId, {
      location: { tag: "slotted",                      │        location: { tag: "slotted",
        value: { verbCardId, slotIndex } } });         │                   value: { verbCardId, slotIndex } } });
    maybeAutostart(ctx, verbCardId);                   │      await maybeAutostart(ctx, verbCardId);
    maybeAutostart(ctx, cardId);                       │      await maybeAutostart(ctx, cardId);
    if (wasInPile) relayout(ctx, c.boardId);           │      if (wasInPile) await relayout(ctx, c.boardId);
  },                                                    │    },
);                                                      │  });
```

Differences are surface: `t.u64()` → `v.id("card")` (Convex args are validators;
ids are typed table references), `.find`/`.update` → `await ctx.db.get`/`.patch`,
and everything is `async`. The control flow is the same.

## 2. Scheduling the verb-completion timer

This is the one genuine divergence. STDB arms a run by **inserting a timer row**;
Convex **schedules the call directly**.

```ts
// SpacetimeDB — actual (engine/engine.ts, tryBeginRun) │  // Convex — idiomatic
const endMicros =                                       │  const dur = resolverDuration(holes);     // ms
  ctx.timestamp.microsSinceUnixEpoch + dur;             │  await ctx.db.patch(verbCardId, {
ctx.db.situation.cardId.update({ ...s,                  │    state: "ongoing",
  state: { tag: "ongoing" },                            │    endsAt: Date.now() + dur });
  endsAt: new Timestamp(endMicros) });                  │
ctx.db.situationTimer.insert({                          │  // no timer table — schedule the fn itself:
  scheduledId: 0n,                                      │  const jobId = await ctx.scheduler.runAfter(
  scheduledAt: ScheduleAt.time(endMicros),              │    dur, internal.cards.completeSituation,
  verbCardId });                                        │    { verbCardId });
                                                        │  // (store jobId on the situation if you need
// schema.ts declares the scheduled table + target:    │  //  to ctx.scheduler.cancel(jobId) later)
//   table({ name: "situation_timer",                   │
//     scheduled: () => completeSituation }, {…})       │
```

Notes:
- STDB's scheduled **table is itself state** — you can `SELECT` pending timers,
  and `deleteBoardCascade` deletes them by `verbCardId` before tearing a board
  down. Convex has no such table; you'd keep the returned `jobId` if you want to
  cancel, or (as the completion handler does here) just no-op on a stale fire.
- The row is **auto-deleted** by STDB when `completeSituation` runs; Convex's
  scheduled job simply completes.
- STDB cancellation is implicit/cheap: completion checks `state === "ongoing"`
  and bails if the situation changed. The Convex port keeps that same guard, so
  you often don't need `scheduler.cancel` at all.

## 3. The completion handler

```ts
// SpacetimeDB — actual (platform/schema.ts)            │  // Convex — idiomatic (internalMutation)
export const completeSituation = spacetimedb.reducer(   │  export const completeSituation = internalMutation({
  { timer: situationTimer.rowType },                    │    args: { verbCardId: v.id("card") },
  (ctx, { timer }) => {                                 │    handler: async (ctx, { verbCardId }) => {
    if (!ctx.sender.equals(ctx.databaseIdentity))       │      // internalMutation is unreachable from clients —
      throw new SenderError("scheduler-only");          │      // no sender gate needed (see below).
    ctx.db.situationTimer.scheduledId                   │
       .delete(timer.scheduledId);                      │      // no timer row to delete.
    const s = ctx.db.situation.cardId.find(verbCardId); │      const verb = await ctx.db.get(verbCardId);
    if (!s || s.state.tag !== "ongoing") return;        │      if (!verb || verb.state !== "ongoing") return;
    // … resolve recipe, consume, produce, become …     │      // … resolve recipe, consume, produce, become …
    if (eff.again && verbReady(ctx, verbCardId))        │      if (eff.again && await verbReady(ctx, verbCardId))
      tryBeginRun(ctx, verbCardId);                     │        await tryBeginRun(ctx, verbCardId); // re-schedules
  },                                                    │    },
);                                                       │  });
```

**Where auth lives is the sharpest contrast.** A STDB scheduled reducer is
callable over the wire like any other, so a client could forge a `timer` row and
force-resolve any verb — hence the explicit `ctx.sender.equals(databaseIdentity)`
gate. Convex `internalMutation` is **not part of the public API surface**, so the
gate is structural: there's nothing to forge.

## 4. One read path: `my_cards`

```ts
// SpacetimeDB — actual (platform/views.ts)             │  // Convex — idiomatic (convex/cards.ts)
export const myCards = spacetimedb.view(                │  export const myCards = query({
  { name: "my_cards", public: true },                   │    args: {},
  t.array(card.rowType),                                │    handler: async (ctx) => {
  (ctx) => {                                            │      const caller = await lookupCaller(ctx);
    const caller = lookupCaller(ctx);                   │      if (!caller) return [];
    if (caller === null) return [];                     │      const memberships = await ctx.db
    const out = [];                                     │        .query("boardMember")
    for (const m of ctx.db.boardMember.userId           │        .withIndex("by_user",
        .filter(caller.user.id)) {                      │           q => q.eq("userId", caller.userId))
      for (const c of ctx.db.card.boardId               │        .collect();
          .filter(m.boardId))                           │      const out = [];
        out.push(c);                                    │      for (const m of memberships)
    }                                                   │        out.push(...await ctx.db.query("card")
    return out;                                         │          .withIndex("by_board",
  },                                                    │            q => q.eq("boardId", m.boardId)).collect());
);                                                       │      return out; // reactive: re-runs on any change
```

Same algorithm: resolve caller, fan out over memberships, gather cards. STDB
exposes it as a `view` clients subscribe to; Convex as a `query` clients call,
which **re-runs automatically** when any row it touched changes. In both, the
membership scoping is hand-written application code — neither enforces it at the
storage layer (STDB's RLS would, but it's flagged experimental; see close).

---

## Concept mapping

| SpacetimeDB                                  | Convex                                            |
| -------------------------------------------- | ------------------------------------------------- |
| `spacetimedb.reducer(args, fn)`              | `mutation({ args, handler })`                     |
| Scheduled reducer (internal-only intent)     | `internalMutation({ args, handler })`             |
| `ctx.db.card.id.find(id)`                    | `await ctx.db.get(id)`                            |
| `ctx.db.card.id.update({...c, …})`           | `await ctx.db.patch(id, {…})`                     |
| `ctx.db.card.insert({ id: 0n, … })`          | `await ctx.db.insert("card", {…})`                |
| `ctx.db.card.boardId.filter(b)`              | `ctx.db.query("card").withIndex("by_board", …)`   |
| Scheduled **table** + `ScheduleAt.time(t)`   | `ctx.scheduler.runAfter(ms, internal.x.fn, args)` |
| timer **row** auto-deleted on fire           | scheduled **call**; nothing to delete             |
| `ctx.sender` + `assertMember` (in code)      | `ctx.auth.getUserIdentity()` + membership (in code)|
| `databaseIdentity` gate on scheduled reducer | `internalMutation` (not in public API)            |
| `spacetimedb.view(...)` + client subscription | `query({...})` re-run reactively                  |
| Private table → `my_*` view for client reads | Private by default; expose via a `query`          |
| `t.u64()` / `0n` autoInc PK                  | `v.id("table")` system-generated id               |

## What this reveals

**Convex is modestly less code on the timer path** — no scheduled-table
declaration, no `scheduledId`/`verbCardId` row plumbing, no `databaseIdentity`
sender-gate, and no `deleteBoardCascade` pass to purge pending timers (a
cancelled job is just a stale fire the completion handler already no-ops). The
verb-completion lifecycle here arms itself by inserting a row that immediately
self-destructs; Convex collapses that to one `runAfter` call. The `internalMutation`
boundary also deletes a whole class of bug — the forge-a-timer-row attack the
STDB code has to defend against by hand simply isn't reachable.

Most of the **documented STDB gripes don't even apply to this slice**: the weak
SQL dialect (no `COUNT(*)` alias, no `WHERE … IN`, can't filter on a sum-type's
inner fields), the CLI footguns (`call`/`sql` defaulting to maincloud, hyphenated
DB names), and the type-registry name-clash rejections are all *tooling/query*
pain, not reducer-logic pain — and `slotCard` is pure reducer logic over indexed
`.find`/`.filter`, which both engines do cleanly. The one gripe that *does* bite
both equally is **per-row authorization**: membership scoping is hand-written
application code in either world (STDB's RLS is the intended fix but flagged
experimental; Convex has no row-level auth primitive at all).

But the place SpacetimeDB's model is **genuinely better-fit for a card tabletop**
is the client-side row replica. The UI here drags cards around a freeform surface,
runs a per-frame rAF countdown clock against each `situation.endsAt`, and animates
output trays — all reading a **local mirror** of the `card`/`situation` rows that
STDB keeps in sync. Convex's reactive *queries* re-run and push *results* on
change, which is great for derived/aggregated views but a worse fit for "I have a
live local copy of every card on my board and I'm interpolating positions and
timers against it 60×/second." For this game, the replicated cache isn't
incidental — it's the substrate the whole tabletop renders from.
