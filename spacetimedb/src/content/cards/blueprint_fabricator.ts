import type { CardModule } from "./_types";

export const blueprint_fabricator: CardModule = {
  defId: "blueprint_fabricator",
  name: "Blueprint: Fabricator",
  category: "blueprint",
  build: { output: "fabricator", cost: 3 },
  research: { order: 4, need: { metal: 1, power: 1 } },
};
