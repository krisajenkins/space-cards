# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Space Cards

A card-game engine built on SpacetimeDB. The game is a tabletop of cards: inert
cards (resources) and **verb cards** (functions whose typed "holes" are filled by
dragging other cards in; when the required holes are filled the verb runs for a
duration and produces new cards). The authoritative *engine* design — the
metaphor, the data-model rationale, and every decision locked so far — lives in
`docs/DATA_MODEL.md`. **Read it before changing the schema or game logic.**

The engine now runs a real game, **Escape the Moon** (crash-land, gather, refine,
fabricate, automate with drones, build a rocket, escape). Its card list, recipes
and progression are in `docs/ESCAPE_THE_MOON.md` — **read it before changing
cards, resolvers, or `newGame`.**

## Managing the TODO list

Open work lives in `TODO.md`; completed work lives in `TODO_Archived.md`. When you
close a TODO item, **move its entire entry out of `TODO.md` and into
`TODO_Archived.md`**, prefixing the moved entry with an italic stamp of the form
`*Archived: YYYY-MM-DD (change <jj-change-id>)*` — the date you closed it and the
jj change ID that did the work (`jj log -r @ --no-graph -T 'change_id.short()'`).
Don't just tick the checkbox in place.

Stack: SpacetimeDB TypeScript module (server) + Svelte 5 + Vite (client).
Package manager is **pnpm**; system deps come from Nix (`direnv reload` / `use
flake` activates the dev shell with `nodejs`, `pnpm`, `spacetimedb`, etc.).

## Layout

- `spacetimedb/src/` — the server module (its own pnpm package). `index.ts` is
  the aggregator SpacetimeDB bundles from (it re-exports the schema + every
  reducer/view/hook). The rest is grouped into **three concern-groups by what the
  thing _is_**, so code lives where you'd guess to look for it. These are
  concern-groups, **not** a clean dependency stack: `platform/schema.ts` (the
  schema object + its row types in `platform/types.ts`) is the shared **hub** that
  the others spoke off — row types derive from it (`Infer<typeof …rowType>`),
  reducers and views attach to it, and `content/` + `engine/` both depend on it.
  So `platform/{schema,types}` is the foundation everything sits on, even though it
  lives in the "surface" folder; the groups below organise concerns, they don't
  layer dependencies top-to-bottom.
  - **`content/`** — "what the game IS" (authoring + data). `catalogue.ts`
    (`seedCatalogue` — the `card_def` / `slot_def` / `achievement_def` authoring:
    **this is where the cards are defined**), `recipes.ts` (the recipe DATA tables
    — `BUILDS`, `SUBSYSTEMS`, `RESEARCH_TREE`, `WRECK_CONTENTS`: the Wreck's
    contents, the build costs, the research tree, the subsystem recipes; plus
    `VERB_OUTPUTS` / `VERB_BECOMES`, the verb produces/becomes relations restated
    as data for the admin graph to read), `opening.ts` (the turn-zero deal —
    board name, tier-0 stations, starting Effort — that `newGame` interprets),
    `achievements.ts` (both halves of each milestone — the display text
    `ACHIEVEMENT_DEFS` **and** the earning conditions `ACHIEVEMENTS` + the
    `awardAchievements` funnel), `durations.ts` (the per-verb run lengths — the
    timing-balance sibling of `recipes.ts`, read by `engine/resolvers.ts`).
  - **`engine/`** — "how it RUNS" (mechanism). `engine.ts` (the generic verb
    engine — assembly, runs, output caps, spawning, the `tally`), `resolvers.ts`
    (the `RESOLVERS` map: per-verb behaviour, the bay-drone feeder, and the
    research/wreck/assembler logic that READS `content/recipes.ts`), `layout.ts`
    (the authoritative tabletop layout — VPSC overlap removal via the `webcola`
    dep; see `docs/LAYOUT.md`).
  - **`platform/`** — the SpacetimeDB surface + shared infra. `schema.ts` (tables,
    the schema object, + the scheduled `completeSituation`, colocated with its
    `situation_timer` table), `reducers.ts` (player actions: `newGame`, `slotCard`,
    `collectAndSlot`, `moveCard`, and admin `devGrant` / `relayoutBoard`),
    `views.ts` (the `my_*` read views), `graph.ts` (the admin progression-graph
    projection), `lifecycle.ts` (`init`/`reseedCatalogue` wiring, connect/disconnect,
    first-admin bootstrap), `auth.ts`, `constants.ts` (platform-level constants
    only — a dependency-free leaf the Svelte client can also import; today that's
    just the public Google-auth contract. Game-balance numbers like durations are
    content and live under `content/`, not here), `types.ts`.

  Reducer names are snake_cased on the wire (`new_game`, `slot_card`, …). The
  client imports the public auth constants from `spacetimedb/src/platform/constants.ts`.
