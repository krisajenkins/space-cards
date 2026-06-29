# Archived TODOs

Completed tasks moved out of `TODO.md`. Each entry records when it was closed
and the jj change ID that did the work (see CLAUDE.md for the process).

The batch below was archived wholesale on **2026-06-21**;
these items predate the per-item logging convention, so they carry the archival
stamp rather than their individual closing changes.

---

*Archived: 2026-06-29 (change mlvzowulprkx)*

# [X] Wreck bug

When the wreck gets exhausted, what happens to the cards in its outbox? Do they
disappear? They ought to just land on the table.

Done: the generic `eff.become` branch of `completeSituation` (`schema.ts`) now
relocates every card still in the retiring verb's output tray onto the tabletop
at the husk's position before deleting the verb, so the Wreck's uncollected
salvage lands on the table instead of being orphaned. Fixed at the generic
`become` site, so any future produce-then-become verb is covered.

---

*Archived: 2026-06-29 (change ovmuuqry)*

# [X] People don't like having to log in.

Perhaps we should just use anonymous login via Spacetime OIDC, and give people
the option to carry their game across devices by logging in with Google.

Done: every visitor now connects as an anonymous "Castaway" with an auto-dealt
board (no sign-in wall), and a highlighted Google "Save game" button mints a
single-use, TTL'd, principal-scoped claim code that the post-reload Google
connection redeems via `claim_link` to merge the anonymous boards onto the
Google account — with a keep-newer conflict prompt (and board-selection
override) when both a local and a cloud game exist. The synthetic `anon:<hex>`
email key can never collide-merge with a real Google email, so the §11 trust
rule is preserved.

* Merge policy...I think we have to prompt the user. Steam does this when it hits a problem - it asks if you want to use the local save or the cloud save. We should do similar - do you want to take the game in progress or the game connected to your Google account. Normally we take whichever game was created later. I think in this case that's going to mean that for the google choice, we'd need to delete the in-progress game to allow the google game to be the newest, but you check and tell me.
* GDPR - if they're anonymous, is that really data we have to worry about privacy on? There's nothing identifying...
* Yes, first run UX as you describe. There should be a save button with a google icon, top right, where the avatar/logout button would be, with some colour highlighting to make it stand out from the other menu options.

> Resolved: deleting the in-progress game is **not** needed for the default —
> the app already renders the newest board, so merging both under one user
> surfaces the newer one automatically. Deletion only happens when the player
> explicitly picks an older cloud save over a newer local one (the
> `discard_board` path behind the conflict prompt).

---

*Archived: 2026-06-27 (change lomlvzyoxklz)*

# [X] Feedback: A minor UI issue in the end: I desperately clicked on the escape card, but to finish the game I had to click on the info popup.

Ah yes, perhaps I should have the last info popup disappear the way the others do. That would trigger it. 🤔

Done: the win (`escape`) toast now auto-dismisses after `AUTO_DISMISS_MS` like
every other toast, routing through the existing `dismiss()` special-case that
rolls the credits (`track("game_won")` + `playFinale()`), so the finale fires on
its own with no click required. The draining timeout bar now renders on the win
toast too (astral-cyan accent) so the countdown is legible. A manual click still
works. Client-only change to `src/lib/Achievements.svelte`.

*Archived: 2026-06-27 (change olkmustnolqy)*

# [X] Feedback: And what is the purpose of the warehouse when you can drop cards anywhere?

The warehouse is possibly redundant. The idea was to give you a place to hide factories that are fully automated, but on balance I'm not sure it pulls its weight.

Resolved by retiring the Warehouse from new games: removed `blueprint_warehouse`'s `research` entry so the Research bench never offers it again, while leaving the `build` recipe and card_def intact so existing games keep theirs.

---

*Archived: 2026-06-24 (change pnnnxovtqqrp)*

# [X] Should we add Google Analytics tracking?

Probably yes, I want to see it. For that we need to make a plan of which events/pages to track. And we need to update the privacy terms and consider any effect on GDPR.

