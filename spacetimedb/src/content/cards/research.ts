import type { CardModule } from "./_types";
import { WORKER, droneSlot } from "./_types";
import { RESEARCH } from "../durations";
import {
  NOOP,
  boardHas,
  researchTarget,
  workerCost,
} from "../../engine/verb-api";

// Hand-cranked discovery bench. A WORKER-only bay (Effort) — one Effort yields the
// next blueprint you've earned (researchTarget reads your card history). `ready`
// keeps it idle when nothing's left to learn, so Effort is never spent for
// nothing, and it stays idle until the board has a Workbench (a blueprint is
// useless with nothing to BUILD it at). One blueprint per crank (Effort is no
// drone → no re-fire). Dealt at the start. Owns the "researcher" milestone (the
// first blueprint of any kind can only come from this bench).
export const research: CardModule = {
  defId: "research",
  name: "Research",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [droneSlot(WORKER)],
  opening: { station: 1 },
  resolver: {
    duration: () => RESEARCH,
    ready: (ctx, _holes, verb) =>
      boardHas(ctx, verb.boardId, "workbench") &&
      researchTarget(ctx, verb.boardId) !== null,
    resolve: (ctx, holes, verb) => {
      if (!boardHas(ctx, verb.boardId, "workbench")) return NOOP;
      const target = researchTarget(ctx, verb.boardId);
      if (!target) return NOOP;
      return {
        consume: workerCost(ctx, holes),
        produce: [target],
        again: false,
      };
    },
  },
  achievement: {
    achId: "researcher",
    title: "Eureka",
    description:
      "You reverse-engineer your first blueprint. The long road home begins to take shape.",
    sort: 5,
    earned: (c) => [...c.keys()].some((k) => k.startsWith("blueprint_")),
  },
};
