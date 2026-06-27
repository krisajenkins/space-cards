import type { CardModule } from "./_types";

export const avionics: CardModule = {
  defId: "avionics",
  name: "Avionics",
  category: "subsystem",
  subsystem: { order: 2, need: { circuit: 4 } },
};
