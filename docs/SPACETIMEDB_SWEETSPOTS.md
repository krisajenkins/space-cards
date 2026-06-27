# Where SpacetimeDB Shines — A Sweet-Spots Brainstorm

A wide-ranging, deliberately inventive map of applications whose *shape* matches what STDB is
structurally good at. The lens throughout: STDB collapses three tiers (client cache, app server,
database) into two, by putting **transactional logic inside the DB as reducers** and giving each
client a **live replica of exactly the rows it subscribes to**. Everything below leans on that.

## The shape of a perfect STDB app

You're holding an STDB-shaped problem when **all** of these are true at once:

1. **The working set fits a live, subscribable cache** — the state a client cares about *right now*
   is bounded (a board, a room, a region, a fleet), not a 50 GB analytical scan.
2. **Many small mutations, many watchers** — lots of tiny authoritative edits fanning out to many
   subscribers in real time, rather than big batch writes or document blobs.
3. **The logic is the rule, and the rule must be trusted** — correctness/anti-cheat depends on the
   mutation running server-side, atomically, and being impossible to fake from the client.
4. **Time and presence are first-class** — things happen *on a schedule* or *because someone is
   here*, and idle should cost nothing (one-shot/repeating reducers, zero global tick).

When 3-4 of those hold, the bespoke "WebSocket + cache-invalidation + job-queue + app-server" glue
you'd otherwise hand-build is *exactly the thing STDB deletes*. That's the win — not "it's a DB".

---

## Real-time collaboration

The client cache *is* the shared document; reducers are the conflict-free edit ops.

- **Live whiteboard / diagram canvas** — each shape/stroke is a row; drag = a mutation fanned to all
  cursors. Leans on per-subscriber replica + server-authoritative ordering, no OT/CRDT server.
- **Collaborative spreadsheet with server-side formulas** — a cell edit is a reducer that recomputes
  dependents atomically inside the DB; no separate calc tier can race the write.
- **Shared kanban / sprint board** — card moves are tiny mutations; the live cache keeps every
  teammate's column in sync without polling or invalidation logic.
- **Pair-programming "shared REPL" / live notebook** — cell runs are scheduled reducers; output rows
  stream to every watcher. Energy-metering bounds runaway cells.
- **Tabletop / TTRPG VTT** — exactly the card-game shape: dice, tokens, fog-of-war as rows; the GM's
  hidden rows simply aren't in players' subscriptions (per-row scoping = built-in secrecy).

## Simulation & live worlds

Server-authoritative state + scheduled ticks + region subscriptions = a world engine without a
game-server tier.

- **MMO zone / shard server** — entities are rows; a player subscribes to their interest-region only.
  Movement validated in-reducer (anti-cheat); idle zones schedule no work.
- **Agar/io-style arena** — high churn of tiny position mutations to many clients; the canonical STDB
  fit, server decides who eats whom.
- **Ant-colony / Conway / cellular automaton "as a service"** — the tick is a repeating reducer;
  spectators subscribe to a viewport and watch evolution live, no client compute.
- **Persistent economy sandbox (a "Eve-lite")** — markets, factories, decay all advance on per-object
  timers; zero global tick means a million idle assets cost nothing.
- **Traffic / logistics sim** — vehicles as rows on scheduled moves; planners subscribe to a corridor
  and see authoritative state without replaying events client-side.

## Control planes & live ops

A control plane is "small authoritative state, many dashboards watching, mutations must be atomic" —
that's the STDB silhouette exactly.

- **Feature-flag / config service** — flags are rows; a flip is one atomic reducer that every client
  SDK sees instantly via its replica. No cache-busting, no stale-config window.
- **Deploy / rollout orchestrator** — each step is a reducer; the rollout state machine lives *in* the
  DB so it can't drift from what dashboards show. Timers drive canary promotion.
- **Incident "war room" board** — live status, ack/assign as mutations, on-call presence; everyone's
  view is the same replica with no refresh.
- **Job/queue scheduler** — scheduled reducers *are* the cron; enqueue is a row, idle queues burn
  nothing, and workers subscribe to claimable rows.
- **Game/app live-ops switchboard** — toggle events, push balance tweaks, ban a cheater — each an
  atomic server-authoritative mutation reflected in every live client instantly.

## AI / agentic systems

The interesting fit: a *shared blackboard* where agents and humans co-mutate one authoritative state,
with timers as the agent's heartbeat.

- **Multi-agent blackboard / shared workspace** — agents and users write to the same rows; reducers
  enforce invariants so no agent can corrupt shared state. Live replica = every agent sees the latest.
- **Agent scheduler / "tireless worker" loop** — a repeating reducer wakes an agent on a cadence;
  no agent → no cost. The reducer-as-procedure can call out for inference, then write results back.
- **Human-in-the-loop approval queue** — agent proposes a row, human approves via mutation, agent
  resumes — all as atomic state transitions watched live by both sides.
