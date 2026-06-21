# [ ] What is the order of revealed blueprints?

> ⚠ Blocked (2026-06-21): Mechanism is trivial (reveal order = array order of
> `RESEARCH_TREE` in `content/recipes.ts`, with category `need` thresholds + the
> `requires` ladder). The open call is *pacing*: (1) what overall reveal order do
> you want for the ~14 blueprints? (2) how much sooner should drone Mk2/Mk3
> arrive — earlier list position, lower thresholds, or both? (3) keep the
> Mk-N-needs-Mk-(N-1) ladder when pulling higher Marks earlier?

Let's talk about it. This feels like a key playthrough decision.

For starters, drone mk 2 & 3 blueprints need to be available sooner.

# [ ] Achievements text needs human attention

> ⚠ Blocked (2026-06-21): All 21 entries in `ACHIEVEMENT_DEFS`
> (`content/achievements.ts`) are already written in a consistent voice — there's
> no objective spec to execute against. This is a creative review only you can do:
> happy as-is, or which achievements want rewriting and in what direction (tone,
> length, references)?

One for you, Kris.

# [ ] It bugs me that we can pull a workshop from the wreck

> ⚠ Blocked (2026-06-21): Mechanism is clear (rename Workshop→Workbench, add a
> `workshop` verb, add `level: 1|2` to `BUILDS`, gate each bench on the
> blueprint's level), but the content decisions are open: (1) which of the 14
> blueprints are level 1 vs level 2? (2) how is the Workshop obtained — its
> research gate + build cost, and can it also build level-1 blueprints? (3) does
> the Wreck now yield a Workbench instead of a Workshop (and rename the
> `salvage_workshop` achievement)?

That's unbelievable. Let's do this:

- Two levels of blueprints
- You pull a _workbench_ from the wreck. It can make any level 1 blueprint.
- Eventually you can make a _workshop_, which can make level 2 blueprints.

#  [ ] Drone preferences

When a drone wants to pick up a card, it should prefer cards loose on the table before it looks in outboxes.

# □ Stackable resource cards. Perhaps autostacking?

> ⚠ Blocked (2026-06-21): DATA_MODEL §3.3 says stacking must be a *client-only*
> visual concern (every card is a discrete row — no merging/counts). Decide: (1)
> honour that (render-only grouping) or revisit the data model? (2) what counts as
> "stackable" — same `defId` or same `category`; resources only? (3) what triggers
> a stack — always-on auto-group or an explicit drop-on-pile gesture? (4) how does
> a pile interact with the server-authoritative VPSC layout, dragging and
> slotting?

# [ ] When stackable cards is done, an autolayout button

> ⚠ Blocked (2026-06-21): Depends on "Stackable resource cards" (still open) —
> there are no piles to stack into yet. Also the "lay out factory cards in
> progression order, columns L→R" half conflicts with the locked
> minimum-displacement VPSC philosophy in `docs/LAYOUT.md`. Decide the stackable
> feature first, then: should autolayout override or coexist with VPSC, and what
> defines a card's "progression column"?

Visible, top right, it will automatically stack resource cards into piles. Then it will lay out the factory style cards in roughly in order of progression through the story, columns, left-to-right.

# [ ] Scroll to thing (Caz)

> ⚠ Blocked (2026-06-21): The board has no scroll/pan model — `.board` is
> `overflow: hidden` and the content auto-fits the whole tableau on screen, so
> there's nothing off-screen to scroll to. Needs design: (1) what is "the thing"
> and how is it picked (card by name/category, newest output, search, legend
> click)? (2) what triggers it — manual control or automatic? (3) a new free
> pan/zoom camera, or just a momentary highlight/centre within the fitted view?

Caz wants a way to scroll/jump the viewport to a particular thing on the board.

# [ ] Flash matching cards when hovering an input (Caz)

Caz wants: hover over an input hole, get feedback about what goes in there — all
the matching cards that could fill that hole flash (i.e. flash available matches).

# [ ] Blueprint library attached to the workshop (Caz)

> ⚠ Blocked (2026-06-21): Tentative idea ("maybe some library") with no settled
> meaning of "stored", and entangled with the two-tier Workbench/Workshop rework
> above. Decide: (1) a new server-side holding concept, or a pure client panel
> that visually collects loose `blueprint_*` cards? (2) does the bench feed from
> the library automatically (contradicts the deliberate hand-pick bay) or do you
> still drag blueprints into the hole? (3) wait until the Workbench/Workshop split
> is settled?

Caz wants: maybe some library, attached to the workshop, that keeps your
blueprints neatly stored.

# Tips we might want to make visible

"Always be ready to research - keep an Effort card in Research at all times."

# [ ] Sharing buttons

> ⚠ Blocked (2026-06-21): The button itself is trivial (`navigator.share` from
> the topbar + Finale card), but the content/target aren't decided: (1) mechanism
> — Web Share API, copy-link, or named platform buttons? (2) share text/image per
> case (mid-game vs "I escaped the Moon!" finale)? (3) what URL does it point to?
> Boards are private with no public/spectator route today, so a link can only hit
> the landing page — and there's no OG meta-image for previews.

For the game it while you're playing it, and for the Finale message.
