import { spawnCard, spawnOutput } from "../engine/engine";
import { relayout } from "../engine/layout";
import {
  OPENING_BOARD_NAME,
  OPENING_STATIONS,
  OPENING_OUTPUTS,
} from "../content/opening";
import type { Ctx, Card, Board } from "./types";

// Deal a fresh crash-site board for `userId`: the board, the player's membership,
// the opening tableau, and a final relayout. Returns the new board.
//
// Lives in its own module (NOT re-exported by index.ts) because both the
// `newGame` reducer and `onConnect`'s anonymous auto-deal need it: it can't sit
// in reducers.ts, whose `export *` would surface this plain function as a
// top-level module export and trip SpacetimeDB's "not a spacetime export" check.
export function dealOpening(ctx: Ctx, userId: bigint): Board {
  const b = ctx.db.board.insert({
    id: 0n,
    name: OPENING_BOARD_NAME,
    owner: userId,
    createdAt: ctx.timestamp,
  });
  ctx.db.boardMember.insert({
    id: 0n,
    boardId: b.id,
    userId,
    role: { tag: "player" },
  });

  // Deal the opening tableau (content/opening.ts). Spread the stations along the
  // top at rough coordinates — relayout tidies them (size-aware, overlap-free,
  // accounting for full footprints) below. Track the spawned cards by defId so
  // the starting outputs can land in the right station's tray.
  const dealt = new Map<string, Card>();
  OPENING_STATIONS.forEach((defId, i) => {
    dealt.set(
      defId,
      spawnCard(ctx, b.id, defId, 40 + (i % 2) * 260, (i / 2) * 40),
    );
  });

  // Starting outputs: seed each into its host station's tray (produced-but-
  // uncollected, exactly as a normal cycle leaves it — each is its own card row,
  // there is no quantity).
  for (const { def, into } of OPENING_OUTPUTS) {
    const host = dealt.get(into);
    if (host) spawnOutput(ctx, b.id, def, host.id);
  }

  relayout(ctx, b.id);
  return b;
}
