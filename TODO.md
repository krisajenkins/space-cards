# [ ] Scroll to thing (Caz)

Caz wants a way to scroll/jump the viewport to a particular thing on the board.

> ⚠ Blocked (2026-06-21): The board has no scroll/pan model — `.board` is
> `overflow: hidden` and the content auto-fits the whole tableau on screen, so
> there's nothing off-screen to scroll to. Needs design: (1) what is "the thing"
> and how is it picked (card by name/category, newest output, search, legend
> click)? (2) what triggers it — manual control or automatic? (3) a new free
> pan/zoom camera, or just a momentary highlight/centre within the fitted view?

# [ ] Blueprint library attached to the workbench (Caz)

Caz wants: maybe some library, attached to the workbench, that keeps your
blueprints neatly stored.

> ⚠ Blocked (2026-06-21): Tentative idea ("maybe some library") with no settled
> meaning of "stored". Decide: (1) a new server-side holding concept, or a pure
> client panel that visually collects loose `blueprint_*` cards? (2) does the
> bench feed from the library automatically (contradicts the deliberate hand-pick
> bay) or do you still drag blueprints into the hole?

# Tips we might want to make visible

"Always be ready to research - keep an Effort card in Research at all times."

# [ ] I should really understand:

spacetimedb/src/content/catalogue.ts
spacetimedb/src/content/opening.ts
spacetimedb/src/content/recipes.ts
spacetimedb/src/engine/verb-api.ts

> ⚠ Blocked (2026-06-27): This is a personal comprehension goal (understand four
> existing, working files), not a code change — there's no broken behaviour, no
> artifact specified, so an agent can't produce a verifiable change that closes it.
> To make it actionable, decide what you want: (a) a written code-walkthrough doc
> (e.g. a "How these four files fit together" section in `docs/DATA_MODEL.md` or a
> new explainer), (b) explanatory comments/JSDoc added to the files themselves, or
> (c) it's purely your own reading task — close it yourself once read and an agent
> should leave it alone.

# [ ] New game should automatically call fit afterwards.

It can happen that your game has moved a long way from the origin coordinates. If that happens and you press "new game", no cards appear (because they're off screen). Let's just call fit as the last step of creating a new game.
