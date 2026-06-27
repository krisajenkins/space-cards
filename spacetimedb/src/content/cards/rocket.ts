import type { CardModule } from "./_types";
import { droneSlot, has, slot } from "./_types";
import { LAUNCH } from "../durations";
import { inputs, workerCost } from "../../engine/verb-api";

// The five subsystems define the launch_ready milestone; kept in step with the
// rocket's required holes and the Assembler's recipes.
const SUBSYSTEMS = [
  "engine",
  "hull",
  "avionics",
  "life_support",
  "heat_shield",
];

// All five Subsystems + three Fuel (every hole required) → it fires and
// metamorphoses into Escape where it stood. One-shot (reusable false, outputCap 0):
// it doesn't recycle. A Mk IV bay flies finished parts + fuel into the launchpad so
// the final assembly runs itself. Owns the "launch_ready" milestone (every
// subsystem built — the rocket whole and waiting).
export const rocket: CardModule = {
  defId: "rocket",
  name: "Rocket",
  category: "launchpad",
  isVerb: true,
  reusable: false,
  outputCap: 0,
  slots: [
    slot(0, ["engine"], true),
    slot(1, ["hull"], true),
    slot(2, ["avionics"], true),
    slot(3, ["life_support"], true),
    slot(4, ["heat_shield"], true),
    slot(5, ["fuel"], true),
    slot(6, ["fuel"], true),
    slot(7, ["fuel"], true),
    droneSlot(4),
  ],
  becomes: "escape",
  resolver: {
    duration: () => LAUNCH,
    resolve: (ctx, holes) => ({
      // Consume the loaded craft (subsystems + fuel) plus an Effort worker if
      // that's who pressed the button; a mechanical Mk IV in the bay is left be
      // (the launchpad becomes Escape and the drone simply goes with it).
      consume: [
        ...inputs(ctx, holes).map((h) => h.id),
        ...workerCost(ctx, holes),
      ],
      produce: [],
      again: false,
      become: "escape",
    }),
  },
  achievement: {
    achId: "launch_ready",
    title: "All Systems Go",
    description:
      "Engine, hull, avionics, life support, heat shield - every subsystem built. The rocket is whole and waiting.",
    sort: 19,
    earned: (c) => SUBSYSTEMS.every((s) => has(c, s)),
  },
};
