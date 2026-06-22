import {
  DRONE_TICK,
  EFFORT,
  SOLAR,
  GATHER,
  PRINT,
  BUILD,
  RESEARCH,
  REFINE,
  FABRICATE,
  KILN,
  ELECTRONICS,
  MINE_ICE,
  ELECTROLYSIS,
  CHEM,
  ASSEMBLE,
  LAUNCH,
} from "../platform/constants";
import type { Ctx, Card, Effects, SlottedCard } from "../platform/types";
import {
  BUILDS,
  SUBSYSTEMS,
  RESEARCH_TREE,
  WRECK_CONTENTS,
  recipeSatisfied,
  type Recipe,
} from "../content/recipes";

// ──────────────────────────────────────────────────────────────────────────
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes. `resolve` also receives the verb card itself,
// so a hole-less verb (a drone) can still find its own id / board.
// ──────────────────────────────────────────────────────────────────────────
export type Resolver = {
  duration: (holes: SlottedCard[]) => bigint;
  resolve: (ctx: Ctx, holes: SlottedCard[], verb: Card) => Effects;
  // Optional readiness override, consulted by verbReady on top of the generic
  // "required holes filled" check. It's what lets one verb offer a CHOICE of
  // recipes, or gate a powered machine on having BOTH power and an input. Omit
  // for standard verbs.
  ready?: (ctx: Ctx, holes: SlottedCard[], verb: Card) => boolean;
};

const NOOP: Effects = { consume: [], produce: [], again: false };

// ──────────────────────────────────────────────────────────────────────────
// Small hole helpers. A "hole" is a card slotted into a verb; we routinely ask
// what category it is, count a category, or take N ids of one to consume.
// ──────────────────────────────────────────────────────────────────────────
function catOf(ctx: Ctx, card: Card): string {
  const d = ctx.db.cardDef.defId.find(card.defId);
  return d ? d.category : "";
}
function count(ctx: Ctx, holes: SlottedCard[], cat: string): number {
  return holes.filter((h) => catOf(ctx, h) === cat).length;
}
function take(
  ctx: Ctx,
  holes: SlottedCard[],
  cat: string,
  n: number,
): bigint[] {
  return holes
    .filter((h) => catOf(ctx, h) === cat)
    .slice(0, n)
    .map((h) => h.id);
}
const hasPower = (holes: SlottedCard[]) =>
  holes.some((h) => h.defId === "power");

// The slotted INPUT cards — everything a verb actually consumes, excluding any
// drone sitting in its drone bay. Single-input stations (gatherers, the Printer)
// read `inputs(...)[0]`; without this filter a lone drone in the bay would be
// mistaken for the input and consumed.
const inputs = (ctx: Ctx, holes: SlottedCard[]): SlottedCard[] =>
  holes.filter((h) => catOf(ctx, h) !== "drone");

// The worker in a machine's bay — an Effort (inert) or a mechanical drone (verb),
// both category "drone". `verbReady` already gates a bayed machine on having one,
// so resolvers just need to know how to treat it: a mechanical drone is KEPT and
// lets the machine re-fire continuously; an Effort is CONSUMED (one cycle, then
// the machine idles until you place fresh labour). `workerCost` returns the ids to
// consume (the Effort, or nothing for a drone); `workerIsDrone` is the re-fire flag.
const theWorker = (ctx: Ctx, holes: SlottedCard[]): SlottedCard | undefined =>
  holes.find((h) => catOf(ctx, h) === "drone");
function workerIsDrone(ctx: Ctx, holes: SlottedCard[]): boolean {
  const w = theWorker(ctx, holes);
  if (!w) return false;
  const d = ctx.db.cardDef.defId.find(w.defId);
  return !!d && d.isVerb;
}
const workerCost = (ctx: Ctx, holes: SlottedCard[]): bigint[] => {
  const w = theWorker(ctx, holes);
  return w && !workerIsDrone(ctx, holes) ? [w.id] : [];
};

