<script lang="ts">
import { get } from 'svelte/store';
import { createSpacetimeDBProvider } from 'spacetimedb/svelte';
import type { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from '../module_bindings';
import { googleToken } from './google';
import App from '../App.svelte';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'spacecards';
// Anonymous SpacetimeAuth identity, persisted so a not-signed-in client keeps a
// stable principal across reloads. A Google token takes precedence.
const STDB_TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

// The connection is built once per page load with whatever token we currently
// hold; sign-in / sign-out reload the page to swap it (see google.ts).
const token = get(googleToken);

const onConnect = (_conn: DbConnection, _identity: Identity, stdbToken: string) => {
  // Persist the SpacetimeDB token ONLY for anonymous sessions. When signed in
  // with Google, the issued token maps to the Google identity — persisting it
  // would re-authenticate as that identity after sign-out. The Google JWT (in
  // its own store) is the source of truth when signed in.
  if (!token) localStorage.setItem(STDB_TOKEN_KEY, stdbToken);
};

const onConnectError = (_ctx: ErrorContext, err: Error) => {
  console.error('Error connecting to SpacetimeDB:', err);
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