- `src/` — Svelte client. `main.ts` (imports global `app.css`) → `Root.svelte`
  (sets up `SpacetimeDBProvider`) → `App.svelte`. `App.svelte` shows a sign-in
  hero when signed out, and otherwise drops the player straight into their one
  board (`my_boards[0]`) — v1 deliberately does **not** list boards even though
  the schema allows many. The tabletop UI lives in `src/lib/`: `Board.svelte`
  (freeform pointer-drag surface; turns drops into `slot_card` / `move_card`,
  runs the rAF countdown clock — it does **no** layout itself, just renders the
  server-settled positions), `VerbStation.svelte` (a verb card — sockets,
  countdown ring, output tray), `CardToken.svelte` (a resource card), and
  `catalogue.ts` (per-card colours + SVG glyphs, `Location`-tag + time helpers).
  Aesthetic: a dark "celestial workbench" (Fraunces / Hanken Grotesk / Space
  Mono, brass + astral-cyan).
- `src/module_bindings/` — generated client bindings. **Do not edit by hand**;
  regenerate after any schema/reducer change.
- `docs/DATA_MODEL.md` — engine design doc and source of truth for intent.
- `docs/ESCAPE_THE_MOON.md` — the game design: cards, recipes, the two gates
  (Power / Blueprints), automation-as-reward, and the six-act progression.

## Commands

```bash
pnpm dev                       # Vite dev server (client) at localhost:5173
pnpm build                     # vite build
pnpm spacetime:generate        # regenerate src/module_bindings from the module
pnpm spacetime:publish:local   # publish module to the local server
pnpm spacetime:publish         # publish module to maincloud (default server)
```

Default DB name is `spacecards`, default server is `maincloud` (see
`spacetime.json` / `.env.local`). The client reads `VITE_SPACETIMEDB_HOST` and
`VITE_SPACETIMEDB_DB_NAME`.

Note: the `pnpm generate` script in `package.json` invokes `cargo run -p
gen-bindings`, but there is no Rust crate in this repo — use
`pnpm spacetime:generate` (the `spacetime` CLI) instead.

Local iteration loop: `spacetime start` (server) → `pnpm spacetime:publish:local`
→ `pnpm spacetime:generate` → `pnpm dev`. `spacetime dev` automates rebuild +
publish + bindings if you prefer it.

### `spacetime` CLI gotchas (driving a local DB by hand)

Verifying behaviour by `call`/`sql` against a local DB has sharp edges — these
cost real time, so:

- **`call` / `sql` default to the `maincloud` server.** Always pass `--server
  local` (or `-s local`) for local work, or you'll silently query/mutate
  production. Symptom of forgetting: the result URL points at
  `maincloud.spacetimedb.com`.
- **Hyphenated DB names don't resolve as the positional `[DATABASE]` arg.**
  `spacetime sql -s local spacecards-drtest "SELECT …"` does NOT target
  `spacecards-drtest`; the CLI falls back to the configured default DB
  (`spacecards`) and folds the name into the query — you get
  `sql parser error: Expected an SQL statement, found: spacecards`. Use a
  hyphen-free name (e.g. publish your throwaway to local `spacecards` itself with
  `--delete-data -y`), or it won't work even though `spacetime list` shows the
  name.
