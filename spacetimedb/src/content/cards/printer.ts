import type { CardModule } from "./_types";
import { droneSlot, has, inbox } from "./_types";
import { PRINT } from "../durations";
import { NOOP, inputs, workerCost, workerIsDrone } from "../../engine/verb-api";

// The crude bootstrap Component press — raw → Component, no power, slow. The sole
// Component source (the Fabricator presses Fuel Tanks instead). An inbox queue
// that drains one per cycle; `ready` guards against firing with a worker but no
// raw (the raw holes are optional, so the generic check can't). Salvaged from the
// Wreck, not dealt — so its first tally is the salvage moment.
export const printer: CardModule = {
  defId: "printer",
  name: "Printer",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [...inbox(0, 3, ["raw"]), droneSlot(1)],
  produces: ["component"],
  resolver: {
    duration: () => PRINT,
    ready: (ctx, holes) => inputs(ctx, holes).length > 0,
    resolve: (ctx, holes) => {
      const input = inputs(ctx, holes)[0];
      if (!input) return NOOP;
      return {
        consume: [input.id, ...workerCost(ctx, holes)],
        produce: ["component"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "salvage_printer",
    title: "Spare Parts",
    description:
      "You manage to salvage a working printer from the wreckage. Now you can make tools, and that could give you a fighting chance...",
    sort: 2,
    earned: (c) => has(c, "printer"),
  },
};
