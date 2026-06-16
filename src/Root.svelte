<script lang="ts">
import Connection from './lib/Connection.svelte';
</script>

<!--
  The SpacetimeDB Svelte SDK holds ONE connection in a module-level singleton for
  the page's lifetime and reuses it across component remounts — so a token swap
  cannot be applied by remounting the provider. Instead, sign-in / sign-out
  persist the token and reload the page (see lib/google.ts); this fresh load
  builds the connection with the current token. So Root just mounts Connection.
-->
<Connection />