- **SQL dialect is restricted.** `COUNT(*)` needs an alias (`COUNT(*) AS n`);
  `WHERE x IN (…)` is unsupported; and you can't filter on a sum-type's inner
  fields — `WHERE location.slotted.verbCardId = 10` errors. To inspect a card's
  place, `SELECT id, location FROM card WHERE defId = '…'` and read the rendered
  `(slotted = (verb_card_id = …))` value yourself.
- **Setup for an admin-gated scenario:** `bootstrap_first_admin '"you@x.com"'`
  (one-shot; links the CLI identity + flips `isAdmin`) → `new_game` → then
  `dev_grant <boardId> '"defId"' <x> <y>` to drop cards, `slot_card`,
  `collect_and_slot`, `move_card` to drive them. Reducers return nothing — read
  state back via `sql` (e.g. `situation` / `situation_timer` for run state).

There is no test suite. Type-check the client with `svelte-check`.

## Architecture notes specific to this codebase

- **Game tables are private; clients read only through the five `my_*` views**
  (`my_boards`, `my_board_members`, `my_players`, `my_cards`, `my_situations`),
  each scoped to the caller's board membership. Only the catalogue (`card_def`,
  `slot_def`) is `public`. When you add a table that clients need to see, add a
  membership-scoped view — do not just mark the table public. See §2 of the doc.
- **A card's place is a `Location` sum type** (`tabletop` / `slotted` / `output`),
  not separate nullable columns. There is no quantity anywhere — every card is a
  discrete row; "3 wood" is three cards / three holes.
- **Tabletop layout is authoritative on the server, not the client.** `relayout`
  (`engine/layout.ts`) runs VPSC overlap removal inside the reducer that changed the
  board (`moveCard` pins the dropped card; `newGame` / `become` / `devGrant` /
  `relayoutBoard` too), so positions are settled once, atomically, and every
  client just renders them. It is one-shot per mutation — never a timer/loop (an
  earlier client-side watchdog that round-tripped through the async DB was
  unstable and ran cards off-screen). A card's packing footprint is its **maximum**
  rendered size (output tray full, drone bay reserved), computed from
  `outputCap` + slot count, so the layout stays put as cards grow. **If you add a
  card UI section that changes a card's size, update `footprint()` or it will
  overlap.** See `docs/LAYOUT.md`.
- **Verb behaviour is code, not data.** The generic engine (assembly, recycling,
  output-cap stalls) is shared; per-verb resolution lives in the `RESOLVERS` map
  keyed by `defId`. A resolver decides duration, what to consume, and whether to
  re-fire (`again`) at runtime from what's in the holes — durations are not static
  columns. To add a verb: author its `card_def` (+ `slot_def`s) in
  `content/catalogue.ts`, then add a `RESOLVERS` entry in `engine/resolvers.ts`
  (recipe data, if any, goes in `content/recipes.ts`).
- **Calls run on per-situation one-shot timers** (`situation_timer`, a scheduled
  table → `completeSituation`), not a global tick. Zero running calls → zero
  scheduler work. A re-firing verb inserts a fresh timer each cycle.
- **No failure state.** Every call "succeeds"; a disappointing output is an
  outcome, not an error. Don't add a `failed` situation state.
- Authorisation is always `ctx.sender` via `assertMember`; board-level ownership
  (`board.owner`) gates cross-board transfers. Never trust identity from args.

The reference below is generic SpacetimeDB documentation.

---

# SpacetimeDB Core Concepts

SpacetimeDB is a relational database that is also a server. It lets you upload application logic directly into the database via WebAssembly modules, eliminating the traditional web/game server layer entirely.

---

## Critical Rules

1. **Reducers are transactional.** They do not return data to callers. Use subscriptions to read data.
2. **Reducers must be deterministic.** No filesystem, network, timers, or random. All state must come from tables.
3. **Read data via tables/subscriptions**, not reducer return values. Clients get data through subscribed queries.
4. **Auto-increment IDs are not sequential.** Gaps are normal, do not use for ordering. Use timestamps or explicit sequence columns.
5. **`ctx.sender` is the authenticated principal.** Never trust identity passed as arguments.

