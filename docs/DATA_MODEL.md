# Space Cards — Core Data Model

A design document for the card-game engine. This describes the **data model and
its rationale**, not the implementation. Schema fragments are illustrative
(SpacetimeDB TypeScript DSL) and exist to pin down shapes, not to be copied
verbatim.

Status: **draft / under discussion.** A first vertical slice is implemented in
`spacetimedb/src/index.ts` (see §10).

---

## 1. The core metaphor

The game is a tabletop of cards. Some cards are inert (resources, tokens,
ingredients). Others are **verbs**: cards that open up a set of typed **holes**
(argument slots). The player fills holes by dragging other cards into them.

> A verb is a function. Its holes are typed parameters. The cards you drop in
> are the arguments. When every required hole is filled the function fires,
> runs for some duration, and later yields a result — a new card — as its
> return value.

Arguments arrive **asynchronously** (the player supplies them over time, in any
order), the call **executes over time** (a duration, not instantaneously), and
the **return value appears in the future** as one or more new cards.

Crucially, **verbs are themselves cards**. "Work", "Factory", and "Opportunity"
are all cards on the table; a card's _definition_ simply marks it as inert or as
a verb. That's why you can have several "Work" cards, or several "Factory" cards,
each running its own independent call.

### Design decisions locked so far

| Question                              | Decision                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| How do holes decide what they accept? | **Nominal** — by card category / definition id, not structural aspects (for now).                                                       |
| Where does a verb's behaviour live?   | **Code** — a resolver (reducer) per verb definition.                                                                                    |
| Async model?                          | **Yes** — calls have durations and complete via a scheduled timer.                                                                      |
| When does a call fire?                | **Autostart** — the instant the last required hole is filled (so no-arg verbs fire immediately).                                        |
| Multiplicity ("needs 3 wood")?        | **Multiple holes**, one card each, not a quantity count.                                                                                |
| Are verbs cards?                      | **Yes** — a card definition is either inert or a verb.                                                                                  |
| Verb reuse?                           | **Per-verb**: `reusable` (Work, Factory) vs one-shot, consumed on completion (Opportunity).                                             |
| Duration / consumption / re-fire?     | **Resolver decides** at runtime from the slotted cards — not static columns (the Forest is dual-mode).                                  |
| Self-running verbs?                   | **Yes** — a no-arg verb autostarts immediately and its resolver re-fires it on a timer (You, Factory).                                  |
| Failure?                              | **No failure state.** Every call "succeeds"; some outcomes are just disappointing.                                                      |
| Card ownership?                       | **None at card level.** Boards have an owner; only the owner may hand cards to other boards.                                            |
| Output cap?                           | **Yes** — each verb has a bounded output tray; a full tray back-pressures (the verb stalls).                                            |
| Default visibility?                   | **Game/player tables private**, exposed only through per-player `my_*` **views** scoped by board membership. **Card catalogue public.** |

---

## 2. Visibility

Two different rules, because two different kinds of data:

- **The catalogue is public.** `card_def` and `slot_def` describe _what cards
  exist and what their holes accept_. There's no point hiding it — if a game
  gets popular enough to matter, a community wiki lists every card anyway, and
  hiding hole requirements (à la _Book of Hours_) buries the fun behind a wall
  of mystery. Empty holes openly show what they want.

- **Game and player data is private by default.** You must **not** see another
  player's boards, cards, or in-flight calls unless you've been **invited** —
  i.e. unless you are a member of that board. The underlying tables are **not
  client-readable at all**; clients read only through **per-player views** that
  filter by board membership.

> SpacetimeDB vocabulary note: a client can read a table only if it's marked
> `public`. We mark **none** of the game tables public. Instead each is exposed
> through a `view` (`my_cards`, `my_situations`, …) whose body returns only the
> rows on boards the caller (`ctx.sender`) belongs to. Views are reactive — they
> update like tables — so the client still gets live data, just pre-filtered.
> "private by default" = "the raw table is invisible; a view is the only door".

We chose **views** over row-level security (RLS): RLS is flagged experimental by
SpacetimeDB ("use views instead"), and views also match the original intent of
leaning on a controlled read surface. RLS-on-public-tables remains a possible
future swap if we want plain reactive table subscriptions with less boilerplate.

