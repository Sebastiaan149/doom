# Architecture Overview

This project is organized as a small set of focused browser scripts. Each file owns one clear responsibility, and `doom_files/doom.js` is the place where those responsibilities are connected.

## High-Level Flow

When the page loads:

1. `index.html` loads Three.js, then loads the project scripts in dependency order.
2. `main()` in `doom_files/doom.js` creates a `World`.
3. `World` creates the scene, camera, renderer, and shared loop.
4. `World` creates the minimap overlay, which also generates the maze data.
5. `World` builds the 3D maze from that same maze data.
6. The 3D build also creates collision boxes and inserts them into an octree.
7. `World` creates the first-person player controller and gives it:
   - the camera
   - the maze layout helper
   - the collision octree
8. `World` spawns the player at the maze start tile.
9. `World` registers the player controller, minimap controller, and animated objects with the shared loop.
10. The loop starts and the scene begins rendering frame by frame.
11. `main()` makes a best-effort pointer-lock request so the game enters first-person mode immediately when the browser allows it.

## The Main Systems

### 1. Maze Generation

Owned by: `doom_files/mazeGenerator.js`

This file creates the logical maze:

- `maze.cells[y][x]` stores the actual grid
- start and goal positions are stored in `maze.start` and `maze.goal`
- wall and floor themes are assigned to each cell
- rooms, corridors, and teleport links are carved into separate generation passes
- an ASCII preview is generated from the cell data

This maze object is the source of truth for the whole project. Everything else is derived from it.

For a deeper explanation of the pipeline, see `docs/maze-generation.md`.

### 2. Layout Helper

Owned by: `doom_files/mazeLayout.js`

This helper exists so every system agrees on where things are.

It converts between:

- grid coordinates like `(x = 4, y = 7)`
- world positions used by Three.js meshes and the camera
- fractional grid positions used by the minimap marker

Without this shared helper, the minimap, collision, and world rendering would drift apart over time.

### 3. 3D World Builder

Owned by: `doom_files/maze3dWorld.js`

This file translates the maze data into visible Three.js objects:

- floor planes
- wall cubes
- teleport marker spheres

It also creates one collision box per wall tile. Those boxes are inserted into the octree so the player can ask "what walls are near me?" without scanning the whole maze.

### 4. Collision Octree

Owned by: `doom_files/collisionOctree.js`

The octree is a broad-phase acceleration structure:

- space is recursively divided into eight smaller boxes
- wall collision boxes are stored in the deepest node that fully contains them
- player movement queries the octree with the player's current candidate bounds
- only nearby wall boxes are returned for exact overlap checks

This keeps collision checks efficient as the maze grows.

### 5. Player Controller

Owned by: `doom_files/playerController.js`

The player controller treats the camera as the player's eye point.

It handles:

- pointer-lock mouse look
- WASD / ZQSD movement
- sprint
- jump and gravity
- collision-aware axis-by-axis movement
- linked teleport-pad activation after movement
- explicit pointer-lock release/reacquire helpers used by the minimap UI

The player body is approximated as an upright box:

- top = eye position
- bottom = eye position minus player height
- width/depth = collision radius

### 6. Minimap Overlay

Owned by: `doom_files/mazeOverlay.js`

The minimap has two layers:

- a static canvas created from the maze ASCII preview
- an SVG route layer for the chosen destination
- a live SVG marker that tracks the player's position and facing direction

The overlay does not inspect the 3D scene to know where walls are. It uses the same maze data that generated the 3D world.

The minimap can be opened either with its UI button or with `M`. Opening it releases pointer lock so the cursor can click a destination. Closing it requests pointer lock again so control returns to first-person movement.

### 7. Pathfinding

Owned by: `doom_files/mazePathfinding.js`

This file computes the shortest route between the player's current maze cell and a clicked destination cell.

Right now it uses breadth-first search over walkable maze neighbors, which is appropriate because:

- every walking step has the same cost
- teleport links can be modeled as additional graph edges
- the maze size is small enough that the search remains inexpensive

For a deeper explanation of the route search, see `docs/pathfinding.md`.

### 8. Rendering And Loop

Owned by:

- `doom_files/rendering.js`
- `doom_files/gameLoop.js`

`rendering.js` owns the general Three.js setup:

- camera
- scene
- lights
- renderer
- resize handling

`gameLoop.js` owns the shared `tick(delta)` loop. Anything animated or updated each frame gets added to `loop.updatables`.

## Per-Frame Runtime Flow

Each animation frame:

1. `Loop.tick()` computes `delta`.
2. The loop calls `tick(delta)` on each registered updatable.
3. The player controller:
   - reads input state
   - applies jump/gravity
   - computes a candidate move
   - queries the octree for nearby walls
   - accepts or rejects each movement axis
   - checks whether the new cell is a teleport pad and, if so, jumps to its linked destination
4. The minimap controller:
   - converts the camera position back into maze coordinates
   - recomputes the BFS route if the player entered a new cell
   - redraws the route overlay and player marker
5. Teleport spheres animate if they have a `tick()` function.
6. The renderer draws the scene.

## Why The Project Is Structured This Way

The code is split by responsibility rather than by object type. That gives a few benefits:

- The maze generator can evolve without touching camera controls.
- Collision can change without rewriting the minimap.
- The minimap and 3D world stay consistent because they share the same maze source data.
- Runtime systems stay testable and easier to reason about because each file has one job.
