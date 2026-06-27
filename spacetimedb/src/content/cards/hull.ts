import type { CardModule } from "./_types";

export const hull: CardModule = {
  defId: "hull",
  name: "Hull",
  category: "subsystem",
  subsystem: { order: 4, need: { component: 5 } },
};
