import type { CardModule } from "./_types";
import { has } from "./_types";
import { droneResolver } from "../../engine/verb-api";

export const drone_3: CardModule = {
  defId: "drone_3",
  name: "Drone Mk III",
  category: "drone",
  isVerb: true,
  outputCap: 0,
  droneLevel: 3,
  resolver: droneResolver,
  achievement: {
    achId: "drone_3",
    title: "Night Crew",
    description:
      "Level three drones working while you don't. The grind has all but vanished - now you mostly watch a machine that runs itself.",
    sort: 15,
    earned: (c) => has(c, "drone_3"),
  },
};
