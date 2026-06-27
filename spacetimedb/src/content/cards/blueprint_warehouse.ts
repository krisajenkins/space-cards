import type { CardModule } from "./_types";

// A mid-game layout-relief container. RETIRED from new games: it is no longer in
// the research tree (no `research` field), so the Research bench never offers it
// to any board going forward. The card_def + `build` recipe stay in the catalogue
// so games that already discovered this blueprint keep building warehouses, and
// warehouses already on a table keep working.
export const blueprint_warehouse: CardModule = {
  defId: "blueprint_warehouse",
  name: "Blueprint: Warehouse",
  category: "blueprint",
  build: { output: "warehouse", cost: 3 },
};