The database **owner** (us) can always read everything; the view gate applies to
players, not operators.

### Visibility matrix

| Table             | Client exposure | How                                                                               |
| ----------------- | --------------- | --------------------------------------------------------------------------------- |
| `card_def`        | **public**      | Read directly (the catalogue)                                                     |
| `slot_def`        | **public**      | Read directly (the catalogue)                                                     |
| `user`            | private         | via `me_view` (yourself, with email) and `my_players` (co-members, email blanked) |
| `identity`        | private         | never exposed — principal→user mapping (see §11)                                  |
| `board`           | private         | via `my_boards` (boards you belong to)                                            |
| `board_member`    | private         | via `my_board_members` (members of your boards)                                   |
| `card`            | private         | via `my_cards` (cards on your boards)                                             |
| `situation`       | private         | via `my_situations` (calls on your boards)                                        |
| `situation_timer` | **none**        | Server-only scheduling table                                                      |

Each `my_*` view collects the caller's `board_member` rows, then returns the rows
on those boards — so a spectator membership grants read access too, and you see
nothing on a board you haven't been invited to.

> How a `board_member` row gets created — invitations — is **deliberately out of
> scope for now** (a question for another day). The views just assume membership
> is the gate.

---

## 3. Entities

Three groups: **definitions** (authored content, public), **ownership** (who
plays where), and **instances** (live game state, private).

### 3.1 Definitions — the catalogue

A card definition is either inert or a verb. The verb-ness is an **optional
sub-record**, so a def with no `verb` is just a resource/token.

```typescript
// Verb-only properties. Absent → the card is inert.
VerbSpec {
  reusable:  bool          // survive completion (Work, Factory) vs one-shot (Opportunity)?
  outputCap: u32           // max cards the output tray holds; a full tray stalls
                           // the verb (back-pressure, Oddsparks-style)
}
// Duration, which inputs are consumed, and whether/when to re-fire are NOT
// static — the verb's resolver returns them per run, from what's in the holes.
// (The Forest is dual-mode: Health → chop once & consume; Lumberjack → emit
// Wood every minute & keep the Lumberjack.) See §6.

// A kind of card — the "class" behind every card instance.
card_def {
  defId:    string  (pk)   // 'oak_wood', 'work', 'factory'
  name:     string         // 'Oak Wood'
  category: string         // 'wood' — coarse nominal type used by holes
  art:      string
  verb:     VerbSpec?      // none → inert card; present → it's a verb
}

// A hole on a verb: one typed argument slot. Belongs to a verb's definition.
slot_def {
  id:        u64 (pk, autoinc)
  defId:     string        // -> card_def (must be a verb)
  slotIndex: u32           // position of this hole on the verb
  accepts:   string[]      // category names and/or defIds this hole allows
  required:  bool          // must be filled for the verb to fire?
  consumes:  bool          // is the card eaten when the call completes?
}
```

- **Multiplicity is multiple `slot_def` rows.** "Needs 3 wood" = three holes,
  each `accepts: ['wood']`. There is no quantity anywhere.
- **`retrigger` other than `Manual` is only valid for verbs with no required
  holes** — you can't auto-refire a verb that needs the player to supply fresh
  arguments. (Validated when authoring content.)

### 3.2 Ownership — players & boards

A board is a play surface ("the table"). A **`user`** is a human (see §11); a
human relates to boards **many-to-many**, so single-player, shared, and
spectated boards all come from one model.

```
user ──< identity                       (a human ←→ their auth principals; §11)
  └──< board_member >── board ──< card
                            └──< situation
```

```typescript
// The human. NOT the connection principal — see §11. Domain tables key on
// `user.id`, never on the principal, so multi-provider login is possible.
user          {
  id:           u64 (pk, autoinc)
  primaryEmail: string (unique)   // lower-cased; cross-provider join key
  displayName:  string
  pictureUrl:   string?
  isAdmin:      bool
  createdAt:    Timestamp
}

board         {
  id:        u64 (pk, autoinc)
  name:      string
  owner:     u64        // -> user.id; the one human who may hand cards off
  createdAt: Timestamp
}

board_member  {
  id:       u64 (pk, autoinc)
  boardId:  u64        // -> board
  userId:   u64        // -> user.id
  role:     string     // 'player' | 'spectator'  (the owner is named on `board`)
}
```

