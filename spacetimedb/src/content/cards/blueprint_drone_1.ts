import type { CardModule } from "./_types";

// Drone blueprints are `keep` so the player can build a whole fleet from one
// manual. Mk I (gatherers + Printer) is the first genuinely useful unlock — it
// outranks the Solar Array, handed over as soon as you've gathered raw a few times.
export const blueprint_drone_1: CardModule = {
  defId: "blueprint_drone_1",
  name: "Blueprint: Drone Mk I",
  category: "blueprint",
  build: { output: "drone_1", cost: 2, keep: true },
  research: { order: 0, chore: { of: ["raw"], count: 3 } },
};
