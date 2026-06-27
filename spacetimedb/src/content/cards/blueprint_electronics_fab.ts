import type { CardModule } from "./_types";

export const blueprint_electronics_fab: CardModule = {
  defId: "blueprint_electronics_fab",
  name: "Blueprint: Electronics Fab",
  category: "blueprint",
  build: { output: "electronics_fab", cost: 4 },
  research: { order: 8, need: { silicon: 1, power: 1 } },
};
