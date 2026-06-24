# [ ] Layout still needs work

This is the last big blocker. Even with the warehouse, managing screen real estate is the last big blocker to launching this game.

# [ ] It bugs me that we can pull a workshop from the wreck

That's unbelievable. Let's do this:

- Two levels of blueprints
- You pull a _workbench_ from the wreck. It can make any level 1 blueprint.
- Eventually you can make a _workshop_, which can make level 2 blueprints.

> ⚠ Blocked (2026-06-21): Mechanism is clear (rename Workshop→Workbench, add a
> `workshop` verb, add `level: 1|2` to `BUILDS`, gate each bench on the
> blueprint's level), but the content decisions are open: (1) which of the 14
> blueprints are level 1 vs level 2? (2) how is the Workshop obtained — its
> research gate + build cost, and can it also build level-1 blueprints? (3) does
> the Wreck now yield a Workbench instead of a Workshop (and rename the
> `salvage_workshop` achievement)?

# [ ] Scroll to thing (Caz)

Caz wants a way to scroll/jump the viewport to a particular thing on the board.

> ⚠ Blocked (2026-06-21): The board has no scroll/pan model — `.board` is
> `overflow: hidden` and the content auto-fits the whole tableau on screen, so
> there's nothing off-screen to scroll to. Needs design: (1) what is "the thing"
> and how is it picked (card by name/category, newest output, search, legend
> click)? (2) what triggers it — manual control or automatic? (3) a new free
> pan/zoom camera, or just a momentary highlight/centre within the fitted view?

# [ ] Blueprint library attached to the workshop (Caz)

Caz wants: maybe some library, attached to the workshop, that keeps your
blueprints neatly stored.

> ⚠ Blocked (2026-06-21): Tentative idea ("maybe some library") with no settled
> meaning of "stored", and entangled with the two-tier Workbench/Workshop rework
> above. Decide: (1) a new server-side holding concept, or a pure client panel
> that visually collects loose `blueprint_*` cards? (2) does the bench feed from
> the library automatically (contradicts the deliberate hand-pick bay) or do you
> still drag blueprints into the hole? (3) wait until the Workbench/Workshop split
> is settled?

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
