import { SenderError } from "spacetimedb/server";

// ──────────────────────────────────────────────────────────────────────────
// Auth helpers. Resolve principal → identity → user. NOTE: `.find()` returns
// `null` (not `undefined`) when absent — always compare against `null`, or the
// check is an always-true auth bypass.
// ──────────────────────────────────────────────────────────────────────────
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

export function lookupCaller(ctx: any): { identity: any; user: any } | null {
  const ident = ctx.db.identity.id.find(ctx.sender);
  if (ident === null) return null; // unknown principal
  const u = ctx.db.user.id.find(ident.userId);
  if (u === null) return null; // dangling FK (shouldn't happen)
  return { identity: ident, user: u };
}

export function requireCaller(ctx: any): { identity: any; user: any } {
  const caller = lookupCaller(ctx);
  if (caller === null) {
    throw new SenderError(
      "Sign in first — no linked profile for this identity.",
    );
  }
  return caller;
}

// Resolve the caller and assert they are a member of the board. Returns the
// caller's user so callers can use `me.id` for ownership checks.
export function requireMember(ctx: any, boardId: bigint): { user: any } {
  const { user: me } = requireCaller(ctx);
  const ok = [...ctx.db.boardMember.boardId.filter(boardId)].some(
    (m: any) => m.userId === me.id,
  );
  if (!ok) throw new SenderError("not a member of this board");
  return { user: me };
}
