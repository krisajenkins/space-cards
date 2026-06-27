import type { CardModule } from "./_types";
import { has } from "./_types";
import { droneResolver } from "../../engine/verb-api";

// A hole-less verb (outputCap 0). Slotted into a machine's drone bay, it services
// that one machine: every tick it pulls a card the machine can use into an empty
// input hole. Level is a pure access gate — a higher-tier machine's slot demands a
// higher Mk. All four Marks share droneResolver; the level is enforced by the
// host's bay, not here.
export const drone_1: CardModule = {
  defId: "drone_1",
  name: "Drone Mk I",
  category: "drone",
  isVerb: true,
  outputCap: 0,
  droneLevel: 1,
  resolver: droneResolver,
  achievement: {
    achId: "automation",
    title: "Hands Off",
    description:
      "A drone to take over the grind. The work can do itself now, and your hands will be free for bigger things. But one drone may not be enough...",
    sort: 6,
    earned: (c) => has(c, "drone_1"),
  },
};
