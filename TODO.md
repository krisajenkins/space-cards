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

# [ ] Feedback: A minor UI issue in the end: I desperately clicked on the escape card, but to finish the game I had to click on the info popup.

Ah yes, perhaps I should have the last info popup disappear the way the others do. That would trigger it. 🤔

# [ ] People don't like having to log in.

Perhaps we should just use anonymous login via Spacetime OIDC, and give people
the option to carry their game across devices by logging in with Google.

# [ ] I should really understand:

spacetimedb/src/content/catalogue.ts
spacetimedb/src/content/opening.ts
spacetimedb/src/content/recipes.ts
spacetimedb/src/engine/verb-api.ts
