import type { CardModule } from "./_types";

export const blueprint_chem_reactor: CardModule = {
  defId: "blueprint_chem_reactor",
  name: "Blueprint: Chem Reactor",
  category: "blueprint",
  build: { output: "chem_reactor", cost: 5 },
  research: { order: 11, need: { hydrogen: 1, oxygen: 1, power: 1 } },
};
