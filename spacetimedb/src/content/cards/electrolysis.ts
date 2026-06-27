import type { CardModule } from "./_types";
import { droneSlot, has, powered } from "./_types";
import { ELECTROLYSIS } from "../durations";
import {
  NOOP,
  count,
  hasPower,
  take,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// Water + Power → Hydrogen + Oxygen. A DUAL-output producer feeding one shared,
// capped tray — safe ONLY because H2 and O2 are produced 1:1 here and consumed
// 1:1 by their sole consumer (the Chem Reactor), so neither piles up behind the
// other; the even cap (6) packs the 2-per-cycle output cleanly. If you ever add a
// recipe consuming H2/O2 alone or in a non-1:1 ratio, give this the Kiln's
// demand-aware emit. A Mk III bay.
export const electrolysis: CardModule = {
  defId: "electrolysis",
  name: "Electrolysis",
  category: "station",
  isVerb: true,
  outputCap: 6,
  slots: [...powered(["water"]), droneSlot(3)],
  produces: ["hydrogen", "oxygen"],
  resolver: {
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
  achievement: {
    achId: "electrolysis",
    title: "Breaking Water",
    description:
      "A current cracks water into hydrogen and oxygen - the raw makings of rocket fuel, pried apart one molecule at a time.",
    sort: 14,
    earned: (c) => has(c, "hydrogen"),
  },
};
