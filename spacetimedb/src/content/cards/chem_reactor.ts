import type { CardModule } from "./_types";
import { droneSlot, has, inbox, slot } from "./_types";
import { CHEM } from "../durations";
import {
  NOOP,
  count,
  hasPower,
  take,
  workerCost,
  workerIsDrone,
} from "../../engine/verb-api";

// Hydrogen + Oxygen + Power + a Fuel Tank → Fuel. The late bottleneck (slow, and
// the only path to the Fuel the Rocket burns). The Fuel Tank (Metal → Fabricator)
// is consumed one-per-Fuel — the fuel needs something to go in — so a dry smelting
// line stalls fuel production (a deliberate dependency). A Mk III bay.
export const chem_reactor: CardModule = {
  defId: "chem_reactor",
  name: "Chem Reactor",
  category: "station",
  isVerb: true,
  outputCap: 5,
  slots: [
    slot(0, ["power"], true),
    ...inbox(1, 2, ["hydrogen"]),
    ...inbox(3, 2, ["oxygen"]),
    ...inbox(5, 2, ["fuel_tank"]),
    droneSlot(3),
  ],
  produces: ["fuel"],
  resolver: {
    duration: () => CHEM,
    ready: (ctx, holes) =>
      hasPower(holes) &&
      count(ctx, holes, "hydrogen") > 0 &&
      count(ctx, holes, "oxygen") > 0 &&
      count(ctx, holes, "fuel_tank") > 0,
    resolve: (ctx, holes) => {
      const power = take(ctx, holes, "power", 1);
      const h2 = take(ctx, holes, "hydrogen", 1);
      const o2 = take(ctx, holes, "oxygen", 1);
      const tank = take(ctx, holes, "fuel_tank", 1);
      if (
        power.length === 0 ||
        h2.length === 0 ||
        o2.length === 0 ||
        tank.length === 0
      )
        return NOOP;
      return {
        consume: [...power, ...h2, ...o2, ...tank, ...workerCost(ctx, holes)],
        produce: ["fuel"],
        again: workerIsDrone(ctx, holes),
      };
    },
  },
  achievement: {
    achId: "chemist",
    title: "Rocket Fuel",
    description:
      "The first fuel is refined - the slowest, hardest step on the whole moon. The rocket will drink every drop.",
    sort: 16,
    earned: (c) => has(c, "fuel"),
  },
};
