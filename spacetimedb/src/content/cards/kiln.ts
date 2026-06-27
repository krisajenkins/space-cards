import type { CardModule } from "./_types";
import { droneSlot, has, powered } from "./_types";
import { KILN } from "../durations";
import {
  NOOP,
  count,
  hasPower,
  take,
  trayCount,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// raw → Silicon or Glass, Powered. It bakes whichever of the two its own outbox
// currently holds the FEWER of (coin-toss on a tie). Because a consumed product
// (Silicon) stays low while an unwanted one (Glass) plateaus, this self-balances
// toward what's actually being used — and stops a dead product saturating the
// shared 5-slot tray and starving the other. See docs/ESCAPE_THE_MOON. A Mk II bay.
export const kiln: CardModule = {
  defId: "kiln",
  name: "Kiln",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [...powered(["raw"]), droneSlot(2)],
  produces: ["silicon", "glass"],
  resolver: {
    duration: () => KILN,
    ready: (ctx, holes) => hasPower(holes) && count(ctx, holes, "raw") > 0,
    resolve: (ctx, holes, verb) => {
      const power = take(ctx, holes, "power", 1);
      const input = take(ctx, holes, "raw", 1);
      if (power.length === 0 || input.length === 0) return NOOP;
      const silicon = trayCount(ctx, verb, "silicon");
      const glass = trayCount(ctx, verb, "glass");
      const out =
        silicon < glass
          ? "silicon"
          : glass < silicon
            ? "glass"
            : ctx.random() < 0.5
              ? "silicon"
              : "glass";
      return {
        consume: [...power, ...input, ...workerCost(ctx, holes)],
        produce: [out],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "kiln",
    title: "Trial by Fire",
    description:
      "You bake the regolith until it gives - silicon and glass wrung from grey dust. The electronics age opens up on a dead moon.",
    sort: 10,
    earned: (c) => has(c, "glass") || has(c, "silicon"),
  },
};
