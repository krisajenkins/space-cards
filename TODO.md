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

> ⚠ Blocked (2026-06-27): The "play anonymously" half is mechanical, but it
> reverses the trust rule documented in `docs/DATA_MODEL.md` §11 ("SpacetimeAuth
> is **not** auto-linked"), and the "carry your game across devices by logging in
> with Google" half is an account-**merge** problem the doc defers to "a future
> link-account button". Product decisions only you can make: (1) **Merge policy** —
> when an anonymous player with a game in progress signs in with Google and that
> email already has a cloud game from another device, what reconciles them (attach
> the Google identity to the anonymous user / prefer the cloud game / keep both /
> prompt)? And how does the reloaded Google principal learn *which* prior anonymous
> user to claim, given the token swaps and the page reloads between sessions? (2)
> **Retention/GDPR** — every visitor now creates a durable `user`; do we need
> expiry/cleanup + privacy wording for abandoned anonymous accounts? (3)
> **First-run UX** — replace the signed-out hero with dropping straight into an
> auto-dealt game, demoting Google to an optional "save/sync" affordance — and
> where does that affordance live?

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
