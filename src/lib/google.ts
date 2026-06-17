// Google Identity Services (GIS) + token lifecycle.
//
// The client's only auth job is to obtain a Google ID token (a JWT) ONCE and
// hand it to the SpacetimeDB connection to establish identity. The server
// (onConnect) validates issuer + audience and links the principal to a user by
// verified email. See docs/DATA_MODEL.md §11 and the multi-identity auth note.
//
// The Google ID token lives only ~1 hour and is NOT what keeps a session alive:
// SpacetimeDB re-issues the same identity as a long-lived session token, which
// Connection.svelte persists and reuses. So we deliberately do NOT keep the
// Google JWT refreshed — once it has linked the identity, the SpacetimeDB token
// carries the session and Google is touched again only on an explicit re-login.
//
// There is no live token swap on a SpacetimeDB connection, and the Svelte SDK
// keeps the connection in a page-lifetime singleton that's reused across
// component remounts — so the only reliable way to apply a new token is a full
// page reload. `Connection.svelte` builds the connection once from the current
// stored token; sign-in and sign-out here persist the token and reload.

import { writable, get, type Writable } from "svelte/store";
// The Google OAuth client id and trusted issuers are public, shared config. The
// server module is their single source of truth — it validates ID tokens
// against this same audience and issuer set — so import them rather than
// duplicating (here or in env). See spacetimedb/src/constants.ts.
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_ISSUERS,
} from "../../spacetimedb/src/constants";
export { GOOGLE_CLIENT_ID };

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "spacecards";
const TOKEN_KEY = `${HOST}/${DB_NAME}/google_id_token`;
// The anonymous SpacetimeAuth fallback token (written by Connection.svelte).
// Cleared on sign-out so we drop back to a fresh anonymous identity rather than
// reconnecting as the just-signed-out user.
const STDB_TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// `undefined` = not signed in with Google (connect anonymously / fall back).
export const googleToken: Writable<string | undefined> =
  writable(loadValidToken());

type GoogleJwt = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  name?: string;
  picture?: string;
};

function decodeJwt(token: string): GoogleJwt | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as GoogleJwt;
  } catch {
    return null;
  }
}

// Validate issuer, audience and expiry (defence-in-depth + faster feedback; the
// server check is the one that actually matters).
function isValid(token: string): boolean {
  const claims = decodeJwt(token);
  if (claims === null) return false;
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) return false;
  if (claims.aud !== GOOGLE_CLIENT_ID) return false;
  if (typeof claims.exp !== "number") return false;
  return claims.exp * 1000 > Date.now();
}

function loadValidToken(): string | undefined {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored && isValid(stored)) return stored;
  if (stored) localStorage.removeItem(TOKEN_KEY); // tampered / expired / rotated id
  return undefined;
}

// Persist a freshly-minted Google ID token and publish it to the store. We do
// NOT schedule any refresh: the SpacetimeDB session token (held by the live
// connection) is what keeps us signed in past the Google token's ~1h expiry, so
// there's nothing to keep alive here. Only called on an explicit sign-in.
function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  googleToken.set(token);
}

// ── GIS script loading ────────────────────────────────────────────────────
let gisReady: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gisReady;
}

function gisId(): any {
  return (window as any).google?.accounts?.id;
}

let initialised = false;

async function ensureInitialised(): Promise<boolean> {
  if (!GOOGLE_CLIENT_ID) return false; // dormant until a client id is configured
  await loadGis();
  if (!initialised) {
    gisId().initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp: { credential?: string }) => {
        if (!resp.credential || !isValid(resp.credential)) return;
        const wasSignedIn = get(googleToken) !== undefined;
        setToken(resp.credential);
        // A fresh sign-in must swap the connection's token, and this SDK only
        // applies a token on a freshly-built connection — so reload. (A refresh
        // while already signed in is silent: the live session is unaffected.)
        if (!wasSignedIn) window.location.reload();
      },
      auto_select: true,
    });
    initialised = true;
  }
  return true;
}

// Render the official Google button into `el`, and (if not signed in) show the
// One-Tap prompt. Safe to call when Google is dormant — it no-ops.
export async function renderGoogleButton(el: HTMLElement): Promise<void> {
  if (!(await ensureInitialised())) return;
  gisId().renderButton(el, {
    theme: "outline",
    size: "large",
    type: "standard",
  });
  promptGoogle();
}

export async function promptGoogle(): Promise<void> {
  if (!(await ensureInitialised())) return;
  gisId().prompt();
}

export function signOutGoogle(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STDB_TOKEN_KEY);
  googleToken.set(undefined);
  gisId()?.disableAutoSelect?.(); // don't silently re-pick the account next time
  // Reload to rebuild the connection anonymously — the SDK won't swap the token
  // on the live (singleton) connection.
  window.location.reload();
}
