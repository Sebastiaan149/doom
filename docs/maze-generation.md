# Maze Generation

This document explains how `doom_files/mazeGenerator.js` builds the logical maze that the rest of the project uses.

## The Maze As Data

The generator returns one maze object that acts as the source of truth for the whole project.

Its most important fields are:

- `maze.width` / `maze.height`: final grid dimensions
- `maze.cells[y][x]`: the full logical grid
- `maze.start`: start-cell coordinates
- `maze.goal`: goal-cell coordinates
- `maze.teleportPairs`: paired teleport pads
- `maze.ascii`: the color-coded ASCII preview used by the minimap
- `maze.reachableFromStart`: a reachability set used to validate connectivity

Each cell starts as a wall and can accumulate more metadata over the pipeline:

- `type`: `"wall"` or `"floor"`
- `regionId`: which carved region the cell belongs to
- `regionKind`: `"room"` or `"corridor"`
- `floorType`: themed floor identifier
- `wallMaterial`: themed wall identifier
- `special`: markers such as start or goal
- teleport fields: IDs and target coordinates for linked teleport pads

## High-Level Generation Pipeline

The maze is built in several passes:

1. Normalize settings and force odd dimensions so corridor carving can work on every other cell.
2. Initialize the entire grid as walls.
3. Try to place tiny rooms.
4. Try to place larger random rooms.
5. Carve corridor regions through the remaining solid space.
6. Open connector walls between separate regions.
7. Extend some dead ends and add some dead-end rooms.
8. Mark the start and goal tiles.
9. Place teleport pairs.
10. Add teleports to otherwise disconnected floor zones if needed.
11. Assign wall materials based on surrounding themed floor regions.
12. Build the ASCII preview and reachability data.

That order matters. For example, the start and goal are chosen only after the walkable layout exists, and wall materials are assigned only after nearby room/corridor themes are known.

## How Rooms Are Added

The generator first tries to carve rooms before it carves the recursive corridor network.

`canPlaceRoom()` ensures a proposed room:

- stays inside the maze interior
- does not overlap an existing floor area
- leaves a wall border around itself

If the room fits, `carveRoom()` converts that rectangle into floor cells, assigns one region ID to the whole room, and applies a room theme.

The project does two room passes:

- tiny rooms, which fit into tighter spaces
- regular random rooms, which create larger open areas

This is what keeps the maze from feeling like a pure one-tile-wide corridor labyrinth.

## How Corridors Are Carved

The corridor phase uses a randomized depth-first carving strategy.

`carveMazeFrom(startX, startY)`:

- starts from an odd grid cell
- uses a stack for backtracking
- carves two cells at a time so walls remain between corridor lanes until they are intentionally opened
- randomly changes corridor theme after a themed run length expires

This produces the classic winding maze structure while still allowing themed floor runs instead of a single repeated surface everywhere.

## How Separate Regions Get Connected

Rooms and corridor trees are created as separate regions first. After that, `connectRegions()` looks for wall cells that sit between two or more different regions.

Those connector walls are good candidates for opening because they:

- reduce isolated pockets
- create loops
- make navigation less linear

The `extraConnectors` setting controls how many of those walls are opened.

## How Dead Ends Are Softened

After the main carving pass, the generator looks for corridor dead ends and sometimes improves them in two ways:

- extend the corridor farther
- place a small room beyond the dead end

This adds visual variation and reduces the feeling that every branch ends abruptly.

## How Start And Goal Are Chosen

The start and goal are not hardcoded at fixed coordinates.

`markStartAndGoal()` finds:

- the nearest floor cell to the top-left interior corner `(1, 1)` for the start
- the nearest floor cell to the bottom-right interior corner `(width - 2, height - 2)` for the goal

That makes the maze feel directional even though room and corridor carving are procedural.

## How Teleports Work

Teleport pads are optional links between floor cells.

The generator scores candidate cells using factors such as:

- openness of the surrounding area
- distance from existing teleports
- distance from the start and goal
- whether the pair bridges different regions

If the regular placement pass still leaves unreachable floor zones, `ensureDisconnectedZonesHaveTeleports()` can link a disconnected component back into the reachable maze.

This means teleports are both a gameplay feature and a connectivity safety net.

## Why The Generator Produces ASCII Too

The generator returns `maze.ascii` in addition to the rich cell grid.

That ASCII preview is useful because:

- it gives a quick textual/debug visualization of the maze
- the minimap can render directly from it
- wall and floor themes can be mapped to colors without re-walking all rendering logic

The 3D world still uses `maze.cells`, but the minimap uses `maze.ascii`. Both come from the same generator run, which is why the two views stay aligned.

## Related Files

- `doom_files/mazeGenerator.js`: core generation pipeline
- `doom_files/maze3dWorld.js`: turns the logical maze into meshes and collision boxes
- `doom_files/mazeOverlay.js`: turns the ASCII preview into the minimap
- `doom_files/mazePathfinding.js`: searches through the generated floor graph
