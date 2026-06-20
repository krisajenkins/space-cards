# [x] Login Bug

Sometimes when I recreate the database my UI gets stuck on a "auth token we don't recognise" state. I have to clear cookies to get back in. It probably won't happen in production because we won't recreate the database, but it's still annoying for dev. Here's the console:

```
client:789 [vite] connecting...
client:912 [vite] connected.
spacetimedb.js?v=e031886b:5042 ℹ️ INFO Connecting to SpacetimeDB WS...
:3000/v1/identity/websocket-token:1  Failed to load resource: the server responded with a status of 401 (Unauthorized)
spacetimedb.js?v=e031886b:5042 ❌ ERROR Error connecting to SpacetimeDB WS
Connection.svelte:38 Error connecting to SpacetimeDB: Error: Failed to verify token: Unauthorized
    at openWebSocket (spacetimedb.js?v=e031886b:5640:13)
    at async openWebSocket (spacetimedb.js?v=e031886b:5693:21)
(anonymous) @ Connection.svelte:38
```

In those circumstances, let's just clear the auth tokens and force reauthentication.

# [x] Card History view

I want to create a view that shows, for the connected player, how many of each card they have created over the lifetime of the game. (No entry for undiscovered/uncreated cards.) This will power achievements; stats; and a new type of card that generates blueprints _we know the player can use_. 

One interesting thing this will power - the end! When you first create an escape card, that's the win condition. Trigger some celebratory message or cutscene.

# [x] Drone Blueprints should not be consumed.

You might want to make more than one of a drone. This requires that a recipe that consumes a drone blueprint produces the same blueprint.

# [x] We have a drone design flaw.

In the current game, drones should not be able to drop to an assembler, because
it makes different kinds of things - if it's auto-filled the player can't make
a choice - the drone will jump in and blindly force a choice for them.

Let's try this approach: 

* Drones have levels (I, II, III, IV...)
* Some machines/mines/etc have a drone slot top-right of the card, which accepts a drone of a certain level or above.
* Drones can be put into a drone slot, they can be taken out, they can be moved to a different card to be reassigned.
* A drone will attempt, every two seconds, to fill an empty slot on its machine, by taking the next available card on the table or in an outbox.

Obviously this will require reworking existing drones, and it will need a drone-building machine.

Before implementing, consider this design and we'll discuss it first.

DONE. The old catalyst + courier drones are gone, unified into one **drone bay**
mechanic. Each machine (except the choice machines — Workshop, Assembler — and
the pure emitters) has a `droneLevel`-tagged bay slot. A bayed drone is a
hole-less verb that ticks every 2s, pulling a card its host accepts (from the
table or any output tray) into an empty input hole. Drones are generic **Mk
I–IV**; level is a pure access gate (a bay demands a minimum Mk). Built at the
Workshop from `blueprint_drone_1..4` (kept, so one manual builds a fleet).
Reassignable any time, even while the host runs; level enforced client- AND
server-side. Ladder: Mk I = gatherers/Printer, Mk II = Refinery/Fabricator/
Kiln/Ice Mine, Mk III = Electronics Fab/Electrolysis/Chem Reactor, Mk IV =
Rocket. Levels are easy to re-tune in `lifecycle.ts` after playtesting.

REFINED after first playtest: the bay is a **worker bay**, and **Effort is the
universal worker** (a Mk-0 drone that fits any bay, spent one cycle at a time —
narratively *you* working the machine, instead of a drone fetching the player).
Every non-emitter machine now needs a worker (Effort or a sufficient-Mk drone) to
run; emitters (Survivor, Solar) self-run. Gatherers lost their Effort input hole
(the worker IS the input). The two choice machines (Workshop, Assembler) get a
**worker-only bay** — Effort cranks them, no mechanical drone qualifies, so you
keep the build/recipe choice. Also fixed: the card header now grows to contain
the bay (it was overlapping the input holes).

# [x] Blueprints shouldn't all appear at the start.

There should be a "research" card. It takes 1 effort, and can create a blueprint. The rules here are a little tricky, because what I want is:

- If you've done a manual task 3 times, you can research a drone that does it, if there is such a drone.
- If you've unlocked 1 of each of the ingredients for a new card, you can now research the blueprint for the thing that can be built with those ingredients. Note that it's one-of-each instead of the full recipe, because once you've got the blueprint, I still want you to have to work to make it.

I think this will lean heavily on the card history view - it's how we know what cards you've found.

This also changes the starting state. You should just start with 4 things: Survivor, Regolith Field, Wreck, Printer.