// A power-gated transformer: one Power + one `inputCat` card per cycle → one
// `output`. Re-fires while both are present; consuming the Power leaves the
// required power hole empty, so it idles the moment power runs out (the Power
// gate) and resumes when a Hauler — or the player — re-feeds it.
function poweredOne(dur: bigint, inputCat: string, output: string): Resolver {
  return {
    duration: () => dur,
    // The worker is required by verbReady; here we just need power + the input.
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, inputCat) > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, inputCat, 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      return {
        consume: [...power, ...input, ...workerCost(ctx, holes)],
        produce: [output],
        again: workerIsDrone(ctx, holes),
      };
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// The recipe DATA (BUILDS / SUBSYSTEMS / RESEARCH_TREE / WRECK_CONTENTS) lives
// in ../content/recipes.ts — "what the game is", apart from this behaviour code.
// The engine below READS those tables. recipeSatisfied is generic over a `count`
// helper, so we pass our local `count` (defined above) at each call site.
// ──────────────────────────────────────────────────────────────────────────
const subsystemSatisfied = (ctx: Ctx, holes: SlottedCard[], r: Recipe) =>
  recipeSatisfied(ctx, holes, r, count);

// ──────────────────────────────────────────────────────────────────────────
// Research bench logic. The RESEARCH_TREE data (which blueprint unlocks on which
// prerequisites) lives in ../content/recipes.ts; the code that reads the board's
// lifetime card history to pick the next earned blueprint lives here.
// ──────────────────────────────────────────────────────────────────────────

// Has this exact card ever been created on the board? (Discovered blueprints are
// not offered again.) The full two-column key is the safe form of the index —
// see the my_card_history view note on the bare-prefix panic under SDK 2.5.0.
function discovered(ctx: Ctx, boardId: bigint, defId: string): boolean {
  const h = [...ctx.db.cardHistory.by_board_def.filter([boardId, defId])][0];
  return !!h && h.count > 0n;
}

// Lifetime count of every card in `category` ever created on the board. Iterate-
// and-filter (category isn't indexed; per-board history is small).
function histCategory(ctx: Ctx, boardId: bigint, category: string): bigint {
  let total = 0n;
  for (const h of ctx.db.cardHistory.iter()) {
    if (h.boardId !== boardId) continue;
    const d = ctx.db.cardDef.defId.find(h.defId);
    if (d && d.category === category) total += h.count;
  }
  return total;
}

// The blueprint the Research bench should hand over next: the first entry in
// priority order that the board has qualified for but not yet discovered. Null
// when there's nothing left to research (the `ready` hook then keeps the bench
// idle rather than spending Effort for nothing).
function researchTarget(ctx: Ctx, boardId: bigint): string | null {
  for (const r of RESEARCH_TREE) {
    const bp = `blueprint_${r.target}`;
    if (discovered(ctx, boardId, bp)) continue;
    // An explicit prerequisite ladder (the drone Marks): every listed blueprint
    // must already be discovered, so e.g. Mk IV is never offered before Mk III —
    // the category needs alone can be met out of order.
    if ((r.requires ?? []).some((req) => !discovered(ctx, boardId, req)))
      continue;
    const ok = Object.entries(r.need).every(
      ([cat, n]) => histCategory(ctx, boardId, cat) >= BigInt(n),
    );
    if (ok) return bp;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Drones. A drone is a hole-less verb that lives in a machine's DRONE BAY (a
// slot with droneLevel > 0). Bound to that one host, every tick it tries to feed
// one of the host's empty INPUT holes by pulling a card the host accepts from the
// table or from any output tray — moving it straight in. Because each drone only
// ever feeds its own host, two drones never fight over the work the way roaming
// couriers did. Most bays take a blind feeder; the Assembler is the one host that
// needs intent (it picks its own recipe), so a Mk IV there runs a targeted variant
// — see assemblerDroneResolve. This single behaviour subsumes the old catalyst +
// courier shapes.
// ──────────────────────────────────────────────────────────────────────────

// The first card on the board this host could take in `accepts`. Prefers loose
// tabletop cards over ones sitting in an output tray: two passes, tabletop first,
// outputs only as a fallback. Never a verb card (a dormant machine/drone waiting
// to be planted) — only resources.
function firstLoot(ctx: Ctx, boardId: bigint, accepts: string[]): Card | null {
  const acceptable = (c: Card): boolean => {
    const def = ctx.db.cardDef.defId.find(c.defId);
    if (!def || def.isVerb) return false;
    return accepts.includes(c.defId) || accepts.includes(def.category);
  };
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag === "tabletop" && acceptable(c)) return c;
  }
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag === "output" && acceptable(c)) return c;
  }
  return null;
}

