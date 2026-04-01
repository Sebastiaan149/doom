// This file contains the first-person player controller used to move through the maze.
// It provides look controls, jumping and octree-backed collision checks (still needs some work)
// The camera itself serves as the player position.
// - X/Z store horizontal movement inside the maze
// - Y stores the eye height
// - a Box3 built around that eye height is used for collision tests
const MOVEMENT_BINDINGS = [
    {
        action: "forward",
        codes: ["KeyW", "KeyZ", "ArrowUp"],
        keys: ["w", "z", "arrowup"]
    },
    {
        action: "backward",
        codes: ["KeyS", "ArrowDown"],
        keys: ["s", "arrowdown"]
    },
    {
        action: "left",
        codes: ["KeyA", "KeyQ", "ArrowLeft"],
        keys: ["a", "q", "arrowleft"]
    },
    {
        action: "right",
        codes: ["KeyD", "ArrowRight"],
        keys: ["d", "arrowright"]
    }
];

class FirstPersonPlayerController
{
    // Creates the player controller and stores the movement, jumping and collision settings.
    constructor(camera, domElement, options = {})
    {
        this.camera = camera;
        this.domElement = domElement;
        this.mazeLayout = options.mazeLayout ?? null;
        this.collisionOctree = options.collisionOctree ?? null;

        this.moveSpeed = options.moveSpeed ?? 10;
        this.sprintMultiplier = options.sprintMultiplier ?? 1.6;
        this.mouseSensitivity = options.mouseSensitivity ?? 0.0022;
        this.eyeHeight = options.eyeHeight ?? 2;
        this.playerHeight = options.playerHeight ?? this.eyeHeight;
        this.floorHeight = options.floorHeight ?? (this.mazeLayout ? this.mazeLayout.floorY : 0);
        this.collisionRadius = options.collisionRadius
            ?? (this.mazeLayout ? this.mazeLayout.tileSize * 0.22 : 0.6);
        this.jumpSpeed = options.jumpSpeed ?? 10;
        this.gravity = options.gravity ?? 28;

        // Eyelevel is the current Y-position of the camera.
        this.eyeLevel = options.eyeLevel ?? (this.floorHeight + this.playerHeight);
        this.verticalVelocity = 0;
        this.isGrounded = true;
        this.jumpQueued = false;
        this.pitch = 0;
        this.yaw = 0;

        this.worldUp = new THREE.Vector3(0, 1, 0);
        this.moveInput = new THREE.Vector3();
        this.frameMovement = new THREE.Vector3();
        this.lookDirection = new THREE.Vector3();
        this.candidatePosition = new THREE.Vector3();
        this.playerBounds = new THREE.Box3();
        this.candidateBounds = new THREE.Box3();
        this.collisionCandidates = [];
        this.teleportCooldown = 0;
        this.teleportIgnoredCellKey = null;

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false
        };

