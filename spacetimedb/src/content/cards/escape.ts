import type { CardModule } from "./_types";
import { has } from "./_types";

// The win token. The Rocket metamorphoses into Escape where it stood; the final
// milestone keys on its first (and only) appearance.
export const escape: CardModule = {
  defId: "escape",
  name: "Escape",
  category: "endgame",
  achievement: {
    achId: "escape",
    title: "Escape the Moon",
    description:
      "Ignition. The wreck and the grey dust fall away beneath you. At last you're going home.",
    sort: 20,
    earned: (c) => has(c, "escape"),
  },
};
