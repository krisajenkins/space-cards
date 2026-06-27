import type { CardModule } from "./_types";
import { droneSlot, has, powered } from "./_types";
import { FABRICATE } from "../durations";
import { poweredOne } from "../../engine/verb-api";

// Metal + Power → Fuel Tank. NOT a second Component source — it presses Metal into
// the tanks the Chem Reactor cans Fuel into, keeping the smelting line meaningful
// up to liftoff. A Mk II bay. The "fabricator" milestone keys on the Fuel Tank.
export const fabricator: CardModule = {
  defId: "fabricator",
  name: "Fabricator",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [...powered(["metal"]), droneSlot(2)],
  produces: ["fuel_tank"],
  resolver: poweredOne(FABRICATE, "metal", "fuel_tank"),
  achievement: {
    achId: "fabricator",
    title: "The Production Line",
    description:
      "Metal feeds in and empty fuel tanks roll out, pressed and sealed. Now you have somewhere to put the fuel that flies you home.",
    sort: 9,
    earned: (c) => has(c, "fuel_tank"),
  },
};
