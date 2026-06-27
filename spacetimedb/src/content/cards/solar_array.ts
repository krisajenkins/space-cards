import type { CardModule } from "./_types";
import { has } from "./_types";
import { SOLAR } from "../durations";

// The emitter that opens up every big machine: emits one Power per cycle, forever,
// no worker needed. Owns the "power_up" milestone (keyed on the first Power made).
export const solar_array: CardModule = {
  defId: "solar_array",
  name: "Solar Array",
  category: "station",
  isVerb: true,
  outputCap: 5,
  produces: ["power"],
  resolver: {
    duration: () => SOLAR,
    resolve: () => ({ consume: [], produce: ["power"], again: true }),
  },
  achievement: {
    achId: "power_up",
    title: "Let There Be Light",
    description:
      "Power of your own, at last. The base wakes up - and the heavy machines can finally run.",
    sort: 7,
    earned: (c) => has(c, "power"),
  },
};
