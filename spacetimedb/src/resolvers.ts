import {
  REST,
  LUMBERJACK,
  CHOP,
  MARKET,
  HIRE,
  FOREST_GROWTH,
  WORKER_HOLD,
} from "./constants";
import type { Ctx, Card, Effects, SlottedCard } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes. `resolve` also receives the verb card itself,
// so a hole-less verb (the Worker) can still find its own id / board.
// ──────────────────────────────────────────────────────────────────────────
export type Resolver = {
  duration: (holes: SlottedCard[]) => bigint;
  resolve: (ctx: Ctx, holes: SlottedCard[], verb: Card) => Effects;
  // Optional readiness override, consulted by verbReady on top of the generic
  // "required holes filled" check. It's what lets one verb offer a CHOICE of
  // recipes — the per-hole `required` flag can only AND holes together, so it
  // can't express "10 Coins OR 5 Coins + 3 Health". Omit for standard verbs.
  ready?: (ctx: Ctx, holes: SlottedCard[], verb: Card) => boolean;
};

// The Worker only collects from a couple of producing stations — the Forest and
// the Market. The verb-card skip below also keeps it clear of a Seed sitting in
// the Forest's tray (nothing accepts a `seed`, so it would carry one forever).
const WORKER_TAKES_FROM = ["forest", "market"];

// The first card sitting in an eligible output tray on this board — the Worker's
// loot. Eligibility is by the producing verb, not the card: only the Forest and
// the Market are fair game.
function firstOutboxCard(ctx: Ctx, boardId: bigint): Card | null {
  for (const c of ctx.db.card.boardId.filter(boardId)) {
    if (c.location.tag !== "output") continue;
    const producer = ctx.db.card.id.find(c.location.value.verbCardId);
    if (!producer || !WORKER_TAKES_FROM.includes(producer.defId)) continue;
    const def = ctx.db.cardDef.defId.find(c.defId);
    if (!def || def.isVerb) continue; // don't haul off a Seed it can't place
    return c;
  }
  return null;
}

// An empty hole, somewhere on the board, that accepts `card` — where the Worker
// hands off what it carries. Scans tabletop verbs (a tray-bound verb can't take
// inputs) and skips `excludeVerbId` (the Worker itself).
function firstOpenSlot(
  ctx: Ctx,
  boardId: bigint,
  card: Card,
  excludeVerbId: bigint,
): { verbCardId: bigint; slotIndex: number } | null {
  const cdef = ctx.db.cardDef.defId.find(card.defId);
  const cat = cdef ? cdef.category : "";
  const boardCards = [...ctx.db.card.boardId.filter(boardId)];
  for (const verb of boardCards) {
    if (verb.id === excludeVerbId || verb.location.tag !== "tabletop") continue;
    const def = ctx.db.cardDef.defId.find(verb.defId);
    if (!def || !def.isVerb) continue;
    const filled = new Set(
      boardCards
        .filter(
          (c): c is SlottedCard =>
            c.location.tag === "slotted" &&
            c.location.value.verbCardId === verb.id,
        )
        .map((c) => c.location.value.slotIndex),
    );
    const slots = [...ctx.db.slotDef.defId.filter(verb.defId)].sort(
      (a, b) => a.slotIndex - b.slotIndex,
    );
    for (const sl of slots) {
      if (filled.has(sl.slotIndex)) continue;
      if (sl.accepts.includes(card.defId) || sl.accepts.includes(cat))
        return { verbCardId: verb.id, slotIndex: sl.slotIndex };
    }
  }
  return null;
}

