import type { CardModule } from "./_types";

export const blueprint_rocket: CardModule = {
  defId: "blueprint_rocket",
  name: "Blueprint: Rocket",
  category: "blueprint",
  build: { output: "rocket", cost: 6 },
  research: { order: 13, need: { subsystem: 1, fuel: 1 } },
};
