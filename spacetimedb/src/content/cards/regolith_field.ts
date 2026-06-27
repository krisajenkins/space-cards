import type { CardModule } from "./_types";
import { droneSlot, has } from "./_types";
import { GATHER } from "../durations";
import {
  NOOP,
  theWorker,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// A labour machine with no material input — the worker IS the input. A worker in
// the bay (required by verbReady) yields one Regolith; Effort is spent (one
// gather), a mechanical drone keeps gathering. Dealt at the start (a Mk I bay).
export const regolith_field: CardModule = {
  defId: "regolith_field",
  name: "Regolith Field",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [droneSlot(1)],
  produces: ["regolith"],
  opening: { station: 3 },
  resolver: {
    duration: () => GATHER,
    resolve: (ctx, holes) => {
      if (!theWorker(ctx, holes)) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: ["regolith"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "prospector",
    title: "Prospector",
    description:
      "You claw the first regolith from the lunar dust. It isn't much — but the moon has materials, and that's where it starts.",
    sort: 1,
    earned: (c) => has(c, "regolith"),
  },
};
