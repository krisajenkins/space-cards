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
emitters, queues with back-pressure, probabilistic discovery, and couriers that
automate your own hands.

---

## 2. Core design principle — automation IS the reward

Unlocking a new recipe is exciting the *first* few times and then goes stale.
The thing that sustains the game — and gives the player a rising sense of power —
is **retiring the work you've outgrown.** A drone that takes over a chore you've
done by hand fifty times is a bigger dopamine hit than yet another recipe.

So the tree is built as a **two-beat rhythm**, tier by tier:

> **(a) Novelty** — a new recipe/resource to figure out (you do it by hand).
> **(b) Automation** — a drone or catalyst that *retires that manual step*, so
> your attention is freed for the next novelty. The act of automating is itself
> the progression reward.

This means **every manual step must eventually become automatable**, and the
automation should arrive about one tier *after* the chore stops being novel —
late enough that you've felt the grind, early enough that you're not sick of it.
The engine gives us exactly two automation shapes to spend on this:

- **Catalyst** (the `Lumberjack` pattern) — an inert card slotted into a
  dual-mode station that makes it *self-run continuously*. Automates **production
  at a station** (e.g. a Mining Drone slotted into the Regolith Field).
- **Courier** (the `Worker` pattern, `moves` effect) — a no-hole verb that
  shuttles cards from one station's output into another's hole. Automates
  **logistics between stations** (e.g. a Hauler Drone carrying Power).

A complete production line is therefore *built up* in stages the player can feel:
build the station (hand-feed it) → drop in a catalyst (it self-runs) → add a
courier (it feeds the next station). Three escalating "I made it run itself"
moments per line.

The end-state power fantasy is a base that runs **without you** while you sip
your (metaphorical) coffee and design the rocket — culminating in a **Foreman
Drone** that even builds *other* drones, so automation begins automating itself.

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

Crucially, **ferrying Power from the Array to the machines is what the Hauler
Drone does** (`Worker` courier). The survival clock and the automation mechanic
are therefore the *same* mechanic: keeping the base powered is a logistics puzzle
you first solve by hand and later automate. As the base grows, power *demand*
outruns one Array — so scaling power generation and its delivery network is a
through-line that never fully "completes".

### A currency ladder — Effort → Power → Fuel

The game runs on an **escalating series of energy currencies**, each unlocking a
tier of machine and each more precious than the last:

- **Effort** (Tier 0) — your own hands. Emitted by the Survivor; feeds free
  gathering. Cheap, slow, always available.
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
| Hands | **Effort**, **Regolith**, **Scrap**, **Salvage** | Effort = manual labour; Salvage = a ready-made part from the Wreck (counts as a Component) |
| Power | **Power**, **Metal** | Power = the gate token |
| Electronics | **Silicon**, **Glass**, **Circuit**, **Component** | Component = the universal part |
| Construction | **Blueprint: X** | one per buildable machine/drone; seeded as manuals |
| Chemistry | **Water**, **Hydrogen**, **Oxygen**, **Fuel** | Ice Mine yields Water directly (no Ice card) |
| Assembly | **Engine**, **Hull**, **Avionics**, **Life Support**, **Heat Shield** | rocket subsystems |
| Win | **Escape** | produced by the Rocket via `become` |

### 5.2 Verb cards — machines

As built. Seeded stations (Tier 0) are hand-cranked; everything below the Solar
Array is built at the Workshop and needs Power.