---

## Feature Implementation Checklist

1. **Backend:** Define table(s) to store the data
2. **Backend:** Define reducer(s) to mutate the data
3. **Client:** Subscribe to the table(s)
4. **Client:** Call the reducer(s) from UI
5. **Client:** Render the data from the table(s)

---

## Debugging Checklist

1. Is SpacetimeDB server running? (`spacetime start`)
2. Is the module published? (`spacetime publish`)
3. Are client bindings generated? (`spacetime generate`)
4. Check server logs for errors (`spacetime logs <db-name>`)
5. Is the reducer actually being called from the client?

---

## Tables

- **Private tables** (default): Only accessible by reducers and the database owner.
- **Public tables**: Exposed for client read access through subscriptions. Writes still require reducers.

Organize data by access pattern, not by entity:

```
Player          PlayerState         PlayerStats
id         <--  player_id           player_id
name            position_x          total_kills
                position_y          total_deaths
                velocity_x          play_time
```

## Reducers

Reducers are transactional functions that modify database state. They run atomically, cannot interact with the outside world, and do not return data to callers. See the language-specific server skills for syntax.

## Event Tables

Event tables broadcast reducer-specific data to clients. Rows are never stored in the client cache (`count()` returns 0, `iter()` yields nothing); only `onInsert` callbacks fire.

## Subscriptions

Subscriptions replicate database rows to clients in real-time.

1. **Subscribe**: Register SQL queries describing needed data
2. **Receive initial data**: All matching rows are sent immediately
3. **Receive updates**: Real-time updates when subscribed rows change
4. **React to changes**: Use callbacks (`onInsert`, `onDelete`, `onUpdate`)

Best practices:

- Group subscriptions by lifetime
- Subscribe before unsubscribing when updating subscriptions
- Avoid overlapping queries
- Use indexes for efficient queries

## Modules

Modules are WebAssembly bundles containing application logic that runs inside the database.

- **Tables**: Define the data schema
- **Reducers**: Define callable functions that modify state
- **Event Tables**: Broadcast reducer-specific data to clients
- **Views**: Read-only functions that expose computed subsets of data to clients
- **Procedures**: (Unstable) Functions that can have side effects (HTTP requests, `ctx.withTx`)

Server-side modules can be written in: Rust, C#, TypeScript, C++

Lifecycle: Write → Compile → Publish (`spacetime publish`) → Hot-swap (republish without disconnecting clients)

## Identity

- **Identity**: A long-lived, globally unique identifier for a user.
- **ConnectionId**: Identifies a specific client connection.
- Always use `ctx.sender` / `ctx.Sender` / `ctx.sender()` for authorization.

SpacetimeDB works with many OIDC providers, including SpacetimeAuth (built-in), Auth0, Clerk, Keycloak, Google, and GitHub.

# SpacetimeDB CLI

Use this skill when the user needs help with the `spacetime` CLI tool - initializing projects, building modules, publishing databases, querying data, managing servers, or troubleshooting CLI issues.

## Quick Reference

### Project Initialization & Development

```bash
# Initialize new project
spacetime init my-project --lang rust|csharp|typescript|cpp
spacetime init my-project --template <template-id>

# Build module
spacetime build                    # release build
spacetime build --debug            # faster iteration, slower runtime

# Dev mode (auto-rebuild, auto-publish, generates bindings)
spacetime dev
spacetime dev --client-lang typescript --module-bindings-path ./client/src/module_bindings

# Generate client bindings
spacetime generate --lang typescript|csharp|rust|unrealcpp --out-dir ./bindings --module-path ./server
```

### Publishing & Deployment

```bash
# Publish to Maincloud (default)
spacetime publish my-database --yes

# Publish to local server
spacetime publish my-database --server local --yes

# Clear database and republish
spacetime publish my-database --delete-data always --yes
```

### Database Interaction

