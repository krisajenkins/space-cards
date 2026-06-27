import type { CardModule } from "./_types";

export const blueprint_refinery: CardModule = {
  defId: "blueprint_refinery",
  name: "Blueprint: Refinery",
  category: "blueprint",
  build: { output: "refinery", cost: 3 },
  research: { order: 2, need: { raw: 1, power: 1 } },
};