Ownership is **board-level**: `board.owner` is the sole authority for transferring
cards off the board. `role` governs **actions**, not visibility — a `spectator`
sees everything on a board they belong to but can't slot or move cards; a
`player` can use and rearrange cards but can't transfer them away.

### 3.3 Instances — live game state

```typescript
card {
  id:       u64 (pk, autoinc)
  boardId:  u64               // which board this card sits on (and belongs to)
  defId:    string            // -> card_def
  location: Location          // where on/within the board (see §4)
}

// Runtime state of an ACTIVE verb-card. 1:1 with a verb-card instance,
// keyed by that card's id. Inert cards have no situation row.
situation {
  cardId:  u64 (pk)           // the verb-card instance this call belongs to
  boardId: u64                // denormalised for RLS / subscription scoping
  state:   string             // 'assembling' | 'ongoing' | 'complete'
  endsAt:  Timestamp?         // set when it goes 'ongoing'
}
```

Every card is a **discrete entity** — no merging, no counts. Visually piling
identical cards into a tidy stack is a **client layout concern** computed from
these rows; it is not in the data model.

A verb-card carries its identity in `card`; its mutable run-state lives in the
satellite `situation` (keyed by the same id). This follows "organise by access
pattern" — only active verbs carry the extra state, and it changes far more often
than the card row.

---

## 4. Location — where a card is

A card is always in exactly one place, and the places are mutually exclusive, so
`Location` is a **sum type**:

```typescript
Location =
  | Tabletop { x: f32, y: f32 }               // free on the board
  | Slotted  { verbCardId: u64, slotIndex }   // dropped into a verb's hole
  | Output   { verbCardId: u64 }              // produced, awaiting collection
```

- **Tabletop** — loose on the surface, draggable, usable as an argument. A verb
  card sitting idle on the table is here too (its holes are described by its
  `slot_def`s; its run-state by its `situation`).
- **Slotted** — bound as an argument to a specific hole of a specific verb card.
  The sum type makes "loose _and_ slotted" unrepresentable.
- **Output** — a result produced _by_ `verbCardId`, sitting in that verb's
  output tray. It can't be used as an input until the player drags it back to the
  Tabletop. (Collecting outputs is also what drives the `OnCollect` retrigger —
  see §5.)

---

## 5. Lifecycle of a call

```
   spawn verb card ──► situation created (assembling)
            │
            │  slotCard fills holes        ┌──────── retrigger ────────┐
            ▼                              │                           │
   ┌──────────────────┐  all required      │   Manual:  back to        │
   │   assembling      │  holes filled      │            assembling     │
   └────────┬──────────┘ ─────────────►    │   OnComplete: re-fire now  │
            │ (set endsAt, insert timer)    │   OnCollect:  re-fire when │
   ┌────────▼──────────┐                    │            output taken   │
   │     ongoing       │ ◄── timer counts (server) / animates (client)  │
   └────────┬──────────┘                    │                           │
            │ situation_timer fires          │                           │
   ┌────────▼──────────┐                    │                           │
   │    complete       │ ── consume inputs; create outputs in Output ───┘
   └───────────────────┘     reusable? recycle per retrigger : delete the verb card
```

1. **Assembling.** A verb card gets a `situation` (state `assembling`) when it
   enters play. `slotCard` validates a dropped card's `category`/`defId` against
   the hole's `accepts`, then checks completeness.
2. **Autostart.** The instant all `required` holes are filled, `slotCard` flips
   the situation to `ongoing`, sets `endsAt`, and inserts a one-shot
   `situation_timer` row. A **no-arg verb** (no required holes) is complete
   immediately on spawn, so it autostarts at once — this is the Factory case.
3. **Ongoing.** The server idles until the timer fires; the client animates the
   countdown locally from `endsAt`.
4. **Complete.** The timer calls `completeSituation`, which dispatches to the
   verb's resolver (§6): deletes cards on holes marked `consumes`, creates result
   cards in `Output`, marks `complete`.
