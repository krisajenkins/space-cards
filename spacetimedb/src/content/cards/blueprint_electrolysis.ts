import type { CardModule } from "./_types";

export const blueprint_electrolysis: CardModule = {
  defId: "blueprint_electrolysis",
  name: "Blueprint: Electrolysis",
  category: "blueprint",
  build: { output: "electrolysis", cost: 4 },
  research: { order: 9, need: { water: 1, power: 1 } },
};
