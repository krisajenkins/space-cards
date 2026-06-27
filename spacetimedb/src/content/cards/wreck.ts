import type { CardModule } from "./_types";
import { droneSlot, has } from "./_types";
import { GATHER } from "../durations";
import {
  NOOP,
  theWorker,
  wreckDrop,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// The discovery node, holding a fixed manifest (wreckManifest) — Scrap, Salvage,
// and the only Printer + Workbench you'll get — handed out one item per scavenge
// in order. When the manifest is spent wreckDrop returns null and the Wreck
// collapses into an inert Exhausted Wreck husk (become). Effort scavenges once; a
// drone keeps it worked — and burns through the contents faster. Dealt at the
// start (a Mk I bay). The manifest is intrinsic to the Wreck, so it lives here.
export const wreck: CardModule = {
  defId: "wreck",
  name: "Wreck",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [droneSlot(1)],
  becomes: "exhausted_wreck",
  opening: { station: 2 },
  // A fixed, ORDERED list (with repeats), drawn front-to-back, so the opening
  // ramps the same every game — retune by editing this list.
  wreckManifest: [
    "scrap",
    "salvage",
    "printer", // make Components by hand
    "scrap",
    "workbench", // build from blueprints
    "salvage",
    "scrap",
    "salvage",
    "scrap",
    "scrap",
  ],
  resolver: {
    duration: () => GATHER,
    resolve: (ctx, holes, verb) => {
      const worker = theWorker(ctx, holes);
      if (!worker) return NOOP;
      const drop = wreckDrop(ctx, verb.boardId);
      if (drop === null) {
        // Picked clean. Free a mechanical drone from the bay before the Wreck card
        // is replaced, or it would be left slotted into a card that no longer
        // exists; an Effort worker is just spent (workerCost). It lands where the
        // Wreck stood — relayout (run after the become) nudges it clear of the husk.
        const moves =
          workerIsDrone(ctx, holes) && verb.location.tag === "tabletop"
            ? [
                {
                  cardId: worker.id,
                  to: {
                    tag: "tabletop" as const,
                    value: {
                      x: verb.location.value.x,
                      y: verb.location.value.y,
                    },
                  },
                },
              ]
            : undefined;
        return {
          consume: workerCost(ctx, holes),
          produce: [],
          again: false,
          become: "exhausted_wreck",
          moves,
        };
      }
      return {
        consume: workerCost(ctx, holes),
        produce: [drop],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "wreck_exhausted",
    title: "Picked Clean",
    description:
      "You've stripped the wreck to its bones - there's nothing left to scavenge. From here, everything you build comes from your own effort and industry.",
    sort: 4,
    earned: (c) => has(c, "exhausted_wreck"),
  },
};
