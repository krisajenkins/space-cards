import type { CardModule } from "./_types";

export const heat_shield: CardModule = {
  defId: "heat_shield",
  name: "Heat Shield",
  category: "subsystem",
  subsystem: { order: 1, need: { component: 3, glass: 2 } },
};
