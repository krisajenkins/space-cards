<script lang="ts">
import { get } from 'svelte/store';
import { createSpacetimeDBProvider } from 'spacetimedb/svelte';
import type { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from '../module_bindings';
import { googleToken, hasStoredToken, clearStoredTokens } from './google';
import App from '../App.svelte';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'spacecards';
// The persisted SpacetimeDB session token — the durable session for BOTH an
// anonymous client and a signed-in one (after a Google login establishes the
// identity, this token reconnects as that same user). A still-valid Google JWT
// takes precedence on connect; this is the fallback once it expires.
const STDB_TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// The connection is built once per page load with whatever token we currently
// hold; sign-in / sign-out reload the page to swap it (see google.ts).
const token = get(googleToken);

const onConnect = (_conn: DbConnection, _identity: Identity, stdbToken: string) => {
  // Persist the SpacetimeDB session token on EVERY connect — including Google
  // sessions. SpacetimeDB derives a stable Identity from the Google JWT's
  // issuer+subject and re-issues it as this token, which (unlike the 1-hour
  // Google ID token) is long-lived. Storing it makes the SpacetimeDB token the
  // durable session: once a Google login has established the identity, later
  // reloads reconnect as the same user via this token even after the Google JWT
  // has expired (the `?? STDB_TOKEN_KEY` fallback below). Google is needed only
  // for the first-time link.
  //
  // Safe despite the token mapping to the Google identity: signOutGoogle()
  // clears STDB_TOKEN_KEY too, so a signed-out client drops back to a fresh
  // anonymous identity rather than silently reconnecting as the former user.
  localStorage.setItem(STDB_TOKEN_KEY, stdbToken);
};

// The server rejects a token it doesn't recognise with a "Failed to verify
// token" / 401. In dev this happens when the database is recreated: our
// persisted session token is now meaningless to the fresh DB, and nothing else
// clears it, so every reload retries the same dead token and stays locked out.
const isTokenRejection = (err: Error): boolean =>
  /verify token|unauthor/i.test(err.message);

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.error('Error connecting to SpacetimeDB:', err);
  // Clear the stale token(s) and reload to reconnect with a fresh anonymous
  // identity (signed-in users get re-prompted by Google one-tap). Guard on a
  // token actually being present so a server-down error can't spin in a reload
  // loop — once cleared, the next connect carries no token and won't re-trip.
  if (isTokenRejection(err) && hasStoredToken()) {
    clearStoredTokens();
    window.location.reload();
  }
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(token ?? localStorage.getItem(STDB_TOKEN_KEY) ?? undefined)
  .onConnect(onConnect)
  .onConnectError(onConnectError);

createSpacetimeDBProvider(connectionBuilder);
</script>

<App />
