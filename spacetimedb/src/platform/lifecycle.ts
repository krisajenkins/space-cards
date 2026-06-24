import { SenderError } from "spacetimedb/server";
import {
  GOOGLE_ISSUERS,
  GOOGLE_CLIENT_ID,
  ADMIN_IDENTITY,
  ADMIN_EMAIL,
} from "./constants";
import { normaliseEmail, requireCaller } from "./auth";
import spacetimedb from "./schema";
import { seedCatalogue } from "../content/catalogue";

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle — the SpacetimeDB connection/bootstrap hooks. The catalogue itself
// (card_def / slot_def / achievement_def authoring) lives in
// ../content/catalogue.ts; `init` and the admin `reseed_catalogue` migration
// just call seedCatalogue.
// ──────────────────────────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => seedCatalogue(ctx));

// Admin-only catalogue migration. `init` runs only on first publish, so after a
// catalogue change a plain (data-preserving) republish leaves the old card_def /
// slot_def rows in place. Calling this re-applies seedCatalogue idempotently —
// the fix path for a live database without wiping anyone's game.
export const reseedCatalogue = spacetimedb.reducer((ctx) => {
  const { user: me } = requireCaller(ctx);
  if (!me.isAdmin) throw new SenderError("admin only");
  seedCatalogue(ctx);
});

// Auto-link trusted (Google) logins on connect. Connecting is permissive — any
// principal may open a socket — but the `identity` table is the gate: only a
// linked principal can do anything (see reducers below). Untrusted providers
// (e.g. SpacetimeAuth CLI tokens) are NOT auto-linked; they link explicitly via
// `register_admin` / a future "link account" reducer. See doc §11.
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const jwt = ctx.senderAuth.jwt;

  // Trust check: BOTH issuer and audience (issuer alone would accept a token
  // minted for a different app by the same IdP).
  const isGoogle =
    jwt !== null &&
    GOOGLE_ISSUERS.includes(jwt.issuer) &&
    jwt.audience.includes(GOOGLE_CLIENT_ID);

  const payload = jwt?.fullPayload ?? null;
  const email = normaliseEmail(payload?.["email"]);
  const pictureClaim = payload?.["picture"];
  const pictureUrl =
    typeof pictureClaim === "string" ? pictureClaim : undefined;
  const nameClaim = payload?.["name"];
  const displayName =
    typeof nameClaim === "string" && nameClaim.trim().length > 0
      ? nameClaim.trim()
      : (email?.split("@")[0] ?? "Player");

  const existing = ctx.db.identity.id.find(ctx.sender);

  // Known principal → refresh ONLY provider-owned fields (email, picture).
  // Never re-sync displayName: the human owns that once they've edited it.
  if (existing !== null) {
    if (!isGoogle || email === null) return;
    const u = ctx.db.user.id.find(existing.userId);
    if (u === null) return;
    // Email rotation: skip the email change if that address now belongs to a
    // DIFFERENT user (would violate the unique constraint); still refresh picture.
    const collision = ctx.db.user.primaryEmail.find(email);
    const nextEmail =
      collision !== null && collision.id !== u.id ? u.primaryEmail : email;
    ctx.db.user.id.update({
      ...u,
      primaryEmail: nextEmail,
      pictureUrl: pictureUrl ?? u.pictureUrl,
    });
    return;
  }

  // New principal. Only auto-link providers we trust to assert a verified email.
  if (!isGoogle || email === null) return;

  // Find-or-create the user by email, then attach this principal. This is what
  // merges providers: an existing user with that email (CLI bootstrap, prior
  // login) gets a second identity rather than forking a second human.
  const existingUser = ctx.db.user.primaryEmail.find(email);
  const userId =
    existingUser?.id ??
    ctx.db.user.insert({
      id: 0n,
      primaryEmail: email,
      displayName,
      pictureUrl,
      isAdmin: false,
      createdAt: ctx.timestamp,
    }).id;

  ctx.db.identity.insert({
    id: ctx.sender,
    userId,
    provider: { tag: "Google" },
    linkedAt: ctx.timestamp,
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

// Explicit linking for non-auto providers (the CLI / SpacetimeAuth path), which
// also designates the admin. Gated against the two server-side constants above:
// only the hardcoded ADMIN_IDENTITY may call it, and it links to ADMIN_EMAIL's
// user (no email arg — the human is fixed in code). Find-or-create that user,
// link THIS principal, and flip isAdmin. Idempotent and re-runnable (e.g. after
// a data wipe): unlike the old first-come bootstrap, the constant identity is
// the gate, so there's nothing to "close". See doc §5.
export const registerAdmin = spacetimedb.reducer((ctx) => {
  if (ctx.sender.toHexString() !== ADMIN_IDENTITY)
    throw new SenderError("not the registered admin identity");

  const target =
    ctx.db.user.primaryEmail.find(ADMIN_EMAIL) ??
    ctx.db.user.insert({
      id: 0n,
      primaryEmail: ADMIN_EMAIL,
      displayName: ADMIN_EMAIL.split("@")[0] ?? ADMIN_EMAIL,
      pictureUrl: undefined,
      isAdmin: false,
      createdAt: ctx.timestamp,
    });

  const existing = ctx.db.identity.id.find(ctx.sender);
  if (existing === null) {
    ctx.db.identity.insert({
      id: ctx.sender,
      userId: target.id,
      provider: { tag: "Spacetime" },
      linkedAt: ctx.timestamp,
    });
  } else if (existing.userId !== target.id) {
    throw new SenderError(
      "This identity is already linked to a different user.",
    );
  }

  ctx.db.user.id.update({ ...target, isAdmin: true });
});
