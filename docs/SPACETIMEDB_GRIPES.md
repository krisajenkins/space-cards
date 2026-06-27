# SpacetimeDB gripes — triage list

Grievances surfaced by building **Escape the Moon** (TS module + Svelte client) on
SpacetimeDB ~2.5.0. Each is grounded in a concrete workaround in this repo.

Sizes below were **verified against the 2.6.0 source** (not just guessed). Issues that
were already fixed, resolved, or have an in-flight fix have been removed — see
"Already resolved" at the bottom for the record.

Severity = how much it hurt us. Size = verified fix cost in their codebase. The hour
figures are estimates from reading the code, not from attempting the change — trust the
size *bucket* more than the number.

IDs are grouped by theme: **SQL** (query engine), **AUTH** (authorization & views),
**CONN** (connection / client token), **SCHEMA** (type registry & module loading),
**CLI** (the `spacetime` CLI), **API** (the TS bindings runtime).

---

## Easy wins

### SQL2(2). `COUNT(*)` requires an alias — **(small; ~1-2h)**
`COUNT(*)` needs `COUNT(*) AS n`; the bare form is rejected.
- Cause: `Project::Count(SqlIdent)` makes the alias mandatory (`sql-parser/src/ast/mod.rs:83`).
- Fix: change to `Count(Option<SqlIdent>)`, derive a default name in the planner.
- Evidence: CLAUDE.md "spacetime CLI gotchas".

### AUTH3. View boilerplate has no composition primitive — **(small)**
The membership join is copy-pasted across five views with no way to share a
"rows on boards I belong to" scope.
- Cause: views are standalone functions; no combinators (`bindings-macro/src/view.rs`).
- Fix: DX-only — a helper like `ctx.owned_items(table, col)`. No architectural change.
- Evidence: `platform/views.ts` — same 6-line preamble in every view.

### CONN3. Token-rejection surfaces as a stringly error — **(small)**
A no-longer-recognised token comes back as a "Failed to verify" string the client has to
match on, then clear storage + reload to recover.
- Cause: `throw new Error("Failed to verify token…")` at `ws.ts:83`; no typed error.
- Fix: add a `TokenVerificationError` class; throw it instead.
- Evidence: `src/lib/Connection.svelte:37-48`; `src/lib/google.ts:206-220`.

### API1. Deprecated accessors still in circulation — **(small; partly underway)**
`ctx.identity` → `ctx.databaseIdentity`; old `ctx.sender` patterns.
- Cause: `ctx.identity` still exported (`bindings-typescript/src/lib/reducers.ts:108`);
  JSDoc examples still use the old names. Post-2.6.0 commit `b85f7786d` started the cleanup.
- Evidence: `platform/schema.ts:240-241`.

### API2. Deleting while iterating a live table is unsafe — **(small → large)**
Every cascade/delete loop spreads to an array before mutating.
- Small fix: JSDoc warning + spread-first example on `iter()`/`delete()`
  (`bindings-typescript/src/lib/table.ts:251,270`).
- Large fix: snapshot/copy-on-write iterators so deletes are safe by design.
- Evidence: `platform/reducers.ts:418`, `:424-438`.

---

## Medium

### SQL2(1). `WHERE x IN (…)` unsupported — **(medium; ~2-4h)**
- Cause: no `In`/`InList` variant in `SqlExpr` (`sql-parser/src/ast/mod.rs:107-120`);
  parser falls through to the catch-all error.
- Fix: add the variant + parse arm, lower to OR'd equalities through expr/physical-plan.
- Evidence: CLAUDE.md gotchas; pushed real filtering into TS views.

### SQL2(3). Can't filter on a sum-type's inner fields — **(medium; ~3-4h)**
`WHERE location.slotted.verbCardId = 10` errors.
- Cause: field access is hardwired to 2-level `table.column` across parser/expr/planner
  (`SqlExpr::Field` is `(SqlIdent, SqlIdent)`; `expr::FieldProject` has no variant path).
- Fix: thread a field-path through `SqlExpr::Field` → `expr::FieldProject` → physical plan.
- Note: this is the narrow first slice of SQL3 (below).
- Evidence: CLAUDE.md gotchas.

