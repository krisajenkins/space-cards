# [x] Login Bug

Sometimes when I recreate the database my UI gets stuck on a "auth token we don't recognise" state. I have to clear cookies to get back in. It probably won't happen in production because we won't recreate the database, but it's still annoying for dev. Here's the console:

```
client:789 [vite] connecting...
client:912 [vite] connected.
spacetimedb.js?v=e031886b:5042 ℹ️ INFO Connecting to SpacetimeDB WS...
:3000/v1/identity/websocket-token:1  Failed to load resource: the server responded with a status of 401 (Unauthorized)
spacetimedb.js?v=e031886b:5042 ❌ ERROR Error connecting to SpacetimeDB WS
Connection.svelte:38 Error connecting to SpacetimeDB: Error: Failed to verify token: Unauthorized
    at openWebSocket (spacetimedb.js?v=e031886b:5640:13)
    at async openWebSocket (spacetimedb.js?v=e031886b:5693:21)
(anonymous) @ Connection.svelte:38
```

In those circumstances, let's just clear the auth tokens and force reauthentication.

# [ ] Card History view

I want to create a view that shows, for the connected player, how many of each card they have created over the lifetime of the game. (No entry for undiscovered/uncreated cards.) This will power achievements; stats; and a new type of card that generates blueprints _we know the player can use_. 

One interesting thing this will power - the end! When you first create an escape card, that's the win condition. Trigger some celebratory message or cutscene.

# [ ] We should restrict where drones will drop to.

In the current game, drones should not be able to drop to an assembler, because
it makes different kinds of things - if it's auto-filled the player can't make
a choice - the drone will jump in and blindly force a choice for them.

# [ ] Drone Blueprints should not be consumed.

You might want to make more than one of a drone.

# [ ] Blueprints shouldn't all appear at the start.

There should be a "research" card. It takes 1 effort, and can create a blueprint. The rules here are a little tricky, because what I want is:

- If you've done a manual task 3 times, you can research a drone that does it, if there is such a drone.
- If you've unlocked 1 of each of the ingredients for a new card, you can now research the blueprint for the thing that can be built with those ingredients. Note that it's one-of-each instead of the full recipe, because once you've got the blueprint, I still want you to have to work to make it.

I think this will lean heavily on the card history view - it's how we know what cards you've found.