```bash
# SQL queries
spacetime sql my-database "SELECT * FROM users"
spacetime sql my-database --interactive   # REPL mode

# Call reducers (each argument is a separate positional arg)
spacetime call my-database my_reducer '"value"' '123'

# Subscribe to changes
spacetime subscribe my-database "SELECT * FROM users" --num-updates 10

# View logs
spacetime logs my-database -f              # follow logs
spacetime logs my-database -n 100          # up to 100 log lines

# Describe schema
spacetime describe my-database --json
spacetime describe my-database table users --json
spacetime describe my-database reducer my_reducer --json
```

### Database Management

```bash
# List databases
spacetime list

# Delete database
spacetime delete my-database

# Rename database
spacetime rename <database-identity> --to new-name
```

### Server Management

```bash
# List configured servers
spacetime server list

# Add server
spacetime server add local --url http://localhost:3000 --default
spacetime server add myserver --url https://my-spacetime.example.com

# Set default server
spacetime server set-default local

# Test connectivity
spacetime server ping local

# Start local instance
spacetime start

# Clear local data
spacetime server clear
```

### Authentication

```bash
# Login (opens browser)
spacetime login

# Login with token
spacetime login --token <token>

# Show login status
spacetime login show

# Logout
spacetime logout
```

## Default Servers

| Name        | URL                                 | Description                |
| ----------- | ----------------------------------- | -------------------------- |
| `maincloud` | `https://maincloud.spacetimedb.com` | Production cloud (default) |
| `local`     | `http://127.0.0.1:3000`             | Local development server   |

## Common Flags

| Flag            | Short | Description                                |
| --------------- | ----- | ------------------------------------------ |
| `--server`      | `-s`  | Target server (nickname, hostname, or URL) |
| `--yes`         | `-y`  | Non-interactive mode (skip confirmations)  |
| `--anonymous`   |       | Use anonymous identity                     |
| `--module-path` | `-p`  | Path to module project                     |

## Troubleshooting

### "Not logged in"

```bash
spacetime login
# Or use --anonymous for public operations
```

### "Server not responding"

```bash
spacetime server ping <server>
# For local: ensure spacetime start is running
```

### "Schema conflict"

```bash
# Clear data and republish
spacetime publish my-db --delete-data always --yes
```

### "Build failed"

```bash
# Check Rust/C# toolchain
rustup show
# For Rust modules, ensure wasm32-unknown-unknown target
rustup target add wasm32-unknown-unknown
```

## Module Languages

**Server-side (modules):** Rust, C#, TypeScript, C++
**Client SDKs:** TypeScript, C#, Rust, Unreal Engine
**CLI `generate` targets:** TypeScript, C#, Rust, Unreal C++

# SpacetimeDB TypeScript SDK Reference

## Imports

```typescript
import { schema, table, t } from "spacetimedb/server";
import { SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb"; // for scheduled tables only
```

## Tables

`table(OPTIONS, COLUMNS)` takes two arguments. The `name` field MUST be snake_case:

```typescript
const entity = table(
  { name: "entity", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    active: t.bool(),
  },
);
```

Options: `name` (snake_case, recommended), `public: true`, `event: true`, `scheduled: (): any => reducerRef`, `indexes: [...]`

`ctx.db` accessors are the camelCase form of the table's `name` field.

## Column Types

| Builder               | JS type      | Notes             |
| --------------------- | ------------ | ----------------- |
| `t.u64()`             | bigint       | Use `0n` literals |
| `t.i64()`             | bigint       | Use `0n` literals |
| `t.u32()` / `t.i32()` | number       |                   |
| `t.f64()` / `t.f32()` | number       |                   |
| `t.bool()`            | boolean      |                   |
| `t.string()`          | string       |                   |
| `t.identity()`        | Identity     |                   |
| `t.connectionId()`    | ConnectionId |                   |
| `t.timestamp()`       | Timestamp    |                   |
| `t.timeDuration()`    | TimeDuration |                   |
| `t.scheduleAt()`      | ScheduleAt   |                   |

Modifiers: `.primaryKey()`, `.autoInc()`, `.unique()`, `.index('btree')`

Optional columns: `nickname: t.option(t.string())`

## Indexes