> Done (2026-06-24): added **Umami** (cookieless analytics) rather than GA4 —
> cookieless means no PECR consent banner and the legitimate-interest basis is
> unchanged. New `src/lib/analytics.ts` injects the tracker only when
> `VITE_UMAMI_WEBSITE_ID` is set (dormant in local dev) and exposes a no-op-safe
> `track()`. Umami auto-counts visits; we add three milestones — `sign_in`
> (google.ts), `new_game` (App.svelte), `game_won` (Achievements.svelte, real
> win only). The privacy notice (docs/PRIVACY.md + the in-game Privacy.svelte
> mirror) was updated to disclose Umami as a cookieless EU processor that
> receives no identifying data.

---

*Archived: 2026-06-24 (change xozmtowovxru)*

# [X] Layout still needs work

This is the last big blocker. Even with the warehouse, managing screen real estate is the last big blocker to launching this game.

> Spiked (2026-06-24): replaced the client zoom-to-fit camera with a free
> **pan/zoom** camera in `Board.svelte` — drag the felt to pan, wheel/`+`/`−` to
> zoom toward the cursor, `Fit` to reframe. The board is framed once on first
> sighting, then the camera is the player's (never yanks out from under them).
> Off-screen content is flagged by thin white edge bars on whichever side(s) have
> cards spilling past the viewport. This also clears the path for "scroll to thing
> (Caz)", which was blocked on the missing pan/zoom model. Closing the item on the
> spike; whether a density/affordance follow-up is still wanted (tighter
> footprints, collapse idle stations, off-table shelves) is left to play-testing.

*Archived: 2026-06-24 (change uznuypuorpsl)*

# [X] I think we need to update the docs for bootstrap_first_admin->register_admin.

Updated `README.md` and `CLAUDE.md` to match the renamed reducer. The change was
semantic, not just a rename: the old `bootstrap_first_admin` was first-come (took
an email arg, refused once any admin existed); the new `register_admin` takes no
args, is gated on the hardcoded `ADMIN_IDENTITY` / `ADMIN_EMAIL` constants, and is
idempotent/re-runnable. Rewrote the README "Grant yourself admin" section and the
CLAUDE.md admin-scenario setup line accordingly.

---

*Archived: 2026-06-24 (change oqysmqyt)*

# [X] Fabricator seems to do the same job as printer, even though it's a much later stage unlock

Confirmed real: both the Printer (`raw → Component`) and the old Fabricator
(`Metal + Power → Component`) yielded one Component per 6s cycle, so the
power-hungry smelting line gave no payoff over the turn-one Printer. The
Fabricator was also Metal's only consumer, so deleting it would have orphaned the
Refinery + Metal.

**Resolution: repurpose, don't delete.** The Fabricator now presses **Metal +
Power → Fuel Tank**, and the **Chem Reactor** consumes one Fuel Tank per unit of
Fuel ("you need something to store the fuel in"). This kills the Printer
redundancy, keeps the whole smelting line meaningful right up to liftoff (the Chem
Reactor is the endgame bottleneck), and slots a Metal sink into the existing
tier-3 chemistry line. The `fabricator` achievement ("The Production Line") now
fires on the first Fuel Tank pressed.

# [X] It bugs me that we can pull a workshop from the wreck

*Archived: 2026-06-24 (change uoymqrsxskxt)*

That a fully-formed *Workshop* could be dragged intact from a crash-wreck was
unbelievable. The original idea was a two-tier split (a salvageable Workbench for
level-1 blueprints, a buildable Workshop for level-2), but that needed content
decisions that never settled. Resolved instead by simply **renaming Workshop →
Workbench** everywhere — a humble bench you pull from the wreck reads fine — and
dropping the two-tier plan. Pure rename: the `workshop` defId/verb,
`salvage_workshop` achievement, the `WRECK_CONTENTS` entry, resolvers, graph
projection, client glyph, and the docs/allium spec all became `workbench`. No
schema or mechanism change; `svelte-check` clean.

# [X] Achievements text needs human attention

*Archived: 2026-06-24 (change qlpzkkkk)*

One for you, Kris.

