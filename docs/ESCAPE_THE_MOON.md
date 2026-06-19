# Escape the Moon — Game Design

The first *real* game built on the Space Cards engine: a survival-crafting tech
tree. You crash-land on the moon with a basic printer and almost nothing. You
scavenge, refine, fabricate, automate, and research your way up to building a
craft that gets you home.

This is the **content/progression** design. The engine that runs it — verbs,
holes, resolvers, timers, the `become`/`moves`/`ready` hooks — is described in
`DATA_MODEL.md` and is **not** changed by this game. Everything below is
expressible with what's already built; where a mechanic leans on an engine
feature, it's named in parentheses.

Status: **draft / agreed direction.** Theme chosen over the alternatives in
`THEMES.md` because it's the only one that uses *every* engine mechanic, has a
concrete motivating endgame, and matches the existing "Space Cards / celestial
workbench" name and aesthetic with near-zero re-theming.

---

## 1. The pitch

> Subnautica in space, but cards. You wake in the wreck with a printer. The moon
> doesn't want to kill you — it just won't *help* you. Build your way off it.

The fantasy is **gather → refine → fabricate → automate → escape**, which is
exactly the shape of the engine: recipe-verbs with typed holes, self-firing
emitters, queues with back-pressure, probabilistic discovery, and drones that
automate your own hands.

---

## 2. Core design principle — automation IS the reward

Unlocking a new recipe is exciting the *first* few times and then goes stale.
The thing that sustains the game — and gives the player a rising sense of power —
is **retiring the work you've outgrown.** A drone that takes over a chore you've
done by hand fifty times is a bigger dopamine hit than yet another recipe.

So the tree is built as a **two-beat rhythm**, tier by tier:

> **(a) Novelty** — a new recipe/resource to figure out (you do it by hand).
> **(b) Automation** — a drone that *retires that manual step*, so
> your attention is freed for the next novelty. The act of automating is itself
> the progression reward.

This means **every manual step must eventually become automatable**, and the
automation should arrive about one tier *after* the chore stops being novel —
late enough that you've felt the grind, early enough that you're not sick of it.

Automation is **one mechanic: the worker bay.** Every machine except the pure
emitters (Survivor, Solar Array) has a **bay** (rendered top-right) and needs a
**worker** in it to run. A worker is one of two things:

- **Effort — the universal worker (you, by hand).** Emitted by the Survivor, it's
  a *drone too*: drop it in any bay and it cranks that machine **one cycle, then
  is spent.** Its level fits every bay, even the choice machines'.
- **A mechanical drone (Mk I–IV).** Bound to its one host, it works **continuously**
  *and*, every two seconds, fetches the host's material inputs (Power included)
  from the table or any output tray into the host's empty holes.

So the same slot expresses both halves of the rhythm: early game you *are* the
worker (spend Effort per cycle); later you drop a drone in the bay and the chore
retires itself. Because a drone is bound to one host, two drones never fight over
work. Pure gatherers (Regolith Field, Wreck) have no material input at all — the
worker *is* the input.

The **two choice machines** (Workshop, Assembler) have a **worker-only bay**:
Effort fits, but no buildable Mk does, so a drone can never auto-crank them — you
always pick the blueprint / load the recipe yourself.

The Mk level is a pure **access gate**: a higher-tier machine's bay demands a
higher Mk, so automating a new tier is a fresh build (and a fresh investment).
One generic drone does any job at its level. Effort, being universal, fits all.

A production line is therefore *built up* in stages the player can feel: build
the machine and work it by hand (Effort) → drop a drone in its bay (it runs and
feeds itself) → the upstream machines get drones too (the whole line runs
unattended). Each bay you fill is an "I made it run itself" moment.

The end-state power fantasy is a base that runs **without you** while you sip
your (metaphorical) coffee and design the rocket — with a Mk IV drone even flying
finished subsystems into the Rocket so the final assembly runs itself.

---

## 3. The two gates

Two **gates** give the game its progression and its tension. Both are *just
cards* — they need no new engine features.

### Gate 1 — Power (the "survival clock", no death)

Heavy machines require a **Power card** to run a cycle. Power is emitted by the
**Solar Array** (a no-hole emitter, exactly like `You`) into its output tray. If
a machine has no Power it **stalls** — the engine's existing output-cap /
back-pressure behaviour, used as a resource gate. Nothing dies; the base just
goes quiet until power returns.

> **Decision: only *big* machines consume Power.** Gathering (Survivor, Regolith
> Field, Wreck, Ice Mine) is free and manual. This tiers the difficulty — early
> game is hand-work with no logistics; electrifying is the Act-2 step-change —
> and keeps the opening light. Power is consumed **one card per cycle** by each
> big machine.

