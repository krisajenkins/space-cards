import type { CardModule } from "./_types";
import { has } from "./_types";
import { droneResolver } from "../../engine/verb-api";

export const drone_4: CardModule = {
  defId: "drone_4",
  name: "Drone Mk IV",
  category: "drone",
  isVerb: true,
  outputCap: 0,
  droneLevel: 4,
  resolver: droneResolver,
  achievement: {
    achId: "drone_4",
    title: "Full Automation",
    description:
      "Your final drone design - the peak of everything you've learned while trying to survive. The whole base can run lights-out while you turn your eyes to the launch pad.",
    sort: 18,
    earned: (c) => has(c, "drone_4"),
  },
};