> ⚠ Blocked (2026-06-21): All 21 entries in `ACHIEVEMENT_DEFS`
> (`content/achievements.ts`) are already written in a consistent voice — there's
> no objective spec to execute against. This is a creative review only you can do:
> happy as-is, or which achievements want rewriting and in what direction (tone,
> length, references)?

# [ ] Google Login - Production version

*Archived: 2026-06-24 (change qrkpokly)*

I know there are steps needed to go from a test Google OAuth login to a prod one. Need to find out what they are and do them!

> ⚠ Blocked (2026-06-24): This is entirely Google Cloud Console work, not a repo
> change. The client id lives once in `platform/constants.ts` (`GOOGLE_CLIENT_ID`)
> and is re-exported via `src/lib/google.ts`; the client uses Google Identity
> Services (One-Tap/button), governed by **authorized JavaScript origins** + the
> **consent-screen publishing status** in the Console — there's no env var,
> redirect-URI list, or separate test/prod client id in the repo, so "test vs
> prod" is purely a Console property of this one client. To ship prod, in the
> Console: (1) move the OAuth consent screen from **Testing** → **In production**;
> (2) confirm User type = External and that the basic scopes (email/profile/openid)
> don't trigger Google verification — if no sensitive/restricted scopes, only the
> publish is needed; (3) add every prod-serving domain to **Authorized JavaScript
> origins** (verify domain ownership if prompted). Decisions for you: which
> production domain(s) will host the client, and keep the same client id or mint a
> dedicated prod one? (A new id = change that one constant in `constants.ts` and
> republish.)

# [x] Rocket Design Work

*Archived: 2026-06-24 (change xlszryrqqxns)*

I want the rocket to be more prominent. It's the endgame and the reward. I think that means two changes:

- The rocket factory needs to be a different coloured card. At the moment all factories are dark blue. Let's make the Rocket a light blue, matching the "Escape the Moon" finale text.
- Let's render the Escape card at twice the height, twice the width, so that even after the cutscene it's prominent.

# [x] Extract a palette.

*Archived: 2026-06-24 (change qrqqowytqlzt)*

We've got a lot of CSS colour definitions floating around loose. Let's make sure we put them all as constants before they start drifting into 50 shades of grey.

# [x] Sharing needs revisiting

*Archived: 2026-06-23 (change kyzyxrmz)*

On my machine it pops up the OSX sharing dialog, which isn't what I want. I
want prefilled tweets, linkedin posts, bluesky/mastodon posts, etc., as well
whatsapp and so on.

# [x] There should be a "start new game" button in the toolbar, with a confirmation.

*Archived: 2026-06-23 (change yxumpqov)*

For now, there's no way to go back to the old game, but we'll keep the data around.

Logically this means that we should stop looking at game[0] in the
lookup, and load the latest game instead.

# [x] We should remove "tidy board" and all the code connected to it

*Archived: 2026-06-23 (change uppkvuwq)*

(change lpmxvzom) Now that we have warehouses it's not actually needed. And it never worked perfectly.

# [x] What is the order of revealed blueprints?

*Archived: 2026-06-23 (change vsozyynslmwo)*

Answer: What I want is, "once you've done three tasks that could have been done by a drone, you unlock the blueprint for that drone." So Kiln and Refiner both take level 2 drones. So you 3 metal or 3 silicon or 2 metal and one silicon would do it.
I suspect that encoding this as "how many times have these factories built something" might need a lot of new code. If that's the case, I'm happy to precompute which outputs we're talking about. ie. `count(metal)+count(silicon)+... >= 3` would be fine.

Let's talk about it. This feels like a key playthrough decision.

For starters, drone mk 2 & 3 blueprints need to be available sooner.

Resolved: drone research-gates now SUM the lifetime counts of that Mk's machine
output categories and fire at a threshold — Mk I `raw`≥3 · Mk II
`metal+silicon+glass+water`≥3 · Mk III `circuit+hydrogen+oxygen+fuel`≥3 · Mk IV
`subsystem`≥2. Mk II excludes Component (the Mk I Printer makes it from turn one);
Mk IV uses 2 since only five subsystems exist. The summing (vs the old
single-category gate) is what makes Mk II/III arrive sooner. Reuses the existing
`histCategory` tally — no new "count factory firings" history needed.