5. **Recycle or retire.** If the verb is **not** `reusable` (Opportunity), the
   verb card and its situation are deleted. If it **is** reusable, the resolver's
   return decides what happens next:
   - **`again = null`** → back to `assembling`; consumed inputs must be
     re-supplied (Work/Market need a fresh input each run).
   - **`again = <duration>`** → re-fire after that delay (You emits Health every
     minute; a Lumberjack-fed Forest emits Wood every minute).

   Either way a run is gated by the **output cap**: a verb won't begin a run
   while its tray is full, so an uncollected emitter **stalls** instead of
   spilling output everywhere (cf. Oddsparks). Collecting a card from the tray
   frees space and resumes a stalled verb.

### Worked example — Work, Coin, Opportunity

- **Work**: verb, `reusable`, `retrigger: Manual`. One hole: `accepts ['health'],
required, consumes`. Resolver: delete the Health, create a Coin; with 5% chance
  (`ctx.random`) also create an **Opportunity** card on the tabletop.
- **Opportunity**: verb, **not** reusable, `retrigger: Manual`. One hole:
  `accepts ['health'], required, consumes`. Resolver: consume Health, produce
  "something interesting". Because it isn't reusable, the Opportunity card
  vanishes after this single use.

---

## 6. Verb behaviour — code, not data

Each verb definition's behaviour is **a resolver**, dispatched by `defId`. The
generic engine handles assembly and recycling; per-verb code handles resolution.

- **Generic, shared reducers**: `createBoard`, `joinBoard`, `spawnCard`,
  `moveCard`, `slotCard`, `unslotCard`, `transferCard`. `slotCard` owns the
  autostart check; `moveCard` out of `Output` resumes a stalled emitter.
- **Per-verb resolution**, dispatched when a timer fires:

```typescript
completeSituation(timer) {
  s = situation.cardId.find(timer.verbCardId)
  if (!s || s.state !== 'ongoing') return        // cancelled/changed → no-op
  verb = card.id.find(s.cardId)
  switch (verb.defId) {
    case 'work':        resolveWork(s);        break
    case 'factory':     resolveFactory(s);     break
    case 'opportunity': resolveOpportunity(s); break
    // each resolver: read slotted cards, delete consumed inputs,
    // insert result cards into Output. May use ctx.random / ctx.timestamp.
  }
  recycleOrRetire(verb, s)                        // §5 step 5
}
```

**Transform-in-place (`become`).** A resolver may return `become: <defId>`
instead of producing into a tray: the verb card is deleted and a fresh card of
`become`'s def is spawned **on the tabletop where the verb stood**. This is how a
card _metamorphoses_ rather than _manufactures_ — a planted Seed becoming a
Forest. `become` supersedes `produce`/recycle (the verb is gone), so it's the
natural shape for a one-shot grower, and it composes into chains (egg → creature,
sapling → tree). It also sidesteps the orphaned-tray problem a one-shot verb hits
if it produces into a tray and then deletes itself.

**Grows only on the tabletop.** A verb begins a run only while it is _idle and on
the tabletop_ (the autostart gate). For verbs with holes this is invisible — they
already live on the table. But it gives a **no-hole** verb a second life as a
**maturing card**: produced into a tray it sits dormant and inert-looking;
collected onto the table ("planted") it autostarts. The Seed rides exactly this —
a verb with no holes, produced by the Forest, that does nothing until you place it
and then grows (`FOREST_GROWTH`) into a Forest. Placement-triggers-growth needs no
new state: `moveCard` onto the tabletop runs the same autostart check as slotting.

**No failure state.** Every call completes "successfully". The variation is in
the _outputs_: a resolver may produce something great, produce nothing (inputs
consumed for no benefit), or hand back the very cards you put in. "Disappointing"
is an outcome, not an error — there is no `failed` state and no error card unless
a resolver chooses to emit one.

**Tradeoff acknowledged:** nominal matching + per-verb code is more _authored_
and less _emergent_ than aspect-based structural matching with data-driven
recipes. It's far easier to reason about and debug, and it's the right starting
point. Aspects could later be added as an _additional_ predicate on
`slot_def.accepts` without discarding this model.

---

## 7. Scheduling — per-situation timer, not a global tick

**Decision: one one-shot scheduled row per _running_ call.**

