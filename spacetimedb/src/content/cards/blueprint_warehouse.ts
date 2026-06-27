import type { CardModule } from "./_types";

// A mid-game layout-relief container, unlocked right after the Refinery (you have
// metal flowing by now). One-and-done blueprint.
export const blueprint_warehouse: CardModule = {
  defId: "blueprint_warehouse",
  name: "Blueprint: Warehouse",
  category: "blueprint",
  build: { output: "warehouse", cost: 3 },
  research: { order: 3, need: { metal: 1 } },
};