# [x] Endgame layout is too large

*Archived: 2026-06-22 (change prsylsrq)*

When it auto-fits on the screen, you simply can't read the text anymore. I think this needs some brainstorming of ideas.

- ~~Collapse repeated cards down in the inbox and outbox.~~ That didn't look very good at all.
- Introduce a cave or warehouse which can house factory cards.

**Resolved with a buildable Warehouse.** Drag a factory onto a Warehouse to
*house* it: the factory keeps fully running (its timer ticks, its bay drone keeps
feeding it, other factories keep pulling from its output tray) but it leaves the
tabletop layout entirely — so the endgame board stays readable. Pull it back out
at will. Implemented as a new `housed { warehouseCardId }` `Location` variant
(housed cards drop out of VPSC packing automatically; the feeding path in
`engine.ts`/`resolvers.ts` was taught to treat a housed host as live), a fixed
capacity of 6 cards per warehouse, build as many as you like. Built at the
Workshop from `blueprint_warehouse` (3 Components), research-gated mid-game right
after the Refinery (`need: { metal: 1 }`). Client: `Warehouse.svelte` renders up
to 6 nested mini factories, each with a live countdown ring and an eject button.

# [x] When stackable cards is done, an autolayout button

*Archived: 2026-06-21 (change lpmxvzomulqz)*

A top-right "Tidy board" button (player- and admin-facing) that arranges the
board into an idealised story layout, then lets VPSC settle it. Resolved the
philosophy tension by **seeding then settling** rather than overriding: the new
member-gated `auto_layout` reducer calls `autoArrange` (in `engine/layout.ts`),
which writes an idealised position for every card and then calls the ordinary
`relayout` (no pin) — so minimum-displacement VPSC removes residual overlap and
the existing stacking fan piles resources, all from the better starting point.
`docs/LAYOUT.md`'s philosophy is untouched.

Columns are derived from the recipe data, not an invented list: opening stations
leftmost (`survivor`/`regolith_field`/`research`/`wreck`), then Wreck-salvaged
verbs (`printer`/`workshop`), then each `RESEARCH_TREE` entry mapped through
`BUILDS["blueprint_" + target].output` to its machine defId — so the progression
order auto-tracks the tree. Verbs lay out in progression columns (same-rank cards
stack as rows); inert cards seed one shared (x,y) per defId in a band beneath, so
the cluster/fan piles them automatically.

The original ask:

> Visible, top right, it will automatically stack resource cards into piles. Then
> it will lay out the factory style cards in roughly in order of progression
> through the story, columns, left-to-right.

# [x] Stackable resource cards. Perhaps autostacking?

*Archived: 2026-06-21 (change ywxultllmtyt)*

Server-side autostacking, computed in the authoritative layout pass — no schema
change, no quantity. Adjacent same-type inert cards cluster into straight-vertical
piles via cluster→collapse→VPSC→fan: `relayout` feeds VPSC one footprint per pile
(so piles never overlap), then fans members as `anchor + k·(0,14px)`. The fan is
anchor-relative (a pure function of the solved anchor) so relayout stays
idempotent. Dragging any card in a pile moves the whole pile (`moveCard` shifts
every cluster member by the same delta); dropping a pile on a slot consumes one
card and the remainder re-fans.

- spacetimedb/src/engine/layout.ts: `clusterTabletop`/`clusterOf` helpers + pile-aware relayout
- spacetimedb/src/platform/reducers.ts: whole-pile drag in `moveCard`; consume-one + relayout in `slotCard`/`collectAndSlot`
- src/lib/Board.svelte: bbox comment (no logic change — members carry their own positions)
- docs/LAYOUT.md, docs/DATA_MODEL.md: stacking is now a server concern

# [x] Sharing buttons

*Archived: 2026-06-21 (change usywnnvzuznx)*

