import type { CardModule } from "./_types";
import { droneSlot, has, powered } from "./_types";
import { ELECTRONICS } from "../durations";
import { poweredOne } from "../../engine/verb-api";

// Silicon → Circuit. A Mk III bay. The "electronics_fab" milestone keys on the
// first Circuit made.
export const electronics_fab: CardModule = {
  defId: "electronics_fab",
  name: "Electronics Fab",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [...powered(["silicon"]), droneSlot(3)],
  produces: ["circuit"],
  resolver: poweredOne(ELECTRONICS, "silicon", "circuit"),
  achievement: {
    achId: "electronics_fab",
    title: "First Circuits",
    description:
      "Silicon laid down into living circuitry. Crude and hand-fed, but it's the first real electronics for a hundred thousand miles.",
    sort: 13,
    earned: (c) => has(c, "circuit"),
  },
};
