import { t } from "spacetimedb/server";
import spacetimedb, {
  board,
  boardMember,
  card,
  situation,
  user,
} from "./schema";
import { MeRow } from "./types";
import { lookupCaller } from "./auth";

// ──────────────────────────────────────────────────────────────────────────
// Views: the ONLY way clients read game state. Each `my_*` view resolves the
// caller (principal → identity → user) and returns rows on boards that user is
// a member of (a spectator membership counts), so you can never see another
// player's game unless you've been invited onto their board. An unlinked caller
// resolves to nothing and sees empty results. (The catalogue — card_def /
// slot_def — is read directly; it's public.)
// ──────────────────────────────────────────────────────────────────────────

// "Me": who the client is signed in as, and their capabilities. Empty until the
// caller's principal is linked to a user. NOTE: primaryEmail IS projected here
// (the caller's own email, to themselves) — but NOT in any cross-user view.
export const meView = spacetimedb.view(
  { name: "me_view", public: true },
  t.array(MeRow),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const { user: u } = caller;
    return [
      {
        userId: u.id,
        primaryEmail: u.primaryEmail,
        displayName: u.displayName,
        pictureUrl: u.pictureUrl,
        isAdmin: u.isAdmin,
      },
    ];
  },
);

export const myBoards = spacetimedb.view(
  { name: "my_boards", public: true },
  t.array(board.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const m of ctx.db.boardMember.userId.filter(caller.user.id)) {
      const b = ctx.db.board.id.find(m.boardId);
      if (b) out.push(b);
    }
    return out;
  },
);

export const myBoardMembers = spacetimedb.view(
  { name: "my_board_members", public: true },
  t.array(boardMember.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId))
        out.push(peer);
    }
    return out;
  },
);

// Co-members of your boards, as `user` rows — but with primaryEmail BLANKED.
// Email is the cross-provider join key; keep it off the wire (doc §9).
export const myPlayers = spacetimedb.view(
  { name: "my_players", public: true },
  t.array(user.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const seen = new Set<bigint>();
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const peer of ctx.db.boardMember.boardId.filter(mine.boardId)) {
        if (seen.has(peer.userId)) continue;
        seen.add(peer.userId);
        const u = ctx.db.user.id.find(peer.userId);
        if (u) out.push({ ...u, primaryEmail: "" });
      }
    }
    return out;
  },
);

export const myCards = spacetimedb.view(
  { name: "my_cards", public: true },
  t.array(card.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const c of ctx.db.card.boardId.filter(mine.boardId)) out.push(c);
    }
    return out;
  },
);

export const mySituations = spacetimedb.view(
  { name: "my_situations", public: true },
  t.array(situation.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: any[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const s of ctx.db.situation.boardId.filter(mine.boardId))
        out.push(s);
    }
    return out;
  },
);