### SCHEMA1. Type registry rejects structurally-fine schemas on name clashes — **(medium)**
A view returning an object-of-two-arrays nests two named row types, which the registry
rejects as a duplicate-name clash — so `progression` was split into `_nodes`/`_edges`.
- Cause: all compound types require explicit names (`bindings-typescript/src/lib/schema.ts:346-350`).
- Fix: synthetic-name generation + dedup for anonymous nested types.
- Evidence: `platform/views.ts:175-182`.

### AUTH2. RLS is the intended answer but flagged experimental — **(medium)**
The recommended mechanism for per-row auth (AUTH1) is the one users are told to avoid.
- State: mechanism is solid (SQL filter at query time, `:sender` param, recursive);
  stabilisation is mostly grammar/validation/docs + optimizer push-down.
  (`schema/src/def.rs:1382`; `bindings/src/client_visibility_filter.rs`.)
- Note: AUTH1 + AUTH2 are really one project — see Serious.
- Evidence: DATA_MODEL §2.

### CLI1. `call`/`sql` silently default to maincloud (production) — **(medium)**
Forget `--server local` and you query/mutate production.
- Cause: `config.rs:174` defaults to maincloud; resolved in `sql.rs`/`call.rs`.
- Fix: confirm-on-prod prompt with a `--yes` bypass.
- Evidence: CLAUDE.md "spacetime CLI gotchas".

### CLI2. Hyphenated DB names silently don't resolve as the positional arg — **(small → medium; reproduce first)**
`spacetime sql -s local spacecards-drtest "…"` falls back to the default DB and folds the
name into the query, yielding a parser error.
- Cause: DB-name resolution is plain string-equality (`db_arg_resolution.rs:136,251`).
  A source read couldn't pin a hyphen-specific gap — **reproduce before estimating.**
- Fix: clearer "not in config" error + a regression test.
- Evidence: CLAUDE.md gotchas.

---

## Serious / strategic

### SQL3. Sum types are first-class in the schema but second-class in queries — **(large; ~15-25h)**
You can't query into a sum type's variants at all; you read the whole row and branch in TS.
- Scope: variant access needed in WHERE/SELECT/ORDER BY + type narrowing + index opts,
  across parser → expr → physical-plan → exec. SQL2(3) is the narrow first slice.
- Evidence: CLAUDE.md gotchas; every `c.location.tag === …` filter in `engine/engine.ts`.

### AUTH1. No first-class per-row / per-tenant authorization — **(strategic)**
The native access unit is binary "table public or not", so the entire read API is
hand-rolled: every view re-derives `caller → identity → user → boards → rows`.
- Cause: `StAccess::{Public,Private}` (`lib/src/db/auth.rs:7`); per-row auth touches
  schema, subscription filtering, and query dispatch.
- Note: **AUTH1 + AUTH2 are one project** — stabilising RLS is the real fix.
- Evidence: all of `platform/views.ts` (203 lines); the repeated membership joins.

### SCHEMA3. Lazy-getter gymnastics to keep content modules importable — **(large / by-design)**
Recipe tables must be lazy-memoised getters read only inside reducers.
- Constraint: bounded by the WASM model — table-id syscalls aren't available at module
  load, so eager init isn't a pure-bindings fix. Better treated as docs/ergonomics.
- Evidence: `content/recipes.ts:16`; `engine/verb-api.ts:21-27`.

---

## Already resolved (removed from triage)

Verified fixed, resolved, or in-flight in the 2.6.0+ tree:

- **SQL1** (prefix-scan panic) — **fixed in 2.7.0** (PR #5428): one-line range normalization
  in `bindings-typescript/src/server/runtime.ts`. Not yet in the 2.6.0 tree.
- **AUTH4** (scheduled reducers publicly callable) — **resolved in 2.6.0**: scheduled functions
  are forced `Private` at validation (`schema/src/def/validate/v10.rs:341,352`); the manual
  `sender == databaseIdentity` guard is no longer needed (docs commit `055ed14de`).
- **CONN1 / CONN2** (live token swap / singleton connection) — **resolved**: `ConnectionManager.rebuild()`
  exists (`connection_manager.ts:317-361`) and the Svelte binding uses ConnectionManager
  with refcounting + `reconnect(builder)`, not a module singleton. *Remaining gap:* React/
  Solid/Angular/Vue bindings don't yet expose `reconnect()`.
- **SCHEMA2** (scheduled-table → reducer init cycle) — **in-flight fix staged** (`5ff561260`):
  new `schema.schedule(table, reducer)` kills the `(): any` cast and restores type safety.