```typescript
situation_timer {              // private; scheduled table
  scheduledId: u64 (pk, autoinc)
  scheduledAt: ScheduleAt      // = the situation's endsAt
  verbCardId:  u64             // which call completes
}
```

Rationale:

- A **per-call one-shot** is event-driven. The scheduler only wakes for the
  earliest due row. **Zero running calls → zero work.** Cost scales with _active
  calls_, not players or cards.
- A **global repeating tick** would fire forever at a fixed cadence even when
  nothing is due — 1,000 idle boards still cost a transaction every tick. That's
  the option that burns idle CPU.
- "A timer per card" doesn't apply: timers attach to **calls**, not cards. Idle
  resources need none, so scheduled-row count = calls currently executing
  server-wide — naturally small.

Note that self-running Factories don't change this: each re-fire inserts a fresh
one-shot timer for its next completion. A Factory emitting every 5 minutes is one
scheduled row that gets replaced each cycle — still zero idle cost when the
player isn't around (well, the Factory _is_ the activity; if nothing is running,
nothing is scheduled).

**Future — continuous decay.** If cards ever wither continuously (Dread →
Affliction, fleeting cards expiring), prefer a **self-cancelling tick** that
re-arms only while at least one decaying card exists. Not needed until decay is
real.

---

## 8. Multiplayer & concurrency

- **Serialized transactions.** Reducers run as atomic, serialized transactions,
  so two players grabbing the same card on a shared board can't race — one wins;
  the other sees updated state. No locking code needed.
- **Views are the per-player read surface.** Each client subscribes to the
  `my_*` views, which return only the rows on boards it belongs to.
- **Spectators** (a `board_member` with `role: 'spectator'`) see everything on
  the board but cannot act; action reducers check `role`.
- **Card transfer between boards** is a reducer that reassigns `card.boardId` and
  resets `location` to `Tabletop`. Only the **owner of the source board**
  (`board.owner`) may hand a card off; any member can use and rearrange cards on
  a board they belong to.
- **Authorisation** always uses `ctx.sender`; identity is never trusted from
  reducer arguments.

---

## 9. Open questions

1. **Invitations** — how does a `board_member` row come to exist? (Explicitly
   deferred — "a question for another day".) Authentication itself is now built
   (§11); what remains is the invite flow that adds a _second_ `user` to a board.
2. **Resolver authoring ergonomics** — a `RESOLVERS` map keyed by `defId` is fine
   early; at scale, do we want it backed by a registration table?
3. **View cost at scale** — the `my_*` views recompute over the caller's boards;
   fine now, but worth watching if a board accumulates thousands of cards.

---

## 10. Implemented slice (You / Forest / Market)

A first end-to-end slice is built in `spacetimedb/src/index.ts` and verified on a
local server.

- **Cards:** `health`, `wood`, `coin`, `lumberjack` (inert); `you`, `forest`,
  `market`, `agency`, `seed` (verbs).
- **You** — no holes; emits 1 Health/min, `outputCap` 5. Autostarts on spawn.
- **Forest** — one hole accepting `health` or `lumberjack`. Health → chop,
  consumed, yields Wood + 10 % Lumberjack. Lumberjack → not consumed, every cycle
  yields Wood, or **5 % a Seed** instead.
- **Market** — one hole accepting `wood`; yields a Coin.
- **Agency** — ten required `coin` holes; yields a guaranteed Lumberjack.
- **Seed** — a one-shot, **no-hole** verb, `outputCap` 0. Dormant in the Forest's
  tray; **planted** on the tabletop it grows for `FOREST_GROWTH` and **`become`s**
  a Forest in place. Exercises the "grows only on the tabletop" gate and the
  transform-in-place effect (§6). A Seed left in the tray counts against the
  Forest's `outputCap`, so an unplanted Seed back-pressures the Forest to a stall —
  emergent, no extra code.
- **`newGame`** seeds a board with You, Forest, Market, Agency and 3 Health.

Reducers: `newGame`, `slotCard`, `moveCard` (reposition / unslot / collect), and
the scheduled `completeSituation`. Verb behaviour lives in a `RESOLVERS` map
keyed by `defId` (the §6 "switch", as a table). Read surface: the five `my_*`
views plus `me_view` (§11); game tables are private, catalogue public,
`situation_timer` server-only. All action reducers are gated behind a linked
identity (§11) — `newGame` resolves the caller to a `user` and owns the board by
`user.id`.

