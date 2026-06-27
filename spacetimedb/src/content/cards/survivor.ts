import type { CardModule } from "./_types";
import { has } from "./_types";
import { EFFORT } from "../durations";

// Your own two hands. Emits one Effort per cycle, forever. Dealt first among the
// tier-0 stations, with three Effort already in its tray to crank the opening by
// hand. The story's opening beat (crash) keys on it, so it fires at the deal.
export const survivor: CardModule = {
  defId: "survivor",
  name: "Survivor",
  category: "avatar",
  isVerb: true,
  outputCap: 5,
  produces: ["effort"],
  opening: { station: 0, outputs: [{ def: "effort", count: 3 }] },
  resolver: {
    duration: () => EFFORT,
    resolve: () => ({ consume: [], produce: ["effort"], again: true }),
  },
  achievement: {
    achId: "crash",
    title: "Crash Landing",
    description:
      "Your ship is scattered across the regolith and you're the only thing still moving. No rescue is coming - the only way off this rock is the one you build. So get to work.",
    sort: 0,
    earned: (c) => has(c, "survivor"),
  },
};
