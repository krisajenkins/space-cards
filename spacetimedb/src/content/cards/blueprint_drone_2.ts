import type { CardModule } from "./_types";

// Mk II retires the tier-2 smelting/mining line. Any of its DISTINCTIVE outputs
// counts — Component is excluded (the Mk I Printer makes it from turn one, which
// would unlock Mk II prematurely). Requires Mk I (the Marks are a strict ladder).
export const blueprint_drone_2: CardModule = {
  defId: "blueprint_drone_2",
  name: "Blueprint: Drone Mk II",
  category: "blueprint",
  build: { output: "drone_2", cost: 3, keep: true },
  research: {
    order: 6,
    chore: { of: ["metal", "silicon", "glass", "water"], count: 3 },
    requires: ["blueprint_drone_1"],
  },
};
