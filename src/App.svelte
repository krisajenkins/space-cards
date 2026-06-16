<script lang="ts">
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/svelte';
import { tables, reducers } from './module_bindings';
import SignIn from './lib/SignIn.svelte';

const conn = useSpacetimeDB();

const [me, meReady] = useTable(tables.meView);
const [boards] = useTable(tables.myBoards);
const [cards] = useTable(tables.myCards);

const newGame = useReducer(reducers.newGame);

const signedIn = $derived($meReady && $me.length > 0);
</script>

<div style="padding: 2rem; font-family: system-ui, sans-serif;">
  <header style="display: flex; justify-content: space-between; align-items: center;">
    <h1 style="margin: 0;">Space Cards</h1>
    <SignIn />
  </header>

  <div style="margin: 1rem 0;">
    Status:
    <strong style="color: {$conn.isActive ? 'green' : 'red'}">
      {$conn.isActive ? 'Connected' : 'Disconnected'}
    </strong>
  </div>

  {#if !signedIn}
    <p>Sign in with Google to start a game.</p>
  {:else}
    <button
      onclick={() => newGame()}
      disabled={!$conn.isActive}
      style="padding: 0.5rem 1rem; margin-bottom: 1rem;"
    >
      New Game
    </button>

    <section>
      <h2>Boards ({$boards.length})</h2>
      {#if $boards.length === 0}
        <p>No boards yet — start a new game.</p>
      {:else}
        <ul>
          {#each $boards as board}
            <li>{board.name} — {$cards.filter(c => c.boardId === board.id).length} cards</li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