        this.initEvents();
        this.syncCameraRotation();
        this.syncCameraHeight();
    }

    // Hooks keyboard, mouse and pointer-lock events to the controller.
    initEvents()
    {
        document.addEventListener("keydown", (event) => this.onKeyDown(event));
        document.addEventListener("keyup", (event) => this.onKeyUp(event));
        document.addEventListener("mousemove", (event) => this.onMouseMove(event));
        // This is used to clear movement state when the player is using the minimap or has pressed "escape" to release pointer lock.
        document.addEventListener("pointerlockchange", () => this.onPointerLockChange());

        window.addEventListener("blur", () => this.resetMovementState());

        this.domElement.addEventListener("click", () =>
        {
            this.requestPointerLock();
        });
    }

    // Requests pointer lock for the render canvas.
    requestPointerLock()
    {
        if (!this.domElement.requestPointerLock)
        {
            return Promise.resolve(false);
        }

        try
        {
            const result = this.domElement.requestPointerLock();

            if (result && typeof result.then === "function")
            {
                return result.then(() => true).catch(() => false);
            }

            return Promise.resolve(true);
        }
        catch (error)
        {
            return Promise.resolve(false);
        }
    }

    // Releases pointer lock when the UI needs the cursor for minimap interaction.
    releasePointerLock()
    {
        if (document.pointerLockElement === this.domElement && document.exitPointerLock)
        {
            document.exitPointerLock();
        }
    }

    // Normalizes the printable key value so letter-based shortcuts work across layouts.
    getKeyText(event)
    {
        return typeof event.key === "string" ? event.key.toLowerCase() : "";
    }

    // Resolves the requested movement action for one key event across different layouts.
    getMovementAction(event)
    {
        const keyText = this.getKeyText(event);

        for (const binding of MOVEMENT_BINDINGS)
        {
            if (binding.codes.includes(event.code) || binding.keys.includes(keyText))
            {
                return binding.action;
            }
        }

        return null;
    }

    // Writes one movement action into the held-key state map.
    setMovementActionState(action, isPressed)
    {
        if (action)
        {
            this.keys[action] = isPressed;
        }
    }

    // Starts movement or queues a jump when a relevant key is pressed.
    onKeyDown(event)
    {
        const movementAction = this.getMovementAction(event);

        if (movementAction)
        {
            this.setMovementActionState(movementAction, true);
            event.preventDefault();
            return;
        }

        switch (event.code)
        {
            case "ShiftLeft":
            case "ShiftRight":
                this.keys.sprint = true;
                break;

            case "Space":
                this.jumpQueued = true;
                event.preventDefault();
                break;
        }
    }

    // Stops movement when a relevant key is released.
    onKeyUp(event)
    {
        const movementAction = this.getMovementAction(event);

        if (movementAction)
        {
            this.setMovementActionState(movementAction, false);
            return;
        }

        switch (event.code)
        {
            case "ShiftLeft":
            case "ShiftRight":
                this.keys.sprint = false;
                break;
        }
    }

    // Clears held movement keys when pointer lock is released.
    onPointerLockChange()
    {
        if (document.pointerLockElement !== this.domElement)
        {
            this.resetMovementState();
        }
    }

    // Rotates the camera in response to mouse movement while pointer lock is active.
    onMouseMove(event)
    {
        if (document.pointerLockElement !== this.domElement)
        {
            return;
        }

        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

        this.syncCameraRotation();
    }

    // Resets the movement state so the player does not keep moving after focus changes.
    resetMovementState()
    {
        this.keys.forward = false;
        this.keys.backward = false;
        this.keys.left = false;
        this.keys.right = false;
        this.keys.sprint = false;
        this.jumpQueued = false;
    }

    // Creates a stable key for one maze cell so teleport state can be tracked across frames.
    getMazeCellKey(x, y)
    {
        return this.mazeLayout?.getCellKey
            ? this.mazeLayout.getCellKey(x, y)
            : `${x},${y}`;
    }

    // Applies the stored pitch/yaw values back onto the Three.js camera.
    syncCameraRotation()
    {
        this.camera.rotation.set(this.pitch, this.yaw, 0);
    }

    // Applies the current eye height to the camera's Y position.
    syncCameraHeight()
    {
        this.camera.position.y = this.eyeLevel;
    }

    // Returns the camera height that corresponds to standing on the floor.
    getGroundedEyeLevel()
    {
        return this.floorHeight + this.playerHeight;
    }

    // Moves the camera to a spawn position and optionally aims it toward a target.
    spawnAt(position, options = {})
    {
        // Spawning resets vertical movement so the player always starts in a stable grounded
        // state, even if the previous run ended mid-jump.
        this.camera.position.copy(position);
        this.eyeLevel = position.y;
        this.floorHeight = options.floorHeight ?? (position.y - this.playerHeight);
        this.verticalVelocity = 0;
        this.isGrounded = true;
        this.teleportCooldown = 0;
        this.teleportIgnoredCellKey = null;

        if (options.lookAt)
        {
            this.camera.lookAt(options.lookAt);

            const rotation = new THREE.Euler().setFromQuaternion(
                this.camera.quaternion,
                "YXZ"
            );

            this.pitch = rotation.x;
            this.yaw = rotation.y;
        }
        else
        {
            this.pitch = options.pitch ?? this.pitch;
            this.yaw = options.yaw ?? this.yaw;
        }

        this.syncCameraRotation();
        this.syncCameraHeight();
    }

    // Returns the horizontal look direction so HUD elements can match the player's view.
    getLookDirectionOnPlane()
    {
        this.camera.getWorldDirection(this.lookDirection);
        this.lookDirection.y = 0;

        if (this.lookDirection.lengthSq() === 0)
        {
            this.lookDirection.set(
                -Math.sin(this.yaw),
                0,
                -Math.cos(this.yaw)
            );
        }
        else
        {
            this.lookDirection.normalize();
        }

        return this.lookDirection;
    }

    // Returns the walkable maze cell underneath the player, preferring the nearest floor cell.
    getCurrentMazeCell()
    {
        if (!this.mazeLayout)
        {
            return null;
        }

        return this.mazeLayout.getNearestWalkableCellFromWorldPosition(
            this.camera.position.x,
            this.camera.position.z
        );
    }

    // Moves the player to the linked teleport destination while preserving the direction they are looking and preventing immediate re-teleportation.
    teleportToCell(targetCell)
    {
        if (!targetCell || targetCell.type !== "floor")
        {
            return false;
        }

        const targetPosition = this.mazeLayout.gridToWorldPosition(
            targetCell.x,
            targetCell.y,
            this.eyeLevel
        );

        this.camera.position.x = targetPosition.x;
        this.camera.position.z = targetPosition.z;
        this.syncCameraHeight();

        this.teleportCooldown = 0.15;
        this.teleportIgnoredCellKey = this.getMazeCellKey(targetCell.x, targetCell.y);

        return true;
    }

    // Activates linked teleport pads after movement and prevents instant bouncing between pairs.
    updateTeleportation(delta)
    {
        this.teleportCooldown = Math.max(0, this.teleportCooldown - delta);

        const currentCell = this.getCurrentMazeCell();

        if (!currentCell)
        {
            this.teleportIgnoredCellKey = null;
            return;
        }

        const currentCellKey = this.getMazeCellKey(currentCell.x, currentCell.y);

        if (this.teleportIgnoredCellKey && currentCellKey !== this.teleportIgnoredCellKey)
        {
            this.teleportIgnoredCellKey = null;
        }

        if (this.teleportCooldown > 0 || this.teleportIgnoredCellKey === currentCellKey)
        {
            return;
        }

        if (
            currentCell.teleportId === null
            || currentCell.teleportTargetX === null
            || currentCell.teleportTargetY === null
        )
        {
            return;
        }

        const targetCell = this.mazeLayout.getCell(
            currentCell.teleportTargetX,
            currentCell.teleportTargetY
        );

        this.teleportToCell(targetCell);
    }

    // Builds the player's collision box from a candidate eye-level position.
    getPlayerBoundsAt(position, targetBounds = this.playerBounds)
    {
        // The top of the box matches the eye point, the bottom is one player-height lower.
        // This makes the controller behave like an upright capsule/box approximation.
        targetBounds.min.set(
            position.x - this.collisionRadius,
            position.y - this.playerHeight,
            position.z - this.collisionRadius
        );

        targetBounds.max.set(
            position.x + this.collisionRadius,
            position.y,
            position.z + this.collisionRadius
        );

        return targetBounds;
    }

    // Queries the octree for wall boxes that overlap the provided player bounds.
    queryCollisionCandidates(bounds)
    {
        if (!this.collisionOctree)
        {
            // This is for debugging purposes when the octree is not available. Returning an empty array means no collisions will be detected, so the player can move freely through walls.
            this.collisionCandidates.length = 0;
            return this.collisionCandidates;
        }

        return this.collisionOctree.query(bounds, this.collisionCandidates);
    }

    // Returns true when the provided bounds overlap any wall box returned by the octree query.
    intersectsWall(bounds)
    {
        // The octree narrows the search to nearby wall boxes. This is a much cheaper operation than checking every wall in the maze, especially as the maze size grows. 
        // TODO: Will also include objects
        const candidates = this.queryCollisionCandidates(bounds);

        for (const entry of candidates)
        {
            if (bounds.intersectsBox(entry.box))
            {
                return true;
            }
        }

        return false;
    }

    // Resolves movement along one axis by only accepting the move when it does not overlap a wall.
    resolveAxisMovement(axis, amount)
    {
        if (Math.abs(amount) <= Number.EPSILON)
        {
            return false;
        }

        // This is a speculative move to test for collisions. The actual camera position is only updated after we know the move is valid, so the player can slide along walls instead of getting stuck on them.
        this.candidatePosition.copy(this.camera.position);
        this.candidatePosition[axis] += amount;

        const bounds = this.getPlayerBoundsAt(this.candidatePosition, this.candidateBounds);
        const collided = this.intersectsWall(bounds);

        if (!collided)
        {
            this.camera.position[axis] = this.candidatePosition[axis];
        }

        if (axis === "y")
        {
            this.eyeLevel = collided ? this.camera.position.y : this.candidatePosition.y;
        }

        return collided;
    }

    // Applies the queued jump request if the player is currently grounded.
    tryStartJump()
    {
        if (this.jumpQueued && this.isGrounded)
        {
            // Jumping is just an upward velocity impulse. Gravity then takes over in later frames.
            this.verticalVelocity = this.jumpSpeed;
            this.isGrounded = false;
        }

        this.jumpQueued = false;
    }

    // Applies horizontal and vertical movement for the current frame.
    move(frameMovement, delta)
    {
        // Horizontal axes are resolved separately so the player can slide along walls normally.
        this.resolveAxisMovement("x", frameMovement.x);
        this.resolveAxisMovement("z", frameMovement.z);

        // Vertical movement comes from gravity and jump velocity rather than direct input.
        const verticalMovement = this.verticalVelocity * delta;
        const hitVerticalObstacle = this.resolveAxisMovement("y", verticalMovement);
        const groundedEyeLevel = this.getGroundedEyeLevel();

        if (this.eyeLevel <= groundedEyeLevel)
        {
            // Stuck to the ground: snap to the grounded eye level and reset vertical velocity so the player does not keep trying to fall through the floor. (in case of floating errors)
            this.eyeLevel = groundedEyeLevel;
            this.verticalVelocity = 0;
            this.isGrounded = true;
        }
        else if (hitVerticalObstacle)
        {
            // Hitting something above stops upward movement; hitting something below means the
            // player landed and is grounded again.
            // TODO: ceiling still needs to be implemented
            this.verticalVelocity = 0;
            this.isGrounded = verticalMovement < 0;
        }
        else
        {
            this.isGrounded = false;
        }

        this.syncCameraHeight();
    }

    // Converts input state into first-person movement, gravity and jumping for the current frame.
    update(delta)
    {
        this.moveInput.set(
            Number(this.keys.right) - Number(this.keys.left),
            0,
            Number(this.keys.backward) - Number(this.keys.forward)
        );

        // Normalize so diagonal movement is not faster than straight movement.
        if (this.moveInput.lengthSq() > 0)
        {
            this.moveInput.normalize();
        }

        this.tryStartJump();

        if (!this.isGrounded)
        {
            // Gravity is just a constant downward acceleration, applied every frame when the player is not grounded. This makes jumping feel more natural and prevents the player from floating up indefinitely if they keep jumping while going up.
            this.verticalVelocity -= this.gravity * delta;
        }

        // Input is defined in local player space, then rotated by the camera yaw to convert it into world space movement.
        this.frameMovement.copy(this.moveInput);
        this.frameMovement.applyAxisAngle(this.worldUp, this.yaw);

        const speedMultiplier = this.keys.sprint ? this.sprintMultiplier : 1;
        this.frameMovement.multiplyScalar(this.moveSpeed * speedMultiplier * delta);

        this.move(this.frameMovement, delta);
        this.updateTeleportation(delta);
    }

    // Lets the game loop update this controller like any other animated object.
    tick(delta)
    {
        this.update(delta);
    }
}
