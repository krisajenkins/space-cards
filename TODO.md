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

# [ ] Scroll to thing (Caz)

> ⚠ Blocked (2026-06-21): The board has no scroll/pan model — `.board` is
> `overflow: hidden` and the content auto-fits the whole tableau on screen, so
> there's nothing off-screen to scroll to. Needs design: (1) what is "the thing"
> and how is it picked (card by name/category, newest output, search, legend
> click)? (2) what triggers it — manual control or automatic? (3) a new free
> pan/zoom camera, or just a momentary highlight/centre within the fitted view?

Caz wants a way to scroll/jump the viewport to a particular thing on the board.

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

# [ ] Fabricator seems to do the same job as printer, even though it's a much later stage unlock

> ⚠ Blocked (2026-06-22): Confirmed real. Both Printer (`printer` resolver) and
> Fabricator (`poweredOne(FABRICATE, "metal", "component")`) yield one **Component**
> per cycle at the same 6s duration (`PRINT` == `FABRICATE` == `6_000_000n`). They
> differ only in inputs/gating: Printer eats one free `raw` (Mk I bay, salvaged
> from the Wreck turn one); Fabricator eats `Metal` + `Power` (Mk II bay, research-
> gated). So the late, power-hungry chain (raw → Refinery[+power] → Metal →
> Fabricator[+power] → Component) gives no payoff over the early crude Printer.
> Needs a balance decision: (1) make the Fabricator better (2+ Components/cycle,
> faster, higher output cap)? (2) throttle the Printer (slower, or Salvage-only)?
> or (3) split downstream demand so subsystems need Fabricator-grade Components the
> Printer can't make? Which differentiation do you want?

# [ ] There should be a "start new game" button in the toolbar, with a confirmation.

For now, there's no way to go back to the old game, but we'll keep the data around.

Logically this means that we should stop looking at game[0] in the
lookup, and load the latest game instead.

# [ ] Sharing needs revisiting

On my machine it pops up the OSX sharing dialog, which isn't what I want. I
want prefilled tweets, linkedin posts, bluesky/mastodon posts, etc., as well
whatsapp and so on.