| Verb | Re-skins | Power? | Holes (accepts) | Behaviour |
| --- | --- | --- | --- | --- |
| **Survivor** | `You` | — | none | emits 1 Effort / cycle, cap 5 |
| **Regolith Field** | `Forest` | — | `effort`\|`mining_drone` | Effort→consume→Regolith; Drone→keep→Regolith each cycle |
| **Wreck** | `Forest` odds | — | `effort`\|`survey_drone` | Effort/Drone → Scrap (~80%) or Salvage (~20%) |
| **Printer** | `Market` queue | — | `raw` inbox | crude bootstrap: raw → Component, no power, slow |
| **Workshop** | `Agency` `ready` | — | `blueprint` + `effort` + `component` inbox | Blueprint selects the output: + Components + Effort → that machine/drone, dormant in tray |
| **Solar Array** | `You` | — | none | emits 1 Power / cycle, cap 5; build more to scale |
| **Refinery** | `Market` queue | **yes** | `power` + `raw` inbox | 1 raw + 1 Power → Metal |
| **Fabricator** | `Market` | **yes** | `power` + `metal` inbox | Metal + Power → Component |
| **Kiln** | `Market` | **yes** | `power` + `raw` inbox | raw + Power → Silicon (50%) or Glass |
| **Electronics Fab** | `Market` | **yes** | `power` + `silicon` inbox | Silicon + Power → Circuit |
| **Ice Mine** | `You`-emitter | **yes** | `power` | Power → Water (a power-gated emitter) |
| **Electrolysis** | `Market` | **yes** | `power` + `water` inbox | Water + Power → Hydrogen + Oxygen |
| **Chem Reactor** | `Market` `ready` | **yes** | `power` + `hydrogen` + `oxygen` inboxes | H₂ + O₂ + Power → Fuel (slow; the bottleneck) |
| **Assembler** | `Agency` `ready` | **yes** | `power` + `component`/`circuit`/`glass`/`water` inboxes | recipe choice → the Subsystem whose ingredients you loaded |
| **Rocket** | new (final) | — | `engine`+`hull`+`avionics`+`life_support`+`heat_shield`+`fuel`×3 (all required, consumed) | all filled → countdown → **`become` Escape**. Win |

### 5.3 Verb cards — drones (the automation layer, as built)

Seven drones, each built at the Workshop (blueprint + components) and each
retiring a specific chore. The engine gives exactly two automation shapes:
**C** = catalyst (an inert card slotted into a station to make it self-run,
Lumberjack-style) and **K** = courier (a hole-less verb that `moves` cards
between stations, Worker-style). Couriers carry **disjoint** category sets so two
never fight over the same card.

| Drone | Type | Retires the chore of… | Carries / works on |
| --- | --- | --- | --- |
| **Mining Drone** | C | feeding Effort into a gatherer | Regolith Field / Ice Mine |
| **Survey Drone** | C | hand-scavenging the Wreck | the Wreck |
| **Hauler Drone** | K | carrying Power to the machines | `power` (from Solar only) |
| **Feeder Drone** | K | feeding the smelting line | `raw`, `metal` |
| **Fitter Drone** | K | feeding the parts line | `silicon`, `glass`, `circuit`, `component` |
| **Tanker Drone** | K | hauling the chemistry branch | `water`, `hydrogen`, `oxygen`, `fuel` |
| **Cargo Drone** | K | delivering finished goods | `subsystem`, `blueprint` |

The Cargo Drone is the late-game capstone: it carries Subsystems straight into
the Rocket's holes, so the final assembly runs itself while you watch the
countdown. (The doc's earlier Lab-Assistant / Assembly-Arm / Foreman concepts
folded away: couriers already automate the Lab-less build chain, and "automation
building automation" is just a Workshop fed by a Feeder + Fitter.)

---

## 6. The six acts (the story / progression)

Each act follows the two-beat rhythm (§2): a **novelty** you do by hand, then the
**automation** that retires it and unlocks the next act.

1. **Crash (hands).** Survivor + Regolith Field + Wreck + a crude Printer. Hand-
   feed Effort into everything. *Novelty: the basic gather→make loop. Goal: build
   a Solar Array.*
2. **Power up.** Build a Solar Array at the Workshop and plant it; electrify the
   Refinery & Fabricator (faster, but Power-gated — first logistics puzzle).
   *Automation: a **Mining Drone** + **Hauler Drone** retire hand-gathering and
   hand-power.*
3. **The line.** Add the **Feeder Drone** so refine→fabricate runs unattended.
   *Novelty + automation together: you now watch a self-running line for the
   first time. Goal: a fully hands-off metal→component line.*
4. **Electronics.** Kiln → Silicon/Glass, Electronics Fab → Circuit; the
   subsystems need Circuits and Glass. *Novelty: the electronics sub-tree.
   Automation: the **Survey Drone** works the Wreck and the **Fitter Drone** runs
   the parts line.*
5. **Chemistry.** Ice Mine → Water → **Electrolysis** → H₂ + O₂ → **Chem
   Reactor** → Fuel (the deliberate bottleneck). *Automation: the **Tanker
   Drone** tames the liquid/fuel logistics.*
6. **Liftoff.** The **Assembler** builds Engine, Hull, Avionics, Life-Support and
   Heat-Shield from Components, Circuits, Glass and Water (recipe choice — load
   for the part you want). Grind Fuel. Let the **Cargo Drone** carry finished
   subsystems straight into the **Rocket**; once all five subsystems + three Fuel
   are in, it `become`s **Escape**. *Win.*

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
