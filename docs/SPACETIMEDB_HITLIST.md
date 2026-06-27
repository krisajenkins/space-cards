# SpacetimeDB hit-list — catch Convex, then leapfrog it

What SpacetimeDB (STDB) needs to be **obviously as good as Convex** (Section A), then **better**
than it (Section B). Convex is the bar: same "reactive sync + transactional TS logic colocated
with data" philosophy, but hosted/closed and built on a query-recompute sync model. STDB's bet —
a client-side **row-replica**, logic **inside** the DB, one-shot scheduled timers, open-source and
self-hostable — is the right shape for realtime/games. It's just *young*. Gripe IDs (`SQL3`, `AUTH1`,
`CLI1`, …) refer to `docs/SPACETIMEDB_GRIPES.md`.

---

## If I could only fix 3 things

1. **Query into sum-type variants + a typed query API** (`SQL3`, `SQL2(1)`, `SQL2(3)`). The single
   biggest "Convex just does this" gap. Today every meaningful filter is hand-rolled in TS
   because SQL can't see into a `Location` variant or do `WHERE x IN (…)`. This is table stakes.
2. **Stabilise RLS as the *one* per-row auth story** (`AUTH1` + `AUTH2`). Convex auth is plain code;
   STDB tells you to use RLS, then flags it experimental, so everyone hand-rolls
   `caller → identity → boards → rows` in every view. Ship it as the blessed path.
3. **Kill the CLI prod-footgun** (`CLI1`). `call`/`sql` defaulting to maincloud means a stray command
   mutates production. A confirm-on-prod prompt is a few hours of work and removes a class of
   disasters Convex users never even think about.

Everything else is in service of these three or builds the moat on top of them.

---

## A) Parity — be obviously as good as Convex

Ranked by how much daylight there is between STDB and Convex today.

### A1. Queryable sum types — read into variants from SQL — `SQL3`, `SQL2(3)`
**Why:** A `Location` is `tabletop | slotted | output`, but you can't write
`WHERE location.slotted.verbCardId = 10` — you read the whole row and branch in TS
(`engine/engine.ts` is full of `c.location.tag === …`). Convex's document model + typed queries
have no equivalent blind spot. This is the defining expressiveness gap.

### A2. `WHERE x IN (…)` and bare `COUNT(*)` — `SQL2(1)`, `SQL2(2)`
**Why:** Two of the first things anyone tries; both rejected today. `IN` is medium, `COUNT(*) AS n`
is an afternoon. Cheap, high-visibility credibility wins — nobody should hit these on day one.

### A3. A typed, code-level query API (close the SQL gap entirely)
**Why:** Convex's headline DX is that queries are *typed TS*, not stringly SQL. STDB already has
typed query builders client-side; extend that ergonomics into module code so reducers/views
compose filters in TS with end-to-end types instead of brittle SQL strings. This subsumes A1/A2
as a strategy: if the query API is rich and typed, the SQL parser's gaps stop hurting.

### A4. RLS as the blessed, stable per-row auth path — `AUTH1`, `AUTH2`
**Why:** The mechanism is sound (SQL filter at query time, `:sender` param, recursive) but flagged
experimental, so the *recommended* answer is the one you're told to avoid. Result: all 203 lines of
`platform/views.ts` re-derive membership by hand. Convex just runs auth in function code. Stabilise
grammar/validation/docs + optimizer push-down and make it the default story.

### A5. View-composition primitive — `AUTH3`, `SCHEMA1`
**Why:** Five views copy-paste the same 6-line "rows on boards I belong to" join, and the type
registry rejects a clean object-of-two-arrays return on a name clash (forcing the `_nodes`/`_edges`
split). A shared scope helper (`ctx.owned_items(table, col)`) + synthetic-name dedup for anonymous
nested types. Convex has no such boilerplate tax.

### A6. Auth/token ergonomics — typed errors, not stringly ones — `CONN3`
**Why:** A stale token surfaces as a `"Failed to verify token…"` *string* the client must
string-match, then nuke storage and reload. A `TokenVerificationError` class makes recovery
a typed branch. Convex's auth integration hides all of this.

### A7. CLI prod-safety + sharp-edge cleanup — `CLI1`, `CLI2`, `API1`
**Why:** Defaulting to maincloud (`CLI1`) is a genuine footgun; hyphenated DB
names silently misresolve (`CLI2`); deprecated `ctx.identity` accessors linger
(`API1`). None hard, all erode the "it just works" feel Convex sells.
Confirm-on-prod with `--yes` bypass is the priority.

