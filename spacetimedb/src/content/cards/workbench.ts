import type { CardModule } from "./_types";
import { droneSlot, has, inbox, slot } from "./_types";
import { BUILD } from "../durations";
import { builds } from "../recipes";
import {
  NOOP,
  catOf,
  count,
  take,
  theWorker,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// Hand-cranked constructor. Blueprint (selects the output) + enough Components + a
// worker in its bay → the machine/drone, dormant in the tray to be planted. The
// worker is Effort OR a Mk I+ drone (theWorker), but the drone can never PICK the
// blueprint — the feeder skips blueprint holes, so you always choose what to
// build. Cranked, not powered: works from turn one. Salvaged from the Wreck.
// Inbox is deep enough for the costliest build (the Rocket needs 6).
export const workbench: CardModule = {
  defId: "workbench",
  name: "Workbench",
  category: "station",
  isVerb: true,
  outputCap: 6,
  slots: [
    slot(0, ["blueprint"], true),
    ...inbox(2, 6, ["component"]),
    droneSlot(1),
  ],
  resolver: {
    duration: () => BUILD,
    ready: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const worker = theWorker(ctx, holes);
      if (!bp || !worker) return false;
      const recipe = builds()[bp.defId];
      return !!recipe && count(ctx, holes, "component") >= recipe.cost;
    },
    resolve: (ctx, holes) => {
      const bp = holes.find((h) => catOf(ctx, h) === "blueprint");
      const worker = theWorker(ctx, holes);
      if (!bp || !worker) return NOOP;
      const recipe = builds()[bp.defId];
      if (!recipe) return NOOP;
      const comps = take(ctx, holes, "component", recipe.cost);
      if (comps.length < recipe.cost) return NOOP;
      // A kept blueprint is consumed-and-reproduced: it lands in the tray for the
      // player to re-slot, so the Workbench frees up for the next build. Effort is
      // spent (workerCost); a drone persists and re-fires — but with the blueprint
      // now gone from its hole it idles until you slot the next one.
      return {
        consume: [bp.id, ...workerCost(ctx, holes), ...comps],
        produce: recipe.keep ? [recipe.output, bp.defId] : [recipe.output],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "salvage_workbench",
    title: "A Fighting Chance",
    description:
      "A workbench, dragged intact from the wreck. With this, could you build your way off the moon?",
    sort: 3,
    earned: (c) => has(c, "workbench"),
  },
};
