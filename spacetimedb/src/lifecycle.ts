import { t, SenderError } from "spacetimedb/server";
import { GOOGLE_ISSUERS, GOOGLE_CLIENT_ID } from "./constants";
import { normaliseEmail } from "./auth";
import spacetimedb from "./schema";

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────
export const init = spacetimedb.init((ctx) => {
  // Seed the catalogue.
  const inert = (defId: string, name: string, category: string) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: false,
      reusable: false,
      outputCap: 0,
    });
  const verb = (
    defId: string,
    name: string,
    category: string,
    outputCap: number,
  ) =>
    ctx.db.cardDef.insert({
      defId,
      name,
      category,
      isVerb: true,
      reusable: true,
      outputCap,
    });

  inert("health", "Health", "health");
  inert("wood", "Wood", "wood");
  inert("coin", "Coin", "coin");
  inert("lumberjack", "Lumberjack", "lumberjack");

  // Seed: a verb, but one-shot and hole-less — it looks inert until planted on
  // the tabletop, then grows into a Forest. outputCap 0 (it never trays output;
  // it transforms in place), not reusable (a single metamorphosis).
  ctx.db.cardDef.insert({
    defId: "seed",
    name: "Seed",
    category: "seed",
    isVerb: true,
    reusable: false,
    outputCap: 0,
  });

  verb("you", "You", "avatar", 5);
  verb("forest", "Forest", "station", 5);
  verb("market", "Market", "station", 10);
  verb("agency", "Agency", "station", 3);

  ctx.db.slotDef.insert({
    id: 0n,
    defId: "forest",
    slotIndex: 0,
    accepts: ["health", "lumberjack"],
    required: true,
  });
  // Market: a five-deep inbox queue for wood. None required — it sells whatever
  // is waiting, one per cycle (see the market resolver + verbReady), so a single
  // wood fires it and you can keep topping up the queue while it runs.
  for (let i = 0; i < 5; i++) {
    ctx.db.slotDef.insert({
      id: 0n,
      defId: "market",
      slotIndex: i,
      accepts: ["wood"],
      required: false,
    });
  }

  // Agency: ten Coin holes (no quantity in the model — multiplicity is multiple
  // holes; see DATA_MODEL §3.1). All required, so the hire fires only once paid.
  for (let i = 0; i < 10; i++) {
    ctx.db.slotDef.insert({
      id: 0n,
      defId: "agency",
      slotIndex: i,
      accepts: ["coin"],
      required: true,
    });
  }
});

// Auto-link trusted (Google) logins on connect. Connecting is permissive — any
// principal may open a socket — but the `identity` table is the gate: only a
// linked principal can do anything (see reducers below). Untrusted providers
// (e.g. SpacetimeAuth CLI tokens) are NOT auto-linked; they link explicitly via
// `bootstrap_first_admin` / a future "link account" reducer. See doc §11.
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
// also bootstraps the first admin. Find-or-create the same user the web login
// resolves to (by email), link THIS principal, and flip isAdmin. One-shot: it
// refuses once any admin exists, so it closes itself. See doc §5.
export const bootstrapFirstAdmin = spacetimedb.reducer(
  { email: t.string() },
  (ctx, { email }) => {
    for (const u of ctx.db.user.iter()) {
      if (u.isAdmin)
        throw new SenderError("An admin already exists; bootstrap is closed.");
    }
    const trimmed = normaliseEmail(email);
    if (trimmed === null)
      throw new SenderError("requires the human's primary email.");

    const target =
      ctx.db.user.primaryEmail.find(trimmed) ??
      ctx.db.user.insert({
        id: 0n,
        primaryEmail: trimmed,
        displayName: trimmed.split("@")[0] ?? trimmed,
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
  },
);
