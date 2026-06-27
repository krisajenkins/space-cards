import type { CardModule } from "./_types";

// Mk IV retires hand-loading the Assembler. Threshold is 2, not 3: only five
// subsystems exist, so a 3-gate would leave the drone almost nothing to do.
export const blueprint_drone_4: CardModule = {
  defId: "blueprint_drone_4",
  name: "Blueprint: Drone Mk IV",
  category: "blueprint",
  build: { output: "drone_4", cost: 5, keep: true },
  research: {
    order: 14,
    chore: { of: ["subsystem"], count: 2 },
    requires: ["blueprint_drone_3"],
  },
};
