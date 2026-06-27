import type { CardModule } from "./_types";

export const life_support: CardModule = {
  defId: "life_support",
  name: "Life Support",
  category: "subsystem",
  subsystem: { order: 0, need: { component: 2, circuit: 1, water: 1 } },
};
