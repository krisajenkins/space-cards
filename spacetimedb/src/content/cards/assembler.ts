import type { CardModule } from "./_types";
import { droneSlot, has, inbox, slot } from "./_types";
import { ASSEMBLE } from "../durations";
import {
  NOOP,
  chosenSubsystem,
  hasPower,
  take,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// components → a rocket Subsystem. Recipe choice (`ready` hook): whichever
// subsystem's ingredients you've loaded, most-specific-first — but never one you
// already hold, so each part is built at most once (chosenSubsystem). `ready` and
// `resolve` both go through it so they agree. A Mk IV bay: Effort still cranks it,
// but a Mk IV drone targets the missing subsystems and loads each recipe exactly.
// Roomy inboxes, sized to the hungriest recipe per category.
export const assembler: CardModule = {
  defId: "assembler",
  name: "Assembler",
  category: "station",
  isVerb: true,
  outputCap: 4,
  slots: [
    slot(0, ["power"], true),
    ...inbox(1, 6, ["component"]),
    ...inbox(7, 4, ["circuit"]),
    ...inbox(11, 2, ["glass"]),
    slot(13, ["water"], false),
    droneSlot(4),
  ],
  resolver: {
    duration: () => ASSEMBLE,
    ready: (ctx, holes, verb) =>
      hasPower(holes) && chosenSubsystem(ctx, holes, verb.boardId) !== null,
    resolve: (ctx, holes, verb) => {
      const power = take(ctx, holes, "power", 1);
      if (power.length === 0) return NOOP;
      const recipe = chosenSubsystem(ctx, holes, verb.boardId);
      if (!recipe) return NOOP;
      const consume = [...power, ...workerCost(ctx, holes)];
      for (const [cat, n] of Object.entries(recipe.need))
        consume.push(...take(ctx, holes, cat, n));
      return {
        consume,
        produce: [recipe.output],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "assembler",
    title: "The Shipyard",
    description:
      "The Assembler stands ready. For the first time the parts you make aren't tools or supplies - they're pieces of the way home.",
    sort: 17,
    earned: (c) => has(c, "assembler"),
  },
};