DONE. New **Research** station (resolvers.ts `research` + `RESEARCH_TREE`): a
worker-only bay like the Workshop — one Effort yields the next blueprint you've
earned, auto-picked in tech-tree order. Two unlock rules read `my_card_history`:
a machine blueprint needs **1-of-each input category discovered**; a drone
blueprint needs that **tier's chore done ≥3×** (e.g. 3 raw → Drone Mk I). The
`ready` hook keeps it idle (Effort un-spent) when there's nothing left to learn.
Blueprints are no longer dealt — `newGame` now starts with **six** stations:
Survivor, Regolith Field, Wreck, Printer, **Workshop, Research** (the Workshop is
the only blueprint *consumer* and Research the only *producer*, so both must be
present — the "4 things" plus the two meta-stations). Also added the **Eureka**
achievement (research your first blueprint). Verified end-to-end on a scratch
local DB: opening deal, both unlock rules, the produce path, and the idle guard.

Known follow-ups (not done): a per-card *choice* of what to research (v1
auto-picks the lowest-priority eligible blueprint); the Rocket unlock uses "any
subsystem + fuel" rather than literally one-of-each subsystem; tunables (the ≥3
drone threshold, research duration) live in `resolvers.ts` / `constants.ts`.

# [x] We need achievements

A reducer on the card history view should record certain achievements. The UI
should pop them up as toasters top-left. Be careful that they're only triggered
once by give a click-to-dismiss workflow and a 'seen' flag and reducer.

DONE. `awardAchievements` (achievements.ts) runs from `tally` — the single
card-birth funnel — and inserts an `achievement` row the first time a milestone's
condition holds, never again (the `by_board_ach` lookup makes it idempotent, so
each fires exactly once). Conditions are code (predicates over the board's
card-history counts); the display text lives in the public `achievement_def`
catalogue, authored in `init`/`seedCatalogue`. Seven milestones along the
gather→refine→fabricate→automate→escape arc, each keyed off a card *never in the
opening deal* so it fires on real progress, not the initial layout. Earned rows
start `seen:false`; `Achievements.svelte` pops unseen ones as top-left toasters,
click-to-dismiss → `mark_achievement_seen`. The Escape toaster doubles as the win
banner. Read via the membership-scoped `my_achievements` view.

(Note: the bare-value prefix scan on a multi-column index panics in
`serializeRange` under SDK 2.5.0 — `my_card_history` had this latent bug too, now
both views iterate-and-filter instead.)

# [x] We need an About button and popup

# [x] We need a way for an admin to visualise the whole progression tree.

That's the only way we're going to design this in a satisfying way without
playing through the whole game a million times. This would be easy if all our
recipes were data... 🤔

DONE. Recipe maps in `resolvers.ts` are now exported; `graph.ts` walks them
(plus the live `card_def`/`slot_def` catalogue) into a `{nodes, edges}` crafting
graph, surfaced via two public anonymous views (`progression_nodes`,
`progression_edges`). `ProgressionTree.svelte` renders it as a read-only,
pan/zoom layered-DAG node-link diagram (pure-TS layout, no new dep; edges
coloured by relation kind with legend toggles), opened from an admin-only "Tree"
pill in the topbar (gated on `me_view.isAdmin`). Game behaviour is unchanged —
the visualiser only reads.

# [x] Zoom-to-Fit

The card tableaux often spills over the page. We need zoom-to-fit on the local view, whenever a card appears/changes position/changes/size/disappears.

DONE. `Board.svelte` now wraps the card layer in a `.content` element carrying a
purely-local `translate+scale` transform that fits the whole tableau into the
viewport (scale capped at 1× — shrink-to-fit only, never blow up; centred, small
margin). The bbox sweeps every card's **maximum** footprint (a faithful port of
the server's `footprint()`), so size growth never needs a re-fit; a
ResizeObserver re-fits on viewport change and `$derived` re-fits on card
add/remove/move. No server/layout/reducer change. Drag stays exact: drop coords
are measured against `contentEl.getBoundingClientRect()` (which folds in the live
transform) and divided by the live computed scale, so drops land under the cursor
even mid-transition.

# [x] Refactor namespaces

We need to rearrange the codebase so that code is in more meaningful places. For example, at the moment, how do you find where achievements are defined? You have to know to look in `lifecycle.ts`. You could never guess that. Similarly, it makes sense for some resolvers to be in `resolvers.ts`, but you'd never guess the initial contents of the Wreck live their too.

This needs an audit of what's currently where, and some thought about what the taxonomy _should_ be.

