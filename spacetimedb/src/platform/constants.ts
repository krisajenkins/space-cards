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