Added share buttons for in-game and the Finale message. A shared `share()` helper
uses the Web Share API when available and falls back to copying the link
(`window.location.href`, so it survives the deploy URL changing) with a brief
"Link copied!" confirmation. The in-game button sits in the topbar, the other on
the Finale outro card; both reuse the existing pill styling.

- src/lib/share.ts (new): Web Share + clipboard-fallback helper
- src/App.svelte: in-game share button
- src/lib/Finale.svelte: finale share button

# [x] Flash matching cards when hovering an input (Caz)

*Archived: 2026-06-21 (change vqtqwnsnxoox)*

Hovering an empty input hole (or drone bay) now flashes every loose tabletop card
that could fill it. Client-only: `VerbStation.svelte` bubbles the hovered hole's
`{ accepts, droneLevel }` up via new `onHoleEnter`/`onHoleLeave` props; `Board.svelte`
derives the matching loose-card set (reusing the `firstValidSlot` accept logic)
and applies a pulsing astral-cyan `flashing` glow, mirroring the existing
reject-highlight pattern.

- src/lib/VerbStation.svelte: pointer-enter/leave on empty holes + drone bay
- src/lib/Board.svelte: hoveredHole state, matcher, flashing set + glow CSS

# [x] Drone preferences

*Archived: 2026-06-21 (change soxrnvwyotpv)*

A drone now prefers cards loose on the tabletop before raiding output trays.
`firstLoot` (`engine/resolvers.ts`, the single card-selection point for both the
generic and Assembler feeders) was rewritten as a two-pass search — scan
`tabletop` first, fall back to `output` only if nothing's loose.

# [x] In my last runthrough, drone mk4 unlocked long before drone mk3.

*Archived: 2026-06-21 (change nozllrnurzuy)*

Drone blueprints unlocked via `researchTarget`, gated only by per-category
`need` (Mk III on `circuit: 3`, Mk IV on `fuel: 3`), which can be satisfied out
of order — so a player rushing the Fuel branch could hit Mk IV before Mk III.
Added an optional `requires: string[]` (prerequisite blueprint defIds) to the
`Research` type and chained the drone tiers into a strict ladder (drone_2→drone_3
→drone_4); `researchTarget` now skips entries whose prerequisites aren't yet
discovered. Narrow fix only — does not touch the open "order of revealed
blueprints" question.

- spacetimedb/src/content/recipes.ts: `requires` field + drone ladder
- spacetimedb/src/engine/resolvers.ts: `researchTarget` honours `requires`

# [x] Research card a different colour?

*Archived: 2026-06-21 (change zrwvyvssxqzr)*

Gave the Research card its own peach colour so it reads as distinct from the
blueprint cards it produces. Added a `--cat-research: #e8a87c` palette variable
in `src/app.css` and pointed the `research` entry in `src/lib/catalogue.ts` at
it (was sharing `--cat-blueprint`).

# [x] Finale message

*Archived: 2026-06-21 (change umqyttuvsrnr)*

Let's have the happy little astronaut showing with that final "Escaped the Moon!" message, too. He's such a boss. 😎

# [x] Login Bug

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

I want to create a view that shows, for the connected player, how many of each card they have created over the lifetime of the game. (No entry for undiscovered/uncreated cards.) This will power achievements; stats; and a new type of card that generates blueprints _we know the player can use_. 

One interesting thing this will power - the end! When you first create an escape card, that's the win condition. Trigger some celebratory message or cutscene.

# [x] Drone Blueprints should not be consumed.

*Archived: 2026-06-21*

You might want to make more than one of a drone. This requires that a recipe that consumes a drone blueprint produces the same blueprint.

# [x] We have a drone design flaw.

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

# [x] We need a way for an admin to visualise the whole progression tree.

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

*Archived: 2026-06-21*

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

# [x] Endgame Reward

*Archived: 2026-06-21*

At the moment you get an achievement. After you dismiss it we should do something cool. I'm open to suggestions, but one is: Have the camera pan to the rocket, which gets larger and larger until it fills the screen, while everything else gets smaller and more transparent until it disappears. Inside the rocket you see a happy little man through the window.
