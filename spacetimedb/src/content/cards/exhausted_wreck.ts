import type { CardModule } from "./_types";

// The picked-clean husk the Wreck collapses into once it's spent (a `become`
// target — see the wreck resolver). Inert and accepted by nothing: a dead
// monument on the table, not a resource. Its only job is to show the Wreck has
// run dry.
export const exhausted_wreck: CardModule = {
  defId: "exhausted_wreck",
  name: "Exhausted Wreck",
  category: "debris",
};
