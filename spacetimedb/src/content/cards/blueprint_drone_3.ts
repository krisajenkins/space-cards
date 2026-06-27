import type { CardModule } from "./_types";

// Mk III retires the tier-3 electronics/chemistry line.
export const blueprint_drone_3: CardModule = {
  defId: "blueprint_drone_3",
  name: "Blueprint: Drone Mk III",
  category: "blueprint",
  build: { output: "drone_3", cost: 4, keep: true },
  research: {
    order: 10,
    chore: { of: ["circuit", "hydrogen", "oxygen", "fuel"], count: 3 },
    requires: ["blueprint_drone_2"],
  },
};