### A8. Safe iteration + delete-while-iterating — `API2`
**Why:** Every cascade loop must spread-to-array before mutating or risk UB. At minimum a JSDoc
warning + example; ideally snapshot/copy-on-write iterators so it's safe by design. Convex's
document API never exposes this hazard.

### A9. First-class observability/dashboard
**Why:** Convex's dashboard (data browser, logs, function metrics, scheduled-job inspector) is a
big part of why it *feels* mature. STDB has `sql`/`logs`/`describe` but no cohesive operator UI.
Parity here is as much about perception as capability.

### A10. File storage as a built-in
**Why:** Convex ships file storage as a primitive. A card game doesn't need it, but "can I store a
user avatar?" is a table-stakes question STDB currently answers with "bring your own bucket."

---

## B) Leapfrog — be better than Convex

These lean into structural advantages Convex *cannot* easily copy because of its hosted/closed,
query-recompute architecture.

### B1. Make the client-side row-replica the headline — the superior realtime model
**Why:** Convex re-runs queries and ships results; STDB replicates *rows* and the client holds a
live local DB. For games and collab that's strictly better: local reads are instant, optimistic
mutation is natural, and you reason about *state*, not query subscriptions. This repo's rAF
countdown clock reading settled server positions is exactly the pattern. Market it, document the
patterns, and make optimistic updates + local prediction first-class. This is the moat.

### B2. Open-source + trivially self-hostable — no lock-in, no tiers
**Why:** Convex is hosted/closed; your logic and data live on their cloud at their price. STDB can
own "your game server is a single binary you can run anywhere, and the source is open." Make
self-host genuinely one-command, keep maincloud as convenience not captivity, and say so loudly.
Indie game studios and anyone allergic to lock-in choose this on principle.

### B3. Logic-in-the-DB with no function-tier billing
**Why:** Convex bills function execution; STDB runs reducers *inside* the DB transaction with no
network hop and no per-invocation tier. Lean into transparent energy/compute pricing and the
performance story (no DB↔function round-trip). "Your game loop is a DB transaction" is a pitch
Convex structurally can't make.

### B4. Multi-language WASM modules — not just TS
**Why:** Convex is TS/JS only. STDB modules already run Rust, C#, C++, TS via WASM. Game teams live
in C#/C++/Rust; being able to write authoritative server logic in *their* language, next to their
data, is a category Convex can't enter. Push the Rust/C# module DX to parity with TS.

### B5. A real general-purpose relational engine underneath
**Why:** Convex is a document store with a query layer. STDB is an actual relational DB. Once the
SQL/sum-type gaps (Section A) close, "reactive sync **and** a proper relational engine with indexes,
joins, and SQL" is a combination Convex doesn't offer. Don't ship a worse SQL than Convex's
no-SQL — ship a *better* query story than both.

### B6. One-shot + cron scheduling as a first-class, inspectable primitive
**Why:** STDB's per-situation one-shot timers (`situation_timer` → `completeSituation`) are exactly
right for event-driven games — zero running calls means zero scheduler work. Convex has scheduler +
cron; match the cron ergonomics, then beat it on inspectability (a dashboard view of pending timers)
and on the "zero-cost when idle" story.

### B7. Fix the lazy-getter / module-init ergonomics — `SCHEMA3`, `SCHEMA2`
**Why:** Content tables must be lazy-memoised getters because table-id syscalls aren't available at
module load (`content/recipes.ts:16`). It's WASM-bounded, not a pure bug, but it's friction Convex
users never meet. The in-flight `schema.schedule(table, reducer)` (`SCHEMA2`) shows the direction:
invest in module-init ergonomics so "logic in the DB" feels as smooth as "logic in a function."

---

## Sequencing

- **Now (credibility):** A2, A6, A7 — small, visible, stop day-one papercuts.
- **Next (close the gap):** A1/A3 (typed queries into sum types), A4/A5 (RLS + view composition).
  This is where STDB stops looking younger than Convex.
- **Then (pull ahead):** B1 + B2 messaging and DX (row-replica + open self-host) backed by B3/B4/B5.
  The structural wins only land once the parity gaps no longer scare people off.
