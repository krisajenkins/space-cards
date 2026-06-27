import type { CardModule } from "./_types";
import { has } from "./_types";
import { droneResolver } from "../../engine/verb-api";

export const drone_2: CardModule = {
  defId: "drone_2",
  name: "Drone Mk II",
  category: "drone",
  isVerb: true,
  outputCap: 0,
  droneLevel: 2,
  resolver: droneResolver,
  achievement: {
    achId: "drone_2",
    title: "Second Shift",
    description:
      "A basic drone was never going to be enough. Your latest model takes the harder chores off your hands, and the base hums a little louder.",
    sort: 11,
    earned: (c) => has(c, "drone_2"),
  },
};
