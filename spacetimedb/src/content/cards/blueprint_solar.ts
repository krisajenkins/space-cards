import type { CardModule } from "./_types";

// `keep`: Power is the spine of the game — you scale it by building more arrays —
// so its manual is permanent rather than one-shot.
export const blueprint_solar: CardModule = {
  defId: "blueprint_solar",
  name: "Blueprint: Solar Array",
  category: "blueprint",
  build: { output: "solar_array", cost: 2, keep: true },
  research: { order: 1, need: { component: 1 } },
};