Prefer inline `.index('btree')` for single-column. Use named indexes only for multi-column:

```typescript
// Inline (preferred for single-column):
authorId: t.u64().index('btree'),
// Access: ctx.db.post.authorId.filter(authorId);

// Multi-column (named):
indexes: [{ accessor: 'by_group_user', algorithm: 'btree', columns: ['groupId', 'userId'] }]
// Access: ctx.db.membership.by_group_user.filter([groupId, userId]);
```

When you frequently look up rows by multiple columns, prefer a multi-column index over filtering by one column and looping over the results. Multi-column filter takes an array matching the index column order. You can omit trailing columns to do a prefix scan.

## Schema Export

```typescript
const spacetimedb = schema({ entity, record }); // ONE object, not spread args
export default spacetimedb;
```

## Reducers

Export name becomes the reducer name:

```typescript
export const createEntity = spacetimedb.reducer(
  { name: t.string(), age: t.i32() },
  (ctx, { name, age }) => {
    ctx.db.entity.insert({ identity: ctx.sender, name, age, active: true });
  }
);

// No arguments, just the callback:
export const doReset = spacetimedb.reducer((ctx) => { ... });
```

## DB Operations

```typescript
ctx.db.entity.insert({ id: 0n, name: "Sample" }); // Insert (0n for autoInc)
ctx.db.entity.id.find(entityId); // Find by PK → row | null
ctx.db.entity.identity.find(ctx.sender); // Find by unique column
[...ctx.db.item.authorId.filter(authorId)]; // Filter → spread to Array
[...ctx.db.entity.iter()]; // All rows → Array
ctx.db.entity.id.update({ ...existing, name: newName }); // Update (spread + override)
ctx.db.entity.id.delete(entityId); // Delete by PK
```

Note: `iter()` and `filter()` return iterators. Spread to Array for `.sort()`, `.filter()`, `.map()`.

## Lifecycle Hooks

MUST be `export const`. Bare calls are silently ignored:

```typescript
export const init = spacetimedb.init((ctx) => { ... });
export const onConnect = spacetimedb.clientConnected((ctx) => { ... });
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => { ... });
```

## Reducer Context API

`ReducerContext` is the single source of sender identity, deterministic time, and deterministic randomness inside a reducer. Always go through `ctx` for these. Standard library clocks and random sources are not available in modules.

```typescript
// Auth: ctx.sender is the caller's Identity
if (!row.owner.equals(ctx.sender)) throw new SenderError("unauthorized");

// Server timestamp (deterministic per reducer call)
ctx.db.item.insert({ id: 0n, createdAt: ctx.timestamp });

// Deterministic RNG
const f: number = ctx.random(); // [0.0, 1.0)
const roll: number = ctx.random.integerInRange(1, 6); // inclusive
const bytes: Uint8Array = ctx.random.fill(new Uint8Array(16));

// Client: Timestamp → Date
new Date(Number(row.createdAt.microsSinceUnixEpoch / 1000n));
```

## Scheduled Tables

```typescript
const tickTimer = table(
  {
    name: "tick_timer",
    scheduled: (): any => tick, // (): any => breaks circular dep
  },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

export const tick = spacetimedb.reducer(
  { timer: tickTimer.rowType },
  (ctx, { timer }) => {
    /* timer row auto-deleted after this runs */
  },
);

// One-time: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + delayMicros)
// Repeating: ScheduleAt.interval(60_000_000n)
```

## Custom Types

```typescript
// Product type (struct):
const Position = t.object("Position", { x: t.i32(), y: t.i32() });
const entity = table(
  { name: "entity" },
  {
    id: t.u64().primaryKey().autoInc(),
    pos: Position,
  },
);

// Sum type (tagged union):
const Shape = t.enum("Shape", {
  circle: t.i32(),
  rectangle: t.object("Rect", { w: t.i32(), h: t.i32() }),
});
// Values: { tag: 'circle', value: 10 }
```

## Views

