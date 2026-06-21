# Tabletop layout

Cards sit anywhere in free board-space (a `Tabletop {x, y}` per card, server-
authoritative). Keeping the board tidy — no two cards overlapping, everything
on-screen, the card you just dropped staying where you put it — is done
**authoritatively on the server**, in one pass, by a real constraint solver.

The problem is overlap resolution with **minimum displacement**: when a drop (or
a freshly-grown/produced card) lands one card on another, move cards apart as
little as possible so the spatial intent the player had is preserved. That rules
out reflowing layouts (masonry / bin-packing / auto-grid), which throw away where
you put things.

## What we ship — server-side VPSC overlap removal

The layout lives in `spacetimedb/src/engine/layout.ts`: a pure function
`relayout(ctx, boardId, pinnedCardId?)` run **inside the reducer transaction**
that changed the board. It reads every tabletop card's position + footprint,
removes all overlaps with minimum displacement, and writes the changed positions
once. No timer, no loop, no client-side layout, no async round-trip.

The solver is **VPSC** (Variable Placement with Separation Constraints; Dwyer,
Marriott & Stuckey, GD'05) — the canonical minimum-displacement rectangle
overlap-removal algorithm — via the `webcola` package. We import only the
DOM-free `rectangle`/`vpsc` submodules (`webcola/dist/src/rectangle`,
`…/vpsc`), so it bundles cleanly into the WASM module and satisfies reducer
determinism (no RNG, no clock; we iterate cards in a fixed sorted-by-id order).

### Pinning

When a card is "pinned" (the one the player just dropped, or a card that just
grew/was-granted in place), its VPSC variable gets a dominating weight, so the
minimum-displacement solve holds it still and moves its neighbours around it
instead. With no pin (the `newGame` deal, the admin `relayout_board` tidy) every
card is free and the whole board settles together.

### Footprints — sized for the *fullest* the card ever gets

The server has no DOM, so it can't measure rendered sizes. Worse, a station's
size is **dynamic**: output-tray cells grow as they fill (30×38 → 64×80, see
`VerbStation.svelte`), so the card's width *and* height expand with use.

`footprint(ctx, card)` therefore sizes each card for its **maximum** state —
every hole shown and the output tray full — computed (a deliberate generous
over-estimate) from `outputCap` + the card's slot count. This makes the footprint
**constant**: it doesn't change as a tray fills, so the layout never reshuffles
mid-play, and packing can never overlap because the live card is always ≤ its
footprint box. Inert tokens/blueprints get a small fixed footprint.

The trade-off: an empty station reserves the space its full self would need, so
the board is a little more loosely spaced than the cards currently look. That
slack is what buys a stable layout that doesn't shuffle every time a card is
produced or collected.

### Stacking — adjacent same-type tokens pile (cluster → collapse → VPSC → fan)

Inert resource tokens **pile** into vertical fans, and this too is a server-side
layout concern — there is **no quantity field, no pile table, no client grouping**.
Each card keeps its own `Tabletop {x,y}`; the fanned offsets ARE the real stored
positions, so the client stays a pure renderer. `relayout` does it in four steps:

1. **Cluster** (`clusterTabletop`) — group loose, inert (`!def.isVerb`) tabletop
   cards of the **same `defId`** by proximity via union-find: two are adjacent if
   their stored centres are within `STACK_RADIUS` (≈130px, one token width). It is
   deliberately **"only adjacent merge"**, not "all wood everywhere is one pile" —
   so the same resource can form several distinct piles in different board regions.
   Verbs/machines (and drones, which are verbs) never pile. Members sort by id (a
   stable bottom-of-pile / z-order); singletons aren't piles. Iterating in
   sorted-by-id order keeps clustering deterministic. The helper is **exported** so
   `move_card`'s drag-whole-pile uses the exact same adjacency definition.
2. **Collapse** — each cluster contributes **one** rectangle to VPSC, sized as a
   single `footprint()` but **inflated in height** by `(depth-1) * STACK_DY` (the
   fan's reach). So VPSC sees one tall box per pile and still guarantees no pile
   overlaps a neighbour.
3. **VPSC** — `removeOverlapsPinned` runs unchanged over (singletons + one rect
   per cluster). The pin is translated: a dropped card that's a pile member pins
   its **cluster's** rect.
4. **Fan** — after the solve, expand each cluster: `member[k] = anchor + (k*STACK_DX,
   k*STACK_DY)` with `STACK_DX = 0` (straight-down column) and `STACK_DY ≈ 14px`.

**Deliberate intra-pile overlap carve-out.** VPSC's no-overlap guarantee is
enforced *between* piles only — within a pile the members deliberately overlap
(that's what a stack looks like). The overlap is applied **after** the solve, in
the fan step; the solver never sees it.

**Critical idempotence rule.** The fan MUST be a pure function of the cluster's
**settled anchor** (`member[k] = anchor + k*offset`), **never** relative to each
card's *current* position — otherwise the pile would creep on every relayout and
break the "settled board → zero writes" guarantee below. On a settled pile the
anchor (member[0], lowest id) is already at its solved spot and each member is
already at `anchor + k*offset`, so a second relayout recomputes identical
positions and writes nothing.

**Interaction.** `move_card` drags the **whole pile**: it finds the dragged card's
cluster (`clusterOf`, shared adjacency), applies the same old→new delta to every
member, then pins + relayouts (members stay adjacent — all moved equally — so they
re-cluster and re-fan at the destination). `slot_card` / `collect_and_slot`
consume exactly **one** card; when that card came from a pile they relayout so the
remaining members re-fan tight (removing a card can't create an overlap, so that
is the only reason those consume paths relayout).

### Staying on-board, without the ratchet

After the solve, a **single rigid translate** shifts the whole set so nothing
sits above/left of a `MARGIN` from the origin. It's rigid (preserves every gap),
fires only when something is off-edge, and is idempotent at the fixpoint — so it
can't accumulate. This is deliberately *not* a per-card `max(0, …)` clamp: a
clamp only ever pushes positive, so the centroid ratchets toward +∞ — the
x≈100k/y≈60k runaway an earlier client-side version kept hitting.

### Idempotence

`relayout` writes back only cards that actually moved (≥1px), so re-running it on
a settled board produces **zero** writes. Calling `relayout_board` repeatedly is a
verified no-op (identical position checksum across runs) — the direct regression
guard against drift.

### Trigger points

`relayout` is called once, in-transaction, by every path that changes the
tabletop:

| Path | Pin |
| --- | --- |
| `move_card` (drop / unslot / collect-to-table) | the moved card (its whole pile, if any) |
| `slot_card` / `collect_and_slot` (only if the consumed card was in a pile) | none — re-fans the remainder |
| `new_game` (after the deal) | none |
| `complete_situation` `become` (a Seed → Forest metamorphosis) | the new card |
| `dev_grant` (admin spawn) | the granted card |
| `relayout_board` (admin tidy / migration tool) | none |

Slotting/collecting *into* a verb removes a card from the tabletop, which can't
create an overlap, so those paths don't relayout — **except** when the consumed
card was part of a pile, where they relayout purely so the remaining members
re-fan to close the gap. Output cards live in a tray
(no tabletop position) until collected, so they're excluded until a `move_card`
brings them out.

### Tuning knobs (`layout.ts`)

- `footprint()` — the per-card max-size estimate (the formula to revisit if a
  card visibly overlaps its neighbours, i.e. renders bigger than its footprint).
- `GUTTER` — minimum visible gap kept between cards.
- `MARGIN` — how far the layout is kept from the board's (0,0) origin.
- `PIN_WEIGHT` — how immovable a pinned card is (dominating weight).
- `STACK_RADIUS` — centre-to-centre distance under which two same-type tokens pile.
- `STACK_DX` / `STACK_DY` — the per-card fan offset (DX=0 keeps the pile vertical).

## Why it's server-side (and why the client version was removed)

An earlier version did layout on the client: a `relax()` pass on drop plus a
background `$effect` **watchdog** that periodically re-relaxed the whole board.
It was fundamentally unstable. The watchdog round-tripped positions through the
async `move_card` reducer but re-fired faster than the echo + the CSS slide could
land, so each pass read a half-applied, internally-inconsistent layout, mistook
it for overlap, and spread everything further — cards marched off-screen to
x≈100k/y≈60k. A control loop whose feedback lags its control interval cannot be
tuned stable.

Moving the layout into the reducer fixes this at the root:

- **No feedback loop.** One synchronous computation over a single in-memory
  snapshot, written atomically. There is no interval for the feedback to lag.
- **Single source of truth.** All clients read the same settled positions from
  the `my_cards` view; there is no client-side layout to diverge or to fight over
  when a board has more than one member.

The client (`Board.svelte`) is now a pure renderer + drag→reducer translator: on
drop it sends one `move_card` (snapping to the 26px felt grid only for visual
rhythm) and renders whatever positions the server hands back, animated by the
existing `left`/`top` CSS transition.

## The algorithm, in context

VPSC was the "road not taken" in the first cut of this doc; the instability of
the client loop is what made it the road taken. It separates one axis at a time
(x then y) using a sweep-line to generate a linear number of separation
constraints, then solves a quadratic program for the minimum-displacement
positions that satisfy them. It's deterministic and rectangle-aware (unlike d3's
circle-based `forceCollide`), which is why "move cards as little as possible" maps
onto it directly. We use the overlap-removal entry points (`generateXConstraints`
/`generateYConstraints` + `Solver`, the internals of webcola's `removeOverlaps`)
so we can weight the pinned card; we don't use webcola's graph-layout machinery.
