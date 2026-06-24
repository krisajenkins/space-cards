// ──────────────────────────────────────────────────────────────────────────
// Auth — trusted issuers. We split identity (the principal, `ctx.sender`) from
// user (the human); see docs/DATA_MODEL.md §11. A Google JWT auto-links by
// verified email; everything else must be linked explicitly. The client id is
// public (not a secret) so it lives here as a constant rather than in env.
// ──────────────────────────────────────────────────────────────────────────
// Google mints ID tokens with `iss` as EITHER form — accept both.
export const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
];
export const GOOGLE_CLIENT_ID =
  "171597117898-udk35oal7pgj04a08uldr0k7cpa2tuaa.apps.googleusercontent.com";

// The one admin principal, hardcoded. `register_admin` links THIS identity (the
// operator's `spacetime login` principal) to the human below and flips isAdmin.
// Neither is a secret — an identity hex and an email are both public — so it's
// fine that this leaf is also client-importable. To hand the keys to a different
// operator, change these and republish.
export const ADMIN_IDENTITY =
  "c2005efe02e92547ddd4bd106e84a281ead78a30fa26f42e619d70b20917c3dd";
export const ADMIN_EMAIL = "krisajenkins@gmail.com";
