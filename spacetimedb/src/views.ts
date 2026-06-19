import { t } from "spacetimedb/server";
import spacetimedb, {
  board,
  boardMember,
  card,
  cardHistory,
  situation,
  user,
} from "./schema";
import { MeRow, MyAchievementRow } from "./types";
import type { Board, BoardMember, User, Card, Situation } from "./types";
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
    const out: Board[] = [];
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
    const out: BoardMember[] = [];
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
    const out: User[] = [];
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
    const out: Card[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const c of ctx.db.card.boardId.filter(mine.boardId)) out.push(c);
    }
    return out;
  },
);

// The lifetime card-creation tally for every board the caller is on: one row
// per (board, defId) that has ever been created, with its running count. No row
// for a card never made, so iterating this view is "everything discovered".
export const myCardHistory = spacetimedb.view(
  { name: "my_card_history", public: true },
  t.array(cardHistory.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const boards = new Set(
      [...ctx.db.boardMember.userId.filter(caller.user.id)].map(
        (m) => m.boardId,
      ),
    );
    // Iterate-and-filter rather than a prefix scan on by_board_def: a one-column
    // prefix (bare value) on a multi-column index panics in serializeRange under
    // SDK 2.5.0; only the full key is safe. History is small, so this is cheap.
    return [...ctx.db.cardHistory.iter()].filter((h) => boards.has(h.boardId));
  },
);

// Achievements earned on any board the caller is on (earned + seen state), each
// joined to its catalogue text. achievement_def is private — you mustn't read
// the blurb of a milestone you haven't unlocked — so the view folds title +
// description in here rather than exposing the catalogue. No row for an unearned
// milestone.
export const myAchievements = spacetimedb.view(
  { name: "my_achievements", public: true },
  t.array(MyAchievementRow),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const boards = new Set(
      [...ctx.db.boardMember.userId.filter(caller.user.id)].map(
        (m) => m.boardId,
      ),
    );
    // Iterate-and-filter (not a by_board_ach prefix scan) — see my_card_history
    // for why the bare-value multi-column prefix is unsafe under SDK 2.5.0.
    return [...ctx.db.achievement.iter()]
      .filter((a) => boards.has(a.boardId))
      .map((a) => {
        const def = ctx.db.achievementDef.achId.find(a.achId);
        return {
          id: a.id,
          boardId: a.boardId,
          achId: a.achId,
          earnedAt: a.earnedAt,
          seen: a.seen,
          title: def?.title ?? a.achId,
          description: def?.description ?? "",
        };
      });
  },
);

export const mySituations = spacetimedb.view(
  { name: "my_situations", public: true },
  t.array(situation.rowType),
  (ctx) => {
    const caller = lookupCaller(ctx);
    if (caller === null) return [];
    const out: Situation[] = [];
    for (const mine of ctx.db.boardMember.userId.filter(caller.user.id)) {
      for (const s of ctx.db.situation.boardId.filter(mine.boardId))
        out.push(s);
    }
    return out;
  },
);
