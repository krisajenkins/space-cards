import type { CardModule } from "./_types";

// An INERT buildable container (not a verb — no resolver, no holes, outputCap 0).
// The player houses factory cards inside it to shrink the endgame tabletop; a
// housed factory keeps fully running (see the `housed` Location and houseCard /
// unhouseCard). Built at the Workbench for 3 Components from blueprint_warehouse,
// earned at Research after the Refinery.
export const warehouse: CardModule = {
  defId: "warehouse",
  name: "Warehouse",
  category: "warehouse",
};
