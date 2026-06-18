// ──────────────────────────────────────────────────────────────────────────
// Durations (microseconds)
// ──────────────────────────────────────────────────────────────────────────
export const MINUTE = 60_000_000n; // a literal minute (engine default fallback)
export const REST = 15_000_000n; // You resting to generate one Health
export const LUMBERJACK = 20_000_000n; // Lumberjack chopping one Wood in the Forest
export const CHOP = 5_000_000n; // Forest chopping one Health
export const MARKET = 3_000_000n; // Market selling one Wood
export const HIRE = 8_000_000n; // Agency processing a hire
export const FOREST_GROWTH = 60_000_000n; // a planted Seed maturing into a Forest
export const WORKER_HOLD = 2_000_000n; // Worker carrying a stolen card before it deposits it

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
