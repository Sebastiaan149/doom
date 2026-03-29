# Documentation

This folder explains the project at two levels:

- how the whole game fits together
- how the individual systems work internally

## Files

- [architecture.md](architecture.md)
  Overall runtime flow, subsystem boundaries, and how startup/frame updates work.

- [maze-generation.md](maze-generation.md)
  How the logical maze is built, how rooms/corridors/teleports are chosen, and what data the generator returns.

- [pathfinding.md](pathfinding.md)
  Which shortest-path algorithm the minimap uses, how routes are rebuilt, and how teleport links affect routing.

- [collision-and-movement.md](collision-and-movement.md)
  Detailed explanation of the player controller, jump/gravity logic, and octree collision.

- [minimap-and-coordinates.md](minimap-and-coordinates.md)
  How the maze grid, world-space placement, ASCII map, minimap, route overlay, and pointer-lock handoff all stay in sync.

## Main Source Files

- `doom_files/doom.js`
  High-level bootstrap that wires the game together.

- `doom_files/mazeGenerator.js`
  Procedural maze generation and ASCII preview creation.

- `doom_files/mazeLayout.js`
  Shared coordinate-conversion helper used by multiple systems.

- `doom_files/maze3dWorld.js`
  Converts maze data into Three.js meshes and collision entries.

- `doom_files/collisionOctree.js`
  Broad-phase spatial index used for wall collision queries.

- `doom_files/mazePathfinding.js`
  Shortest-path search helpers used by the interactive minimap routing system.

- `doom_files/playerController.js`
  First-person controls, jump, gravity, and collision-aware movement.

- `doom_files/mazeOverlay.js`
  Minimap overlay and live player marker logic.

- `doom_files/gameLoop.js`
  Shared per-frame update loop.

- `doom_files/rendering.js`
  Camera, scene, renderer, lights, and resize handling.