Crucially, **ferrying Power from the Array to the machines is just a drone in the
machine's bay** (it pulls a Power card into the power hole alongside the input).
The survival clock and the automation mechanic are therefore the *same* mechanic:
keeping the base powered is a logistics puzzle you first solve by hand and later
automate. As the base grows, power *demand* outruns one Array — so scaling power
generation is a through-line that never fully "completes".

### A currency ladder — Effort → Power → Fuel

The game runs on an **escalating series of energy currencies**, each unlocking a
tier of machine and each more precious than the last:

- **Effort** (Tier 0) — your own hands; the **universal worker** every machine's
  bay accepts. Emitted by the Survivor. Spent one cycle at a time — cheap, slow,
  always available — until a mechanical drone takes the bay over.
- **Power** (Tier 2) — electricity. Emitted by the Solar Array; gates the big
  refining/fabricating machines. The first real logistics economy.
- **Fuel** (Tier 5) — refined chemical energy. Primarily the rocket consumable,
  but a candidate **third currency**: the highest-tier machines (Lab, Assembler,
  or a Fuel-Cell that boosts Power output) could demand Fuel rather than Power.
  That would make the chemistry branch double as a *second* power economy and
  give Act 5–6 its own logistics puzzle, escalating the §2 rhythm one more time.
  Held as an explicit design option (the user is keen if it plays fun) — not yet
  wired into the recipe table.

### Gate 2 — Blueprints + the Workshop (construction, no dynamic schema)

All `card_def`s live in `init`; you acquire new *machines* by **building** them,
not by unlocking schema. The **Workshop** (hand-cranked with Effort, so it works
from turn one) consumes a **Blueprint card** + Components → produces the
machine/drone the blueprint names, dormant in its tray; you plant it to bring it
to life (the same "grows once placed" gate a Seed used). The blueprint's `defId`
is the unambiguous output selector — no fragile count-matching.

