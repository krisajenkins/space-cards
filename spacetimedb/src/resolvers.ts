import {
  REST,
  LUMBERJACK,
  CHOP,
  MARKET,
  HIRE,
  FOREST_GROWTH,
} from "./constants";
import type { Effects } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Verb behaviour ("code per verb"): duration + resolution decided at runtime
// from whatever is in the holes.
// ──────────────────────────────────────────────────────────────────────────
export const RESOLVERS: Record<
  string,
  {
    duration: (holes: any[]) => bigint;
    resolve: (ctx: any, holes: any[]) => Effects;
  }
> = {
  // You: no inputs, emits one Health per minute (capped on the card_def).
  you: {
    duration: () => REST,
    resolve: () => ({ consume: [], produce: ["health"], again: REST }),
  },

  // Forest: dual-mode. Either way a chop yields Wood, or a 10% Seed instead.
  //  - fed a Lumberjack: chop every minute, keep the Lumberjack.
  //  - fed Health: chop once (consuming it), plus a 1% chance of a Lumberjack.
  forest: {
    duration: (holes) => (holes[0]?.defId === "lumberjack" ? LUMBERJACK : CHOP),
    resolve: (ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      // 10% of chops throw up a Seed instead of Wood — plant it for a Forest.
      const produce = [ctx.random() < 0.1 ? "seed" : "wood"];
      if (input.defId === "lumberjack") {
        return { consume: [], produce, again: LUMBERJACK };
      }
      if (ctx.random() < 0.01) produce.push("lumberjack");
      return { consume: [input.id], produce, again: null };
    },
  },

  // Market: an inbox queue. Sells the wood at the head of the queue (lowest
  // slot) for a Coin each cycle, then re-fires to work through whatever else is
  // waiting — `again` drains the queue while `verbReady` stops it when empty.
  market: {
    duration: () => MARKET,
    resolve: (_ctx, holes) => {
      const input = holes[0];
      if (!input) return { consume: [], produce: [], again: null };
      return { consume: [input.id], produce: ["coin"], again: MARKET };
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
      again: null,
      become: "forest",
    }),
  },

  // Agency: a guaranteed Lumberjack for ten Coins — the deterministic path when
  // the Forest's 10% drop won't oblige. Eats every coin in its holes (all ten
  // are required, so a run only fires once full) and hands back one Lumberjack.
  agency: {
    duration: () => HIRE,
    resolve: (_ctx, holes) => ({
      consume: holes.map((h: any) => h.id),
      produce: ["lumberjack"],
      again: null,
    }),
  },
};
