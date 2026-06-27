import type { CardModule } from "./_types";

export const blueprint_assembler: CardModule = {
  defId: "blueprint_assembler",
  name: "Blueprint: Assembler",
  category: "blueprint",
  build: { output: "assembler", cost: 5 },
  research: {
    order: 12,
    need: { component: 1, circuit: 1, glass: 1, water: 1 },
  },
};