**Verified live:** autostart, timer→resolve→produce, input consumption,
probabilistic output (the 10 % Lumberjack), recycle-to-assembling, the continuous
self-rescheduling You emitter, collection via `moveCard`, the full
Health → Wood → Coin chain, and that the private tables are not client-readable
while the views return correctly-scoped rows.

**Implemented but not yet exercised live:** the output-cap stall + resume-on-
collect, and the continuous Lumberjack-fed Forest.

**Still deferred:** invitations, and the full game UI (the Svelte client is a
sign-in + new-game shell, not the tabletop yet).

---

## 11. Authentication & identity

SpacetimeDB authenticates a **connection**, not a person: every connection
arrives as `ctx.sender`, an `Identity` derived from the caller's JWT
(`blake3(issuer + "|" + subject)`). The same human therefore presents a
_different_ principal per auth provider/device. So we split **identity** (the
principal) from **user** (the human), and key all domain data on `user.id` —
never on the principal. (Keying domain tables on the principal, à la the
quickstart, would permanently lock out multi-provider login.)

### Two tables

- **`user`** (§3.2) — the human. Synthetic `u64` PK so MANY principals can point
  at one human. `primaryEmail` is `.unique()` + lower-cased: it's the natural
  key that lets two providers _discover each other_. Roles (`isAdmin`) live here
  — a human is an admin once, regardless of device.
- **`identity`** — one row per linked principal: `id` (the `Identity`, == the
  principal) as PK → O(1) caller resolution, `userId` FK, `provider`
  (`Google` | `Spacetime`), `linkedAt`.

### Caller resolution & gating

Every reducer/view resolves the caller in two hops:
`ctx.sender → identity → user` (`lookupCaller`). The **`identity` table is the
access gate**: a principal with no row resolves to nothing.

- **Reducers** call `requireCaller` and **throw** when unlinked
  (`Sign in first …`). `requireAdmin` adds the role check.
- **Views** call `lookupCaller` and return `[]` when unlinked (graceful empty
  state) — so an anonymous client may open a socket and read the public
  catalogue, but sees no game data and can take no action.

> Footgun: `.find()` returns **`null`**, not `undefined`, when absent.
> `… !== undefined` is an always-true auth bypass — always compare to `null`.

### Linking — Google (auto) vs SpacetimeAuth (explicit)

- **Google** is trusted to assert a verified email, so `onConnect` auto-links:
  it checks **both** issuer (`accounts.google.com`) **and** audience (our client
  id) on `ctx.senderAuth.jwt`, then **finds-or-creates a `user` by email** and
  attaches the principal. Find-or-create-by-email is what merges providers:
  whoever connects first creates the user; later principals with the same email
  attach to it. On reconnect only provider-owned fields (email, picture) are
  refreshed — never `displayName`, which the human owns once edited.
- **SpacetimeAuth** (the CLI's anonymous-ish token) is **not** auto-linked.
  `bootstrapFirstAdmin` is the explicit link path (and admin bootstrap): it
  find-or-creates the user by email, attaches `ctx.sender` as a `Spacetime`
  identity, and flips `isAdmin`. It refuses once any admin exists, so it
  self-closes. This same shape — find-or-create user by email, attach the
  current principal — is the generic account-linking primitive for a future
  "link account" button.

> Trust rule for any new provider: **only auto-link a provider you trust to
> prove the join key (email).** Auto-linking an untrusted issuer is an
> account-takeover vector. Otherwise require an already-trusted session and an
> explicit link reducer.

### Client

The client's only auth job is to obtain a Google ID token and hand it to the
connection (`withToken`); the server does the rest on connect. There is **no
live token swap** on a SpacetimeDB connection, so `Root.svelte` keys the
`Connection` component on the token store (`{#key $googleToken}`) — a new token
tears down and rebuilds the connection. Tokens are validated (issuer / audience
/ `exp`) and stored per host+db, and refreshed ahead of expiry. `me_view` tells
the UI who it's signed in as. The Google client id is **public** (not a secret):
it lives as a server constant and as `VITE_GOOGLE_CLIENT_ID` on the client.
