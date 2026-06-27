import type { CardModule } from "./_types";

// A rocket subsystem (inert; an Assembler output, a Rocket input). Its `subsystem`
// recipe is what the Assembler builds it from; `order` is its slot in the
// most-specific-first match order.
export const engine: CardModule = {
  defId: "engine",
  name: "Engine",
  category: "subsystem",
  subsystem: { order: 3, need: { component: 4, circuit: 1 } },
};
