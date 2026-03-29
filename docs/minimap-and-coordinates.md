# Minimap And Coordinates

This document explains how the project keeps the 2D minimap, route overlay, 3D world, and player position synchronized.

## One Maze, Multiple Views

The project does not maintain separate "2D map data" and "3D map data".

Instead, there is one maze object created by `doom_files/mazeGenerator.js`, and multiple systems derive their own view from it:

- the 3D world builder uses `maze.cells`
- the minimap uses `maze.ascii`
- the player spawn uses `maze.start`
- the initial facing direction uses `maze.goal`

That shared data model is what keeps everything aligned.

## The Coordinate Spaces

There are three coordinate spaces to keep in mind.

### 1. Maze Grid Space

This is the logical maze:

- integer cell coordinates
- top-left-oriented indexing
- example: `(x = 3, y = 6)`

This is how `maze.cells[y][x]` is addressed.

### 2. World Space

This is the centered Three.js scene:

- X goes left/right
- Y goes up/down
- Z goes forward/back

The maze is shifted so it is centered around the world origin rather than starting at `(0, 0, 0)`.

### 3. Minimap Pixel Space

This is the on-screen overlay:

- the static map is drawn into a source canvas
- the source canvas is then CSS-scaled for display
- the player marker is positioned in display pixels

That means the minimap logic must care about both the source resolution and the displayed size.

## Why `mazeLayout.js` Exists

`doom_files/mazeLayout.js` is the shared translator between spaces.

It provides:

- `gridToWorldX()` / `gridToWorldZ()`
- `gridToWorldPosition()`
- `worldToGridCoordinates()`
- `worldToGridFractionalCoordinates()`
- start and goal world-position helpers

Without this file, each subsystem would need to duplicate conversion math, which is how subtle alignment bugs usually appear.

## How The 3D World Uses The Layout

`doom_files/maze3dWorld.js` calls `createMazeLayout()` once and reuses it for:

- floor positions
- wall positions
- teleport positions
- wall collision box positions

That means the visible world and the collision world are generated from the same placement math.

## How The Minimap Is Built

The minimap starts from `maze.ascii`.

The generator creates that ASCII preview by converting each maze cell into a symbol:

- walls become wall symbols
- floors become floor symbols
- start/goal/teleport tiles become special symbols

Then `asciiToTileMapCanvas()` turns those symbols into colors and fills one rectangle per tile.

So the minimap already "knows" the maze shape before the 3D world is even rendered.

## How Route Selection Works

The minimap can be expanded either by clicking its button or by pressing `M`.

When the minimap is expanded:

- pointer lock is released
- the user can click a walkable floor tile
- that tile becomes the current destination
- a shortest traversable path is computed from the player's current cell to that destination using breadth-first search (BFS), including teleports when they shorten the route

Clicking the same destination again clears the route. Reaching the destination also clears it automatically.

When the minimap is collapsed again, it requests pointer lock so control returns to the first-person view.

## Startup Pointer-Lock Behavior

`doom_files/doom.js` makes a best-effort pointer-lock request right after the world starts.

Because browsers often restrict pointer lock behind a user gesture, that request may be rejected. In that case the normal fallback still works:

- click the canvas to capture the mouse
- press `M` or use the minimap button to release it for route selection
- close the minimap to request it again

## Why The Route Lives In An SVG Layer

The route is drawn on a separate SVG layer instead of the base canvas because that makes the interaction simpler:

- the base minimap stays a static image
- the route can be redrawn without regenerating the map
- the route scales cleanly when the minimap is expanded
- the destination marker and path can share one overlay

The overlay also has enough freedom to simplify visible walk segments:

- open areas can be rendered with diagonal line-of-sight shortcuts
- teleport hops can keep the solid walk path split while still showing a subtle dashed connector between the paired pads

## Why The Player Marker Uses Fractional Coordinates

If the player marker used only integer grid coordinates, it would snap from cell center to cell center.

Instead, the minimap uses `worldToGridFractionalCoordinates()`:

- world position is converted into fractional cell coordinates
- those fractional values are mapped to minimap pixels
- the SVG marker moves smoothly inside the tile

This makes the minimap feel alive rather than grid-snapped.

## Why The Marker Rotation Needs An Offset

The SVG player arrow asset points upward in image space.

The angle from `atan2(z, x)` is measured relative to the positive X axis.

Those are different conventions, so the code adds `PI / 2` before converting the angle to degrees.

That extra rotation lines the SVG's "up" direction up with the camera's forward direction.

## Summary

The synchronization story looks like this:

- `mazeGenerator.js` creates the logical maze
- `mazeLayout.js` defines how that maze lives in world space
- `maze3dWorld.js` uses the layout for meshes and collision boxes
- `mazePathfinding.js` computes the shortest BFS route between maze cells
- `mazeOverlay.js` uses the same maze plus the same layout math for the minimap, route overlay, and pointer-lock/UI handoff
- `playerController.js` moves the camera in world space
- the minimap converts the camera position back into grid-derived map pixels and updates the route if the player's current cell changed

That loop is what keeps the player, world, collision, and minimap all consistent.
