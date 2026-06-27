import type { CardModule } from "./_types";
import { droneSlot, has, slot } from "./_types";
import { MINE_ICE } from "../durations";
import {
  NOOP,
  hasPower,
  take,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// Power + a worker → Water (no material input besides Power). An emitter shape: a
// required Power hole, no input inbox. A Mk II bay. The "water" milestone keys on
// the first Water hauled.
export const ice_mine: CardModule = {
  defId: "ice_mine",
  name: "Ice Mine",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [slot(0, ["power"], true), droneSlot(2)],
  produces: ["water"],
  resolver: {
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
  achievement: {
    achId: "water",
    title: "Water from Stone",
    description:
      "You haul water from buried lunar ice. Drink it, split it, or burn it - almost everything that comes next begins here.",
    sort: 12,
    earned: (c) => has(c, "water"),
  },
};
