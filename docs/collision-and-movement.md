# Collision And Movement

This document explains how the player moves, jumps, and collides with walls.

## The Core Idea

The player controller never intentionally places the player inside a wall.

Instead, for each attempted movement step it:

1. predicts the next position
2. builds the player's collision box at that predicted position
3. queries the octree for nearby wall boxes
4. checks whether any returned wall box overlaps the player box
5. only accepts the movement if no overlap would happen

This is simpler and safer than moving first and trying to push the player back out afterward.

## Player Shape

The player is approximated as an upright box:

- top = camera eye level
- bottom = eye level minus player height
- half-width = collision radius
- half-depth = collision radius

That box is built in `getPlayerBoundsAt()` inside `doom_files/playerController.js`.

## Horizontal Movement

Input starts in local player space:

- right/left changes local X
- backward/forward changes local Z

The movement vector is then rotated by the camera yaw so it becomes world-space movement.

Movement is resolved one axis at a time:

1. try X
2. try Z

This is important because it creates natural wall sliding:

- if X is blocked but Z is free, the player still moves along Z
- if Z is blocked but X is free, the player still moves along X

## Jump And Gravity

Jumping is implemented as a vertical velocity impulse:

- pressing `Space` sets `jumpQueued = true`
- if the player is grounded, `tryStartJump()` sets `verticalVelocity = jumpSpeed`
- each frame, gravity subtracts from `verticalVelocity`
- vertical movement is applied using the same predictive collision logic

Grounding is handled with two pieces of state:

- `floorHeight`: where the player's feet should stand
- `eyeLevel`: where the camera currently is

When the player falls to or below the grounded eye height, the controller clamps the eye back to the expected standing height and resets vertical velocity.

## Why There Is A Delta Clamp

The shared game loop clamps `delta` to a maximum of `0.05`.

This protects movement and collision from giant frame jumps after:

- tab switching
- browser lag
- debugger pauses

Without that clamp, one bad frame could turn into a very large movement step and skip through geometry.

## How The Octree Fits In

The octree does not replace exact collision tests. It speeds them up.

The octree answers:

"Which wall boxes are even close enough to matter for this player box?"

That keeps the candidate list small.

After that the octree returns nearby candidates, the controller still performs exact `Box3` intersection checks.

This is what `intersectsWall()` does.

The important coordinate detail is that the octree works in Three.js world space, not in abstract maze-tile space. In the current project, each inserted wall box happens to match one maze wall tile, but the octree itself only knows about world-space `Box3` bounds.

## How The Octree Is Built

`doom_files/maze3dWorld.js` creates one axis-aligned collision box per wall tile.

Each box matches the visible wall dimensions:

- center = wall mesh position
- size = `(tileSize, wallHeight, tileSize)`

Those entries are collected into an array and passed to `createCollisionOctree()`.

The octree:

- computes one root box that encloses all wall boxes
- subdivides when a node gets crowded
- stores each wall box in the deepest child that fully contains it
- keeps boundary-touching boxes in the parent node so queries never miss them

## Why Predictive Collision Is Better Here

A earlier tried "push the player out" approach had a common problem:

- if the player overlapped several wall boxes at once
- and each wall tried to apply its own correction
- the total correction could become huge

That can create snapping or teleporting.

The predictive approach is more stable:

- no overlap is accepted
- there is no corrective push to accumulate
- the player either moves into the candidate spot or stays where they are

## Current Limitations

This is intentionally simple movement. A few things it does not do yet:

- swept collision for very fast movement
- slope handling
- step-up logic for stairs
- ceiling-specific state beyond "vertical movement was blocked"
- dynamic obstacles inserted into the octree at runtime

## How Teleport Pads Fit In

Teleportation happens after the movement step has been resolved.

That ordering matters:

- collisions still decide whether the player can enter the teleport tile
- once the player is on a linked teleport cell, the controller snaps them to the paired tile center
- a short ignore window prevents the destination pad from immediately teleporting the player back

This keeps teleportation separate from wall collision logic instead of treating teleports like a physics response.