- **Live RAG "working memory"** — bounded, subscribable context (the current session's facts) kept hot
  in the client replica; not the vector store, but the *coordination + freshness* layer over it.
- **Tool-call ledger / observability for agent swarms** — each call a row, streamed live to a watching
  operator; per-agent scoping keeps swarms isolated.

## Presence, spatial & IoT

Presence is the canonical "many tiny mutations, many watchers, idle is free" workload.

- **Live cursors / "who's here" presence layer** — a drop-in row per connected user; connect/disconnect
  lifecycle reducers maintain it. This is almost the STDB "hello world".
- **Smart-building / sensor mesh dashboard** — each device updates its row; operators subscribe to a
  floor. Server-side reducers debounce/threshold; offline devices cost nothing.
- **Fleet / asset tracking** — vehicles push position mutations; a dispatcher subscribes to a geofence.
  Authoritative geofence logic runs in-reducer, not trusted from the device.
- **Home-automation rules engine** — "if motion after sunset → light on" is a scheduled/triggered
  reducer; the rule lives in the DB, runs deterministically, survives a UI restart.
- **Local-first / self-hosted family hub** — chores, shopping, thermostat as live rows on a Raspberry
  Pi; trivially self-hostable, open-source, no cloud dependency.

## Markets & coordination

Microstructure is many-small-mutations + must-be-atomic + everyone-watching-the-book — a bullseye.

- **Limit-order book for a game/virtual economy** — match is one atomic reducer (no partial-fill race);
  the book is a live replica every trader sees identically. (In-game scale, not Nasdaq scale.)
- **Live auction house** — bids are mutations, the close is a scheduled reducer; anti-snipe extension is
  just rescheduling the timer. Server-authoritative = no bid can be forged.
- **Prediction market / live poll / parimutuel pool** — odds recompute in-reducer on each stake; the
  pool state fans out live to all participants.
- **Seat / inventory reservation** — "hold this seat" is an atomic claim that can't double-book; holds
  expire via one-shot timers. Booking systems' classic race, solved by transactional reducers.
- **Multiplayer betting / fantasy-league scoring** — score recompute on event ingest as a reducer;
  leaderboards are live views, not nightly batch jobs. (See
  [Live sports](#live-sports--results-betting--second-screen) for the live-event-fan-out angle.)

## Live sports — results, betting & second screen

A match event happens *once*, and must hit every screen identically, instantly, in the right order —
and money and fairness ride on the exact moment a market opens or shuts. "One authoritative event,
fanned to everyone, with atomic market state" is the STDB silhouette in a referee's shirt.

- **In-play betting exchange** — odds recompute in-reducer on each event; the *suspend-on-goal* is one
  atomic flag flip, so no bet can land in the window between the ball crossing the line and the market
  reacting. That race is the whole hard problem of live betting, and reducers delete it — the same
  atomic-claim trick as the live-auction close in [Markets & coordination](#markets--coordination).
- **Live scoreboard / play-by-play feed** — each goal/point/wicket is a reducer-written row in every
  viewer's replica the instant it happens — no polling, no CDN cache-lag staggering who sees it first.
- **Bet-slip settlement engine** — settlement is a reducer triggered by the final-whistle event row;
  payout is atomic with the result and shares the transaction with its audit log, so the ledger can
  never disagree with the outcome that produced it (same single-transaction trick as the audit-log
  pattern in [Dev tooling & internal apps](#dev-tooling--internal-apps)).
- **Officiating / VAR "under review" state** — the review status is one authoritative row that broadcast
  overlays, the stadium screen, and the phone app all read identically; the decision flips atomically,
  killing the "TV says goal, app says no-goal" desync.
- **Tournament bracket + fixtures engine** — a result reducer advances the bracket atomically; scheduled
  reducers fire at kickoff times; the bracket is a live replica every viewer and feed shares.
- **Live timing (racing / marathon / F1)** — each split is a tiny per-athlete mutation; a spectator
  subscribes to just their runner or car, and the leaderboard recomputes server-side, not per client.
- **Second-screen watch-party** — synced reactions, polls and "who's watching" presence around a live
  game; presence + many-tiny-mutations + many-watchers is the canonical STDB workload (see
  [Presence, spatial & IoT](#presence-spatial--iot)).

## Dev tooling & internal apps

Small teams, shared mutable state, want it live and want it self-hosted with near-zero ops.

- **Live build/CI dashboard** — pipeline steps as rows updated by reducers; the wallboard just
  subscribes. Idle repos schedule nothing.
- **Feature-toggle admin + audit log in one** — the toggle table and its append-only audit are mutated
  in the same transaction, so the log can never disagree with reality.
- **Realtime analytics counters** — increments are tiny mutations; dashboards subscribe to the live
  aggregate rows. (Counters/gauges — *not* ad-hoc analytical SQL; see anti-sweet-spots.)
- **Internal "presence-aware" admin tool** — see which teammate is viewing/editing a record right now,
  with row-level locks enforced by reducers.
- **Synced CLI/devtool state** — share a session, a debugging breakpoint set, or a query history live
  across a team's terminals via the client replica.

---

## Anti-sweet-spots (don't reach for it here)

- **Analytical / OLAP workloads** — big scans, joins, window functions, ad-hoc BI. The SQL surface is
  weak today and the model is built for live working sets, not column-store crunching.
- **Large blobs / document stores / media** — video, big files, fat JSON documents. The client replica
  wants to hold rows, not gigabytes; use object storage and keep only references in STDB.
- **Unbounded working sets that can't be subscribed** — if a useful client must see millions of rows at
  once, the live-cache premise breaks. Bound it (region/room/tenant) or look elsewhere.
- **Write-once, read-rarely / archival** — append-and-forget log lakes gain nothing from live fan-out
  and pay for keeping state hot.
- **Heavy third-party-call orchestration as the core** — long external I/O fights determinism; it's
  doable via procedures but if your app is *mostly* glue between external APIs, STDB isn't the prize.
- **Maturity-sensitive bets** — young tooling/ecosystem; if you need battle-tested ops, rich SQL, and a
  deep hiring pool *today*, weigh that honestly.

---

## The litmus test

Ask: **"Is the state small enough to live in every client's cache, edited by many tiny trusted
mutations, watched live by many?"** If yes — and especially if you'd otherwise be hand-building a
WebSocket-plus-cache-invalidation-plus-job-queue layer over a plain DB — it's STDB-shaped. If you're
reaching for big scans, big blobs, or an unbounded working set, it isn't.
