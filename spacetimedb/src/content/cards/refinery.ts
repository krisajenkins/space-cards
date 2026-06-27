import type { CardModule } from "./_types";
import { droneSlot, has, powered } from "./_types";
import { REFINE } from "../durations";
import { poweredOne } from "../../engine/verb-api";

// raw → Metal. The first power-gated machine; a Mk II bay. Owns "industrialist".
export const refinery: CardModule = {
  defId: "refinery",
  name: "Refinery",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [...powered(["raw"]), droneSlot(2)],
  produces: ["metal"],
  resolver: poweredOne(REFINE, "raw", "metal"),
  achievement: {
    achId: "industrialist",
    title: "Industrialist",
    description:
      "Your first refinery is ready to fire up - raw regolith in, pure metal out. And metal will open up possibilities...",
    sort: 8,
    earned: (c) => has(c, "refinery"),
  },
};