// One drone move: shuttle `cardId` from wherever it sits into the host's hole at
// `slotIndex`. `again: true` keeps the drone ticking; completeSituation's generic
// `moves` handling does the relocation and its side-effects (un-stalling the
// source tray, autostarting the host once the hole is filled).
function feedMove(cardId: bigint, hostId: bigint, slotIndex: number): Effects {
  return {
    consume: [],
    produce: [],
    again: true,
    moves: [
      {
        cardId,
        to: { tag: "slotted", value: { verbCardId: hostId, slotIndex } },
      },
    ],
  };
}

// The host's currently-slotted cards (its filled holes + the drone in its bay).
function hostHoles(ctx: Ctx, hostId: bigint, boardId: bigint): SlottedCard[] {
  return [...ctx.db.card.boardId.filter(boardId)].filter(
    (c): c is SlottedCard =>
      c.location.tag === "slotted" && c.location.value.verbCardId === hostId,
  );
}

// One service tick for a drone (`verb`) sitting in some host's bay: find the
// host's first empty input hole and a card to drop into it. The actual relocation
// + its side-effects (un-stalling the source tray, autostarting the host) are run
// by completeSituation's generic `moves` handling.
function droneResolve(ctx: Ctx, verb: Card): Effects {
  const idle: Effects = { consume: [], produce: [], again: false };
  const tick: Effects = { consume: [], produce: [], again: true };
  // Only a drone slotted into a live machine works; on the table (no host) it
  // falls dormant until it's dropped into a bay. A live host is one ON the table
  // OR HOUSED in a warehouse — housing is pure layout relief, the machine keeps
  // producing inside its warehouse, so its bay drone must keep feeding it. (A host
  // that is itself slotted/output isn't a running machine, so the drone idles.)
  if (verb.location.tag !== "slotted") return idle;
  const host = ctx.db.card.id.find(verb.location.value.verbCardId);
  if (!host) return idle;
  if (host.location.tag !== "tabletop" && host.location.tag !== "housed")
    return idle;

  // The Assembler is a CHOICE machine: a blind feed would load whatever's lying
  // around and build a random (or already-owned) subsystem. A Mk IV drone there
  // instead targets the subsystems we still need — see assemblerDroneResolve.
  if (host.defId === "assembler") return assemblerDroneResolve(ctx, host);

  const holes = hostHoles(ctx, host.id, host.boardId);
  // The Workshop keeps its hands off until you've chosen a blueprint: no pulling
  // Components in for a build you haven't committed to. (You always pick the
  // blueprint — the feeder skips the blueprint hole itself; this just makes the
  // drone wait for one to appear before it bothers loading anything.)
  if (
    host.defId === "workshop" &&
    !holes.some((c) => catOf(ctx, c) === "blueprint")
  )
    return tick;
  const filled = new Set(holes.map((c) => c.location.value.slotIndex));
  // Input holes only (droneLevel 0); never the bay itself. Also never a blueprint
  // hole: a Mk I+ drone may crank the Workshop and load its Components, but choosing
  // WHAT to build stays a player decision — the drone never grabs a blueprint. (The
  // Workshop is the only machine with a blueprint hole; the Assembler choice is
  // handled separately by assemblerDroneResolve above.)
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0 && !s.accepts.includes("blueprint"))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  for (const sl of slots) {
    if (filled.has(sl.slotIndex)) continue;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    if (!loot) continue;
    return feedMove(loot.id, host.id, sl.slotIndex);
  }
  return tick; // nothing to feed right now — keep watching
}

// Does the board already hold a card of `defId` (anywhere — table, tray, or
// slotted)? Used both to decide which rocket subsystems the Assembler drone still
// owes us (the Rocket wants one of each) and to gate the Wreck's salvaged machines
// (you only pull a Printer/Workshop while you don't already have one).
function boardHas(ctx: Ctx, boardId: bigint, defId: string): boolean {
  for (const c of ctx.db.card.boardId.filter(boardId))
    if (c.defId === defId) return true;
  return false;
}

// The Wreck's manifest (WRECK_CONTENTS) — the fixed list of what the crash
// buried — is authored data, so it lives in ../content/recipes.ts; the cursor
// logic that draws from it (below) is behaviour and stays here.

