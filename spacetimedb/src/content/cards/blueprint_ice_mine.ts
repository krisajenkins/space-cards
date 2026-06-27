import type { CardModule } from "./_types";

export const blueprint_ice_mine: CardModule = {
  defId: "blueprint_ice_mine",
  name: "Blueprint: Ice Mine",
  category: "blueprint",
  build: { output: "ice_mine", cost: 3 },
  research: { order: 7, need: { power: 1 } },
};