```typescript
// Anonymous view (same for all clients):
export const activeUsers = spacetimedb.anonymousView(
  { name: "active_users", public: true },
  t.array(entity.rowType),
  (ctx) => [...ctx.db.entity.iter()].filter((e) => e.active),
);

// Per-user view (varies by ctx.sender):
export const myProfile = spacetimedb.view(
  { name: "my_profile", public: true },
  t.option(entity.rowType),
  (ctx) => ctx.db.entity.identity.find(ctx.sender) ?? undefined,
);
```

## Complete Example

```typescript
import { schema, table, t } from "spacetimedb/server";

const entity = table(
  { name: "entity", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    active: t.bool(),
  },
);

const record = table(
  {
    name: "record",
    public: true,
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    value: t.u32(),
  },
);

const spacetimedb = schema({ entity, record });
export default spacetimedb;

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.entity.identity.find(ctx.sender);
  if (existing) ctx.db.entity.identity.update({ ...existing, active: true });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const existing = ctx.db.entity.identity.find(ctx.sender);
  if (existing) ctx.db.entity.identity.update({ ...existing, active: false });
});

export const createEntity = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (ctx.db.entity.identity.find(ctx.sender))
      throw new Error("already exists");
    ctx.db.entity.insert({ identity: ctx.sender, name, active: true });
  },
);

export const addRecord = spacetimedb.reducer(
  { value: t.u32() },
  (ctx, { value }) => {
    if (!ctx.db.entity.identity.find(ctx.sender)) throw new Error("not found");
    ctx.db.record.insert({ id: 0n, owner: ctx.sender, value });
  },
);
```

# SpacetimeDB TypeScript Client

## React: main.tsx

```typescript
import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings';
import { MODULE_NAME, SPACETIMEDB_URI } from './config';
import App from './App';

function Root() {
  const connectionBuilder = useMemo(() =>
    DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(MODULE_NAME)
      .withToken(localStorage.getItem('auth_token') || undefined),
    []
  );
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
```

## React: App.tsx

```typescript
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { DbConnection, tables } from "./module_bindings";

function App() {
  const {
    isActive,
    identity: myIdentity,
    token,
    getConnection,
  } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;

  // Save auth token
  useEffect(() => {
    if (token) localStorage.setItem("auth_token", token);
  }, [token]);

  // Subscribe when connected. Prefer typed query builders over raw SQL
  useEffect(() => {
    if (!conn || !isActive) return;
    conn
      .subscriptionBuilder()
      .onApplied(() => setSubscribed(true))
      .subscribe([tables.entity, tables.record]);
    // Or with filters: tables.entity.where(r => r.active.eq(true))
    // Or raw SQL:      'SELECT * FROM entity'
  }, [conn, isActive]);

  // Reactive data. Returns [rows, isReady]
  const [entities, entitiesReady] = useTable(tables.entity);
  const [records, recordsReady] = useTable(tables.record);

  // useTable with row callbacks
  const [onlineUsers] = useTable(
    tables.entity.where((r) => r.active.eq(true)),
    {
      onInsert: (user) => console.log("User connected:", user.name),
      onDelete: (user) => console.log("User disconnected:", user.name),
      onUpdate: (oldUser, newUser) => console.log("Updated:", newUser.name),
    },
  );

  // Call reducers with object syntax
  conn?.reducers.addRecord({ data });

  // Compare identities
  const isMe = row.owner.toHexString() === myIdentity?.toHexString();
}
```

## Vanilla (non-React)

```typescript
import { DbConnection, tables } from "./module_bindings";

const conn = DbConnection.builder()
  .withUri("wss://maincloud.spacetimedb.com")
  .withDatabaseName("my_module")
  .onConnect((ctx) => {
    ctx
      .subscriptionBuilder()
      .onApplied(() => console.log("Ready"))
      .subscribe([tables.user, tables.message]);
  })
  .build();

// Row callbacks
conn.db.user.onInsert((ctx, user) => console.log("Joined:", user.name));
conn.db.user.onDelete((ctx, user) => console.log("Left:", user.name));
conn.db.user.onUpdate((ctx, oldUser, newUser) =>
  console.log("Updated:", newUser.name),
);
```
