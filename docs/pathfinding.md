# Pathfinding

This document explains how shortest-path routing works for the interactive minimap.

## Which Algorithm Is Used

The route planner in `doom_files/mazePathfinding.js` uses breadth-first search (BFS).

BFS is a good fit for the current maze because:

- every walking step between adjacent cells has the same cost
- the maze is still small enough that a full BFS is inexpensive
- the route should be the true shortest path in number of walked cells, not just an approximation

If the project later adds weighted movement costs or much larger maps, then Dijkstra or A* would become stronger candidates. Right now BFS is the simplest correct choice.

## What The Search Runs On

The search graph is built directly from the logical maze:

- each walkable floor cell is a node
- edges connect the four cardinal neighbors
- neighbors are produced by `getPathfindingNeighbors()`
- visited cells are tracked with stable string keys like `"12,7"`

The maze generator also supports teleport links. The interactive minimap now calls `findShortestMazePath()` with `includeTeleports: true`, so the displayed route can use teleport pads when that creates a shorter traversable path.

## Search Flow

`findShortestMazePath(maze, start, goal)` works like this:

1. Validate that the start and goal exist and are both walkable floor cells.
2. Return immediately if the player is already on the destination cell.
3. Seed the BFS queue with the start cell.
4. Expand cells in first-in, first-out order.
5. For each newly discovered neighbor, store its predecessor in `previousByKey`.
6. Stop as soon as the goal is reached.
7. Reconstruct the path by walking backward from the goal to the start.

That reconstruction is handled by `reconstructShortestMazePath()`, which turns the predecessor map into an ordered array of cells that the minimap can draw.

## Why The Route Updates Dynamically

The route is not computed just once.

`doom_files/mazeOverlay.js` recomputes the path whenever the player enters a new maze cell. That gives the user a live route that stays correct if they:

- walk part of the route normally
- deviate from the suggested path
- choose a new destination

The current destination is cleared automatically when:

- the player reaches it
- the user clicks the same destination again
- the destination becomes invalid

## How The Minimap Uses The Result

The minimap does not render the path into the base canvas. Instead it converts the returned cell list into one or more SVG polylines on top of the map.

That separation makes the system simpler:

- the maze image stays static
- only the route overlay needs to be redrawn
- the route remains crisp when the map is expanded

The renderer also simplifies walk-only parts of the path with line-of-sight checks, so open rooms can show diagonal shortcuts instead of only right-angle turns.

When the shortest path includes a teleport hop, the overlay keeps the normal walk path split at that hop, but adds a lighter dashed connector between the paired teleport cells. That keeps the jump visible without making it look like an ordinary corridor segment.

## Related Files

- `doom_files/mazePathfinding.js`: BFS helpers and path reconstruction
- `doom_files/mazeOverlay.js`: destination selection, dynamic recomputation, and route rendering
- `doom_files/mazeGenerator.js`: walkability and optional teleport neighbor data
