# [ ] Layout still needs work

This is the last big blocker. Even with the warehouse, managing screen real estate is the last big blocker to launching this game.

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
