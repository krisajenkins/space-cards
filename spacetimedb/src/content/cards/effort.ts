import type { CardModule } from "./_types";

// Effort IS a drone — the universal worker. It's the labour every non-emitter
// machine needs in its bay to run: an inert worker spent one cycle at a time
// (you, by hand), the manual counterpart to a reusable mechanical drone. Its
// WORKER-level (99) fits any bay, and the Research bench uses a WORKER-only bay
// so only Effort — never a mechanical drone — can crank it.
export const effort: CardModule = {
  defId: "effort",
  name: "Effort",
  category: "drone",
  droneLevel: 99,
};
