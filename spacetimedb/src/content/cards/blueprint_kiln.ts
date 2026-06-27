import type { CardModule } from "./_types";

export const blueprint_kiln: CardModule = {
  defId: "blueprint_kiln",
  name: "Blueprint: Kiln",
  category: "blueprint",
  build: { output: "kiln", cost: 3 },
  research: { order: 5, need: { raw: 1, power: 1 } },
};