DONE. The server module is now grouped into **three folders by what the thing
_is_**: `content/` (authoring + data — `catalogue.ts` is where cards are defined,
`recipes.ts` holds the build/subsystem/research/Wreck data, `achievements.ts`
holds both the milestone text and its earning conditions), `engine/` (mechanism —
`engine.ts`, `resolvers.ts`, `layout.ts`), and `platform/` (the SpacetimeDB
surface + infra — `schema.ts`, `reducers.ts`, `views.ts`, `graph.ts`,
`lifecycle.ts`, `auth.ts`, `constants.ts`, `types.ts`). `index.ts` stays the
aggregator. The two buried things the TODO named — achievement text (was in
`lifecycle.ts`) and the Wreck's contents (was in `resolvers.ts`) — now live where
you'd guess. **Zero wire-surface change**: reducer/table/view/column names are
untouched, proven by regenerated bindings being semantically identical; the module
type-checks clean (`tsc -p spacetimedb/tsconfig.json`), publishes with an empty
migration plan, and the client checks + builds. CLAUDE.md / docs file-location
references updated.

# [x] A few rule updates

- [x] You shouldn't be able to research anything until you have a workshop. It's frustrating to have the blueprint and no way of using it.
- [x] Let's start the Survivor as containing 2 Effort.

DONE. (1) The `research` resolver's `ready` hook now also requires
`boardHas(ctx, boardId, "workshop")` (and `resolve` short-circuits to `NOOP`
without one), so Research stays idle — Effort un-spent — until you've salvaged a
Workshop to build at; `tally` already re-nudges the idle bench when the Workshop
appears. (2) `newGame` seeds two Effort into the Survivor's output tray
(`spawnOutput(... "effort", survivor.id)` ×2), so a fresh board opens with 2
Effort ready. No schema/wire change.

# [x] The Workshop should accept a Mk I drone, not just Effort.

The Workshop currently has a worker-only bay (Effort only) specifically so a
drone can't auto-pick a blueprint for you. Let's relax that: a **Mk I drone**
should be able to work the Workshop too — but the one thing a drone must *not*
do is choose which blueprint you build. So the drone can provide the worker/turn
the crank, while the blueprint choice stays the player's. (Needs a bit of design
thought: how the choice is held when a drone, not Effort, is powering the bay.)

DONE, no schema change. (1) The Workshop bay drops from WORKER-level (99,
Effort-only) to **Mk I** — Effort still qualifies (99 ≥ 1), so this only *adds*
Mk I+ drones. (2) The generic drone feeder (`droneResolve`) now skips any hole
that accepts the `blueprint` category, so a drone in the Workshop bay cranks it
and loads Components but **never grabs a blueprint** — choosing what to build
stays the player's call. Only the Workshop has a blueprint hole, so the rule
touches nothing else (the Assembler choice machine is handled separately). The
hole hint now reads `MK I+ / EFFORT` for free. Research stays WORKER-only.

# [x] Card hole hints need improving

- [x] Holes seem to be identifiers at the moment, and that doesn't quite work when the text is SOMETHING_LONG - we really wanted that space in there so we can line break cleanly. We should be using the card's display name. (I do like the fact that holes' text is shown upper-case though. Keep that, but for style reasons.)
- [x] Sometimes the hints should have more than one thing. Like most of the "MK1 +" labels should also have an "EFFORT" label too.

DONE. Client-only. `catalogue.ts` gains `CATEGORY_LABELS` (accepts-token →
human display name with real spaces, e.g. `life_support → "Life Support"`) and
`acceptLabel()` (a card's own `def.name` wins, then the category map, then a Title
Case fallback). Hint chips now source the spaced display name and the uppercase
look is pure CSS (`text-transform: uppercase`), so `LIFE_SUPPORT` (one
unbreakable token) becomes `LIFE SUPPORT` that wraps cleanly. New
`holeLabels()` lets a hole advertise multiple chips: a Mk N+ worker bay now
renders **both** `MK N+` and `EFFORT` (Effort is the universal Mk-0 worker), and
input holes map every accepted category through `acceptLabel`.

# [x] We need sound effects.

There should be a gentle whirring whenever timers are running, a ping whenver
one completes, and a jingle when you get an achievement.

And that also means we need a mute button in the top bar.

DONE. Client-only, all sounds synthesised with the Web Audio API (no binary
assets, no new deps). `audio.ts` is the synth + a localStorage-backed `muted`
store; `SoundEffects.svelte` is a render-nothing conductor wired to the live
`my_*` views. Whirr = a soft low hum + filtered-noise bed that fades in/out with
`$derived` "any situation ongoing"; ping = a soft bell on `my_situations`
onUpdate/onDelete (a run leaving Ongoing), coalesced through a 180ms debounce so
a flurry of completions is one ping; jingle = an A-major arpeggio on
`my_achievements` onInsert (gated on subscription-ready so reload backfill is
silent). AudioContext is created suspended and armed on the first
pointer/key/touch gesture (autoplay-safe, no load-time errors). A 🔊/🔇 pill in
the top bar toggles mute (ramps master gain to 0 + suspends the context),
persisted across reloads.

# [ ] What is the order of revealed blueprints?

Let's talk about it. This feels like a key playthrough decision.