export const RESOLVERS: Record<string, Resolver> = {
  // You: no inputs, emits one Health per minute (capped on the card_def).
  you: {
    duration: () => REST,
    resolve: () => ({ consume: [], produce: ["health"], again: true }),
  },

  // Forest: dual-mode. Either way a chop yields Wood, or a 10% Seed instead.
  //  - fed a Lumberjack: chop every minute, keep the Lumberjack.
  //  - fed Health: chop once (consuming it), plus a 1% chance of a Lumberjack.
  forest: {
    duration: (holes) => (holes[0]?.defId === "lumberjack" ? LUMBERJACK : CHOP),
    resolve: (ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: false };
      // 10% of chops throw up a Seed instead of Wood — plant it for a Forest.
      const produce = [ctx.random() < 0.1 ? "seed" : "wood"];
      if (input.defId === "lumberjack") {
        return { consume: [], produce, again: true };
      }
      // During 10% of your chopping you'll meet a lumberjack
      if (ctx.random() < 0.01) produce.push("lumberjack");
      return { consume: [input.id], produce, again: false };
    },
  },

  // Market: an inbox queue. Sells the wood at the head of the queue (lowest
  // slot) for a Coin each cycle, then re-fires to work through whatever else is
  // waiting — `again` drains the queue while `verbReady` stops it when empty.
  market: {
    duration: () => MARKET,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: false };
      return { consume: [input.id], produce: ["coin"], again: true };
    },
  },

  // Seed: a no-hole, one-shot grower. It only runs once on the tabletop (see
  // maybeAutostart's tabletop gate), so a Seed sitting in the Forest's tray
  // waits, inert-looking, until the player plants it. After FOREST_GROWTH it
  // metamorphoses into a Forest where it stood (`become`).
  seed: {
    duration: () => FOREST_GROWTH,
    resolve: () => ({
      consume: [],
      produce: [],
      again: false,
      become: "forest",
    }),
  },

  // Worker: a hole-less courier that keeps a 2s heartbeat (like You, it re-fires
  // forever so it can act on its own). Each beat it either grabs one card from an
  // output tray and holds it (the card becomes slotted into the Worker), or — if
  // already carrying — hands that card to the first open, accepting hole it can
  // find. Carrying spans exactly one beat, so "steal → hold 2s → deposit". With
  // no tray to take it back from, the held card is locked in transit until the
  // Worker places it; if no hole will take it yet, it keeps holding.
  worker: {
    duration: () => WORKER_HOLD,
    resolve: (ctx, holes, verb) => {
      const carried = holes[0];
      if (carried) {
        const dest = firstOpenSlot(ctx, verb.boardId, carried, verb.id);
        if (!dest) return { consume: [], produce: [], again: true };
        return {
          consume: [],
          produce: [],
          again: true,
          moves: [
            {
              cardId: carried.id,
              to: {
                tag: "slotted",
                value: {
                  verbCardId: dest.verbCardId,
                  slotIndex: dest.slotIndex,
                },
              },
            },
          ],
        };
      }
      const loot = firstOutboxCard(ctx, verb.boardId);
      if (!loot) return { consume: [], produce: [], again: true };
      return {
        consume: [],
        produce: [],
        again: true,
        moves: [
          {
            cardId: loot.id,
            to: {
              tag: "slotted",
              value: { verbCardId: verb.id, slotIndex: 0 },
            },
          },
        ],
      };
    },
  },

  // Agency: a job board with two postings, gated by whichever recipe you fully
  // pay for. 5 Coins + 3 Health hires a Worker; 10 Coins hires a Lumberjack. Its
  // holes are all optional (10 coin + 3 health), so the generic gate alone would
  // fire it on the first coin — `ready` is what holds the run until a whole
  // recipe is on the table. Either hire lands dormant in the tray (a verb like
  // the Worker waits there, inert, until planted; see spawnOutput).
  agency: {
    duration: () => HIRE,
    ready: (_ctx, holes) => {
      const coins = holes.filter((h) => h.defId === "coin").length;
      const health = holes.filter((h) => h.defId === "health").length;
      return (coins >= 5 && health >= 3) || coins >= 10;
    },
    resolve: (_ctx, holes) => {
      const coins = holes.filter((h) => h.defId === "coin");
      const health = holes.filter((h) => h.defId === "health");
      // Worker first: if both recipes are somehow payable at once, the combined
      // hire wins (in practice autostart fires the moment one recipe completes,
      // so this only arbitrates the rare simultaneous case).
      if (coins.length >= 5 && health.length >= 3) {
        return {
          consume: [...coins.slice(0, 5), ...health.slice(0, 3)].map(
            (h) => h.id,
          ),
          produce: ["worker"],
          again: false,
        };
      }
      return {
        consume: coins.slice(0, 10).map((h) => h.id),
        produce: ["lumberjack"],
        again: false,
      };
    },
  },
};