// Lifetime count of one defId created on this board (the full two-column key — the
// bare-prefix form panics; see the discovered() note). Only the Wreck ever makes
// any of its manifest cards, so the sum of these counts is exactly how many items
// it has handed out — our cursor into WRECK_CONTENTS.
function histDef(ctx: Ctx, boardId: bigint, defId: string): bigint {
  const h = [...ctx.db.cardHistory.by_board_def.filter([boardId, defId])][0];
  return h ? h.count : 0n;
}

// What the Wreck yields this scavenge — the next manifest item, or `null` once the
// list is exhausted (the resolver then collapses it into an Exhausted Wreck husk).
function wreckDrop(ctx: Ctx, boardId: bigint): string | null {
  let drawn = 0;
  for (const defId of new Set(WRECK_CONTENTS))
    drawn += Number(histDef(ctx, boardId, defId));
  return WRECK_CONTENTS[drawn] ?? null;
}

// The next subsystem a Mk IV Assembler drone should build: the first recipe whose
// output we don't already have. Null once we hold all five (the drone then idles).
function nextSubsystem(ctx: Ctx, boardId: bigint): Recipe | null {
  for (const r of SUBSYSTEMS) if (!boardHas(ctx, boardId, r.output)) return r;
  return null;
}

// A Mk IV drone in the Assembler's bay. Unlike a generic feeder it can't just
// shovel parts in — the Assembler picks its recipe from whatever's loaded, so a
// blind drone would build duplicates or whatever happens to match first. Instead
// it chooses a subsystem we don't have yet and loads EXACTLY that recipe (plus
// Power), one card per tick; the Assembler's most-specific-first matcher then
// resolves to precisely that part. Goes quiet (an idle heartbeat) once the board
// holds all five subsystems, and picks back up if one is later spent.
function assemblerDroneResolve(ctx: Ctx, host: Card): Effects {
  // Like every bayed drone, never stop the heartbeat while we have a host — return
  // `tick` (again: true) when there's nothing to do, so the drone resumes the
  // instant a subsystem is spent (e.g. flown into the Rocket) and needs rebuilding.
  const tick: Effects = { consume: [], produce: [], again: true };
  const holes = hostHoles(ctx, host.id, host.boardId);
  const filled = new Set(holes.map((c) => c.location.value.slotIndex));
  const slots = [...ctx.db.slotDef.defId.filter(host.defId)]
    .filter((s) => s.droneLevel === 0)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const feedInto = (cat: string): Effects | null => {
    const sl = slots.find(
      (s) => !filled.has(s.slotIndex) && s.accepts.includes(cat),
    );
    if (!sl) return null;
    const loot = firstLoot(ctx, host.boardId, sl.accepts);
    return loot ? feedMove(loot.id, host.id, sl.slotIndex) : null;
  };

  // Power first — the Assembler stalls without it (and every recipe needs one).
  if (!hasPower(holes)) return feedInto("power") ?? tick;

  const target = nextSubsystem(ctx, host.boardId);
  if (!target) return tick; // we already hold all five subsystems — keep watching

  // Top each recipe category up to its required count, one card per tick. We feed
  // ONLY the categories this recipe lists, so the holes never satisfy a different
  // (more-specific) recipe by accident.
  for (const [cat, n] of Object.entries(target.need)) {
    if (count(ctx, holes, cat) >= n) continue;
    const move = feedInto(cat);
    if (move) return move;
  }
  return tick; // recipe fully loaded (or nothing to fetch) — let the Assembler fire
}