> **Implementation note (resolved design Qs §8 #5/#6).** Blueprints are *seeded*
> as "salvaged manuals" in `newGame`, so every machine is reachable and the game
> is always completable. The **tech-tree ORDER is enforced by the resource
> dependency graph** — you can't build a Subsystem without an Assembler +
> components + power, can't power anything without a Solar Array, etc. — not by
> withholding the manuals. The originally-sketched Lab/Data/salvage-reverse-
> engineering research chain was dropped for v1 in favour of this simpler,
> always-winnable model; reverse-engineering remains a natural future addition
> (find salvage → research its blueprint) layered on top.

---

## 4. The spine

```
 Effort ─┬─gather──► Regolith ─┬─refine─► Metal ───┬─fabricate─► Component ──┐
         ├─scavenge► Scrap/Salvage         │       └─────────────────────┐  │
         └─mine ice► Ice ──► Water          ├─kiln──► Silicon/Glass ──► Circuit
                              │             │                    (electronics)│
                     electrolysis►H2 + O2   │                                 │
                              │             │     Salvage ──scan──► Data ─────┤
                       chem reactor►Fuel    │                          │      │
                                            │              Data+parts ─lab─► Blueprint
                                            │                                 │
                            Component + Circuit + Blueprint ──assemble──► Subsystem
                                                                              │
              Engine + Hull + Avionics + Life-Support + Heat-Shield + Fuel ──► ROCKET ──► Escape
```

---

## 5. Card list (the Engineer route)

Grown to ~2.5× the original demo: **6 tiers**, ~25 resources, ~26 verbs (machines
+ drones). The alternate escape routes (§7) reuse most of this and add their own
late tiers.

### 5.1 Inert cards (resources)

| Tier | Cards | Notes |
| --- | --- | --- |
| Hands | **Effort**, **Regolith**, **Scrap**, **Salvage** | Effort = the universal *worker* (a drone you spend, placed in any bay); Salvage = a ready-made part from the Wreck (counts as a Component) |
| Power | **Power**, **Metal** | Power = the gate token |
| Electronics | **Silicon**, **Glass**, **Circuit**, **Component** | Component = the universal part |
| Construction | **Blueprint: X** | one per buildable machine/drone; seeded as manuals |
| Chemistry | **Water**, **Hydrogen**, **Oxygen**, **Fuel** | Ice Mine yields Water directly (no Ice card) |
| Assembly | **Engine**, **Hull**, **Avionics**, **Life Support**, **Heat Shield** | rocket subsystems |
| Win | **Escape** | produced by the Rocket via `become` |

### 5.2 Verb cards — machines

As built. Seeded stations (Tier 0) are hand-cranked; everything below the Solar
Array is built at the Workshop and needs Power. **Every machine except the two
pure emitters (Survivor, Solar Array) needs a worker in its bay to run** — Effort
(spent per cycle) or a mechanical drone of the listed Mk (continuous + fetches the
material holes). The **Bay** column gives the required Mk; *worker* = a worker-only
bay (Effort cranks it, no drone qualifies). "Holes" lists the *material* inputs.

| Verb | Power? | Material holes | Bay | Behaviour |
| --- | --- | --- | --- | --- |
| **Survivor** | — | none | — | self-runs; emits 1 Effort / cycle, cap 5 |
| **Solar Array** | — | none | — | self-runs; emits 1 Power / cycle, cap 5; build more to scale (its blueprint is *kept*, so one manual builds a whole solar farm) |
| **Regolith Field** | — | none | Mk I | worker → Regolith (worker is the input) |
| **Wreck** | — | none | Mk I | worker → Scrap (~80%) or Salvage (~20%) |
| **Printer** | — | `raw` inbox | Mk I | crude bootstrap: raw → Component, no power, slow |
| **Workshop** | — | `blueprint` + `component` inbox | worker | Blueprint selects the output: + Components + an Effort worker → that machine/drone, dormant in tray |
| **Refinery** | **yes** | `power` + `raw` inbox | Mk II | 1 raw + 1 Power → Metal |
| **Fabricator** | **yes** | `power` + `metal` inbox | Mk II | Metal + Power → Component |
| **Kiln** | **yes** | `power` + `raw` inbox | Mk II | raw + Power → Silicon (50%) or Glass |
| **Ice Mine** | **yes** | `power` | Mk II | Power → Water |
| **Electronics Fab** | **yes** | `power` + `silicon` inbox | Mk III | Silicon + Power → Circuit |
| **Electrolysis** | **yes** | `power` + `water` inbox | Mk III | Water + Power → Hydrogen + Oxygen |
| **Chem Reactor** | **yes** | `power` + `hydrogen` + `oxygen` inboxes | Mk III | H₂ + O₂ + Power → Fuel (slow; the bottleneck) |
| **Assembler** | **yes** | `power` + `component`/`circuit`/`glass`/`water` inboxes | worker | recipe choice → the Subsystem whose ingredients you loaded |
| **Rocket** | — | `engine`+`hull`+`avionics`+`life_support`+`heat_shield`+`fuel`×3 (all required, consumed) | Mk IV | all filled + a worker → countdown → **`become` Escape**. Win |

### 5.3 Verb cards — drones (the automation layer, as built)

**Effort + four marks of mechanical drone.** A mechanical drone is a hole-less
verb built at the Workshop (blueprint + components; the blueprint is *kept*, so
one manual builds a whole fleet). Dropped into a machine's **bay** it binds to
that machine and is its worker: it runs continuously *and*, every two seconds,
pulls a material the machine accepts (from the table or any output tray) into one
of its empty input holes. It can be lifted out and reassigned at any time — even
while its host is mid-cycle. **Effort is the universal Mk 0 worker** — it fits
every bay but is spent one cycle at a time and fetches nothing (you place the
materials). Mk is a **pure access gate**: a bay accepts its minimum Mk or higher
(and always Effort); behaviour is identical at every level.

| Worker | Built from | Bays it fits |
| --- | --- | --- |
| **Effort** | emitted by the Survivor | **any** bay (universal; spent per cycle) |
| **Drone Mk I** | `blueprint_drone_1` + 2 Components | Regolith Field, Wreck, Printer |
| **Drone Mk II** | `blueprint_drone_2` + 3 Components | Refinery, Fabricator, Kiln, Ice Mine |
| **Drone Mk III** | `blueprint_drone_3` + 4 Components | Electronics Fab, Electrolysis, Chem Reactor |
| **Drone Mk IV** | `blueprint_drone_4` + 5 Components | Rocket |

The Mk IV is the late-game capstone: parked in the Rocket's bay it flies finished
Subsystems and Fuel straight into the launchpad, so the final assembly runs
itself while you watch the countdown. The two **choice** machines have a
**worker-only bay** — the Workshop (a blueprint selects its output) and the
Assembler (you load the ingredients for the subsystem you want) accept only
Effort, never a mechanical drone, so automation can never blindly force a choice:
you spend Effort to crank each build/assembly and stay in charge of what's made.

---

## 6. The six acts (the story / progression)

Each act follows the two-beat rhythm (§2): a **novelty** you do by hand, then the
**automation** that retires it and unlocks the next act.

1. **Crash (hands).** Survivor + Regolith Field + Wreck + a crude Printer. Drop
   your Effort into each machine's bay to work it, one cycle at a time. *Novelty:
   the basic gather→make loop. Goal: build a Solar Array.*
2. **Power up.** Build a Solar Array at the Workshop and plant it; electrify the
   Refinery & Fabricator (faster, but Power-gated — first logistics puzzle).
   *Automation: **Mk I** drones in the gatherers retire hand-gathering; **Mk II**
   drones in the Refinery & Fabricator pull both Power and raw, retiring
   hand-power.*
3. **The line.** Drone the rest of the smelting line so refine→fabricate runs
   unattended. *Novelty + automation together: you now watch a self-running line
   for the first time. Goal: a fully hands-off metal→component line.*
4. **Electronics.** Kiln → Silicon/Glass, Electronics Fab → Circuit; the
   subsystems need Circuits and Glass. *Novelty: the electronics sub-tree.
   Automation: **Mk III** drones run the Electronics Fab and the wider parts
   line.*
5. **Chemistry.** Ice Mine → Water → **Electrolysis** → H₂ + O₂ → **Chem
   Reactor** → Fuel (the deliberate bottleneck). *Automation: **Mk III** drones
   in Electrolysis & the Chem Reactor tame the liquid/fuel logistics.*
6. **Liftoff.** The **Assembler** builds Engine, Hull, Avionics, Life-Support and
   Heat-Shield from Components, Circuits, Glass and Water (recipe choice — load
   for the part you want, by hand: it has no bay). Grind Fuel. Park a **Mk IV**
   drone in the **Rocket** to fly finished subsystems + Fuel straight in; once all
   five subsystems + three Fuel are loaded, it `become`s **Escape**. *Win.*

---

## 7. Replayability — alternate escape routes (the "class" idea)

Borrowed from the D&D theme's strongest feature: divergent tech trees as
"classes". Each route is a **different final verb** with a different late tree but
shares Tiers 0–3. v1 ships only the **Engineer** route; the others slot in later
without touching the engine.

- **Engineer** — build a rocket. Metal / Power / chemistry-heavy. (this doc)
- **Chemist** — synthesize a huge fuel cache + fire a signal flare for rescue.
  Leans on the Electrolysis/Chem branch and its own drones; little assembly.
- **Botanist** — grow a bio-dome and a long-term beacon; rescued over time.
  Leans on `become` grower chains (Seed-style life cards) and a unique
  Greenhouse/Biomass sub-tree.

---

## 8. Open questions / deferred

1. **Wreck finiteness.** A scavenge node *should* exhaust, but the engine has no
   counter. Options: a non-reusable Wreck producing a fixed batch; or a reusable
   Wreck that probabilistically `become`s an "Exhausted Wreck". Deferred — v1
   Wreck is endless. (If finite, Salvage scarcity becomes the natural mid-game
   pacing lever via Gate 2.)
2. **Day/night.** A Solar Array that pauses at "night" would add a Battery /
   Capacitor power-buffer sub-game. Tempting tension; deferred to keep Act 1
   simple.
3. **~~Effort vs Power overlap.~~ RESOLVED — keep them, maybe add a third.**
   Two labour currencies confirmed (Effort = hands, Power = machines); see the
   "currency ladder" in §3. **Fuel** is an open candidate for a *third* currency
   gating the highest-tier machines — pursue if it plays fun.
4. **~~Drone upkeep.~~ RESOLVED — drones are FREE once built.** The kind version:
   no ongoing Power/parts cost. Simpler and friendlier; the tension lives in
   *building* the automation, not in feeding it.
5. **~~Concrete recipe table.~~ RESOLVED — built.** Durations live in
   `constants.ts`; output caps, holes, and `ready`-hook predicates in
   `lifecycle.ts` + `resolvers.ts`. Construction is the Workshop reading a
   Blueprint's `defId` (a clean selector), not the count-matched Lab originally
   sketched — see §3 Gate 2.
6. **~~Build order / unlock gating.~~ RESOLVED — the resource graph gates it.**
   Blueprints are all seeded, but you still can't build a Subsystem without an
   Assembler + components + power, can't power anything without a Solar Array,
   etc. The tech-tree order is enforced by input dependencies, with no shortcuts.
7. **No tabletop UI yet.** The game logic is complete and CLI-verified, but the
   Svelte client is still the sign-in shell — you currently "play" via
   `spacetime call`. The freeform drag-and-drop tabletop is the next major piece.
8. **`devGrant` is an admin tool.** Handy for testing and gifting cards; it is
   gated on `isAdmin`, but worth revisiting before any public deployment.