// ──────────────────────────────────────────────────────────────────────────
// The resolver table — one entry per verb defId.
// ──────────────────────────────────────────────────────────────────────────
export const RESOLVERS: Record<string, Resolver> = {
  // ── Tier 0: the crash site (hand-cranked, no power) ──────────────────────

  // Survivor: your own two hands. Emits one Effort per cycle, forever.
  survivor: {
    duration: () => EFFORT,
    resolve: () => ({ consume: [], produce: ["effort"], again: true }),
  },

  // Regolith Field: a labour machine with no material input — the worker IS the
  // input. A worker in the bay (required by verbReady) yields one Regolith;
  // Effort is spent (one gather), a mechanical drone keeps gathering.
  regolith_field: {
    duration: () => GATHER,
    resolve: (ctx, holes) => {
      if (!theWorker(ctx, holes)) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: ["regolith"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Wreck: the discovery node, holding a fixed manifest (WRECK_CONTENTS) — Scrap,
  // Salvage, and the only Printer + Workshop you'll get — handed out one item per
  // scavenge in order. When the manifest is spent wreckDrop returns null and the
  // Wreck collapses into an inert Exhausted Wreck husk (become). Effort scavenges
  // once; a drone keeps it worked — and burns through the contents faster.
  wreck: {
    duration: () => GATHER,
    resolve: (ctx, holes, verb) => {
      const worker = theWorker(ctx, holes);
      if (!worker) return NOOP;
      const drop = wreckDrop(ctx, verb.boardId);
      if (drop === null) {
        // Picked clean. Free a mechanical drone from the bay before the Wreck card
        // is replaced, or it would be left slotted into a card that no longer
        // exists; an Effort worker is just spent (workerCost). It lands where the
        // Wreck stood — relayout (run after the become) nudges it clear of the husk.
        const moves =
          workerIsDrone(ctx, holes) && verb.location.tag === "tabletop"
            ? [
                {
                  cardId: worker.id,
                  to: {
                    tag: "tabletop" as const,
                    value: {
                      x: verb.location.value.x,
                      y: verb.location.value.y,
                    },
                  },
                },
              ]
            : undefined;
        return {
          consume: workerCost(ctx, holes),
          produce: [],
          again: false,
          become: "exhausted_wreck",
          moves,
        };
      }
      return {
        consume: workerCost(ctx, holes),
        produce: [drop],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Printer: the crude bootstrap fabricator — raw → Component, no power, slow. An
  // inbox queue that drains one per cycle. `ready` guards against firing with a
  // worker but no raw (the raw holes are optional, so the generic check can't).
  printer: {
    duration: () => PRINT,
    ready: (ctx, holes) => inputs(ctx, holes).length > 0,
    resolve: (ctx, holes) => {
      const input = inputs(ctx, holes)[0];
      if (!input) return NOOP;
      return {
        consume: [input.id, ...workerCost(ctx, holes)],
        produce: ["component"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Workshop: hand-cranked constructor. Blueprint (selects the output) + enough
  // Components + a worker in its bay → the machine/drone, dormant in the tray to
  // be planted. The worker is Effort OR a Mk I+ drone (theWorker), but the drone
  // can never PICK the blueprint — the feeder skips blueprint holes, so you always
  // choose what to build. Cranked, not powered: works from turn one.
  workshop: {
    duration: () => BUILD,
    ready: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const worker = theWorker(ctx, holes);
      if (!bp || !worker) return false;
      const recipe = BUILDS[bp.defId];
      return !!recipe && count(ctx, holes, "component") >= recipe.cost;
    },
    resolve: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const worker = theWorker(ctx, holes);
      if (!bp || !worker) return NOOP;
      const recipe = BUILDS[bp.defId];
      if (!recipe) return NOOP;
      const comps = take(ctx, holes, "component", recipe.cost);
      if (comps.length < recipe.cost) return NOOP;
      // A kept blueprint is consumed-and-reproduced: it lands in the tray for the
      // player to re-slot, so the Workshop frees up for the next build. Effort is
      // spent (workerCost); a drone persists and re-fires — but with the blueprint
      // now gone from its hole it idles until you slot the next one.
      return {
        consume: [bp.id, ...workerCost(ctx, holes), ...comps],
        produce: recipe.keep ? [recipe.output, bp.defId] : [recipe.output],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Research: hand-cranked discovery bench. A WORKER-only bay (Effort, like the
  // Workshop) — one Effort yields the next blueprint you've earned (researchTarget
  // reads your card history). `ready` keeps it idle when nothing's left to learn,
  // so Effort is never spent for nothing. One blueprint per crank (Effort is no
  // drone → no re-fire), which paces discovery against your scarce early labour.
  // It also stays idle until the board has a Workshop: a blueprint is useless with
  // nothing to BUILD it at, so we don't spend the worker earning one you can't use
  // (the Workshop is salvaged from the Wreck — see wreckDrop). Same idle/ready
  // pattern as "nothing left to learn", so the Effort is never consumed when blocked.
  research: {
    duration: () => RESEARCH,
    ready: (ctx, _holes, verb) =>
      boardHas(ctx, verb.boardId, "workshop") &&
      researchTarget(ctx, verb.boardId) !== null,
    resolve: (ctx, holes, verb) => {
      if (!boardHas(ctx, verb.boardId, "workshop")) return NOOP;
      const target = researchTarget(ctx, verb.boardId);
      if (!target) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: [target],
        again: false,
      };
    },
  },

  // ── Power: the emitter that opens up every big machine ───────────────────
  solar_array: {
    duration: () => SOLAR,
    resolve: () => ({ consume: [], produce: ["power"], again: true }),
  },

  // ── Tier 1–3: power-gated production line ────────────────────────────────
  refinery: poweredOne(REFINE, "raw", "metal"),
  fabricator: poweredOne(FABRICATE, "metal", "component"),
  electronics_fab: poweredOne(ELECTRONICS, "silicon", "circuit"),

  // Kiln: raw → Silicon (or, 50% of the time, Glass). Powered.
  kiln: {
    duration: () => KILN,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, "raw") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, "raw", 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      const out = ctx.random() < 0.5 ? "silicon" : "glass";
      return {
        consume: [...power, ...input, ...workerCost(ctx, holes)],
        produce: [out],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Ice Mine: Power + a worker → Water (no material input besides Power).
  ice_mine: {
    duration: () => MINE_ICE,
    ready: (_ctx, holes) => hasPower(holes),
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      return {
        consume: [...power, ...workerCost(ctx, holes)],
        produce: ["water"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Electrolysis: Water + Power → Hydrogen + Oxygen.
  electrolysis: {
    duration: () => ELECTROLYSIS,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, "water") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const water = take(ctx, holes, "water", 1);
      if (power.length === 0 || water.length === 0) return NOOP;
      return {
        consume: [...power, ...water, ...workerCost(ctx, holes)],
        produce: ["hydrogen", "oxygen"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Chem Reactor: Hydrogen + Oxygen + Power → Fuel. The late bottleneck (slow,
  // and the only path to the Fuel the Rocket burns).
  chem_reactor: {
    duration: () => CHEM,
    ready: (ctx, holes) =>
      hasPower(holes) &&
      count(ctx, holes, "hydrogen") > 0 &&
      count(ctx, holes, "oxygen") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const h2 = take(ctx, holes, "hydrogen", 1);
      const o2 = take(ctx, holes, "oxygen", 1);
      if (power.length === 0 || h2.length === 0 || o2.length === 0) return NOOP;
      return {
        consume: [...power, ...h2, ...o2, ...workerCost(ctx, holes)],
        produce: ["fuel"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // Assembler: components → a rocket Subsystem. Recipe choice (`ready` hook):
  // whichever subsystem's ingredients you've loaded, most-specific-first.
  assembler: {
    duration: () => ASSEMBLE,
    ready: (ctx, holes) =>
      hasPower(holes) &&
      SUBSYSTEMS.some((r) => subsystemSatisfied(ctx, holes, r)),
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      const recipe = SUBSYSTEMS.find((r) => subsystemSatisfied(ctx, holes, r));
      if (!recipe) return NOOP;
      const consume = [...power, ...workerCost(ctx, holes)];
      for (const [cat, n] of Object.entries(recipe.need))
        consume.push(...take(ctx, holes, cat, n));
      return {
        consume,
        produce: [recipe.output],
        again: workerIsDrone(ctx, holes),
      };
    },
  },

  // ── Liftoff ──────────────────────────────────────────────────────────────
  // Rocket: all five Subsystems + three Fuel (all required holes) → it fires
  // and metamorphoses into Escape where it stood. One-shot. You're home.
  rocket: {
    duration: () => LAUNCH,
    resolve: (ctx, holes) => ({
      // Consume the loaded craft (subsystems + fuel) plus an Effort worker if
      // that's who pressed the button; a mechanical Mk IV in the bay is left be
      // (the launchpad becomes Escape and the drone simply goes with it).
      consume: [
        ...inputs(ctx, holes).map((h) => h.id),
        ...workerCost(ctx, holes),
      ],
      produce: [],
      again: false,
      become: "escape",
    }),
  },

  // ── The automation layer: drones ─────────────────────────────────────────
  // One generic behaviour per Mk; the level is enforced by the host's bay, not
  // here. Each ticks every DRONE_TICK while bayed and feeds its host.
  drone_1: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_2: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_3: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
  drone_4: {
    duration: () => DRONE_TICK,
    resolve: (ctx, _h, verb) => droneResolve(ctx, verb),
  },
};
