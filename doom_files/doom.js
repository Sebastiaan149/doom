// This file assembles the scene, maze, controls, minimap, and render loop into the running game.
// The constructor below is effectively the bootstrap pipeline for the entire project:
// 1. create the rendering objects
// 2. generate the maze + minimap overlay
// 3. convert the maze into 3D meshes
// 4. build collision data from the same maze
// 5. create the player controller
// 6. register everything with the shared game loop

// These settings control the maze generation and the static minimap resolution.
const MAZE_SETTINGS = {
    mazeWidth: 25,
    mazeHeight: 15,
    tileSize: 8,
    mainTheme: "oldForestTemple"
};

// These settings control how the generated maze is converted into 3D world geometry.
const MAZE_WORLD_SETTINGS = {
    tileSize: 8,
    wallHeight: 5,
    floorY: -3
};

// Owns the high-level game lifecycle and the connections between all subsystems.
class World
{
    // Creates the full game world and wires every subsystem together.
    constructor(container)
    {
        this.container = container;
        this.camera = createCamera();
        this.renderer = createRenderer();
        this.scene = createScene();

        this.loop = new Loop(this.camera, this.scene, this.renderer);
        this.container.append(this.renderer.domElement);

        // Lighting and 2D overlays are added before the maze so the UI is already present
        // when the first rendered frame appears.
        this.scene.add(createLights());
        addControlsHint(this.container);

        // The minimap creation step also generates the maze data structure. That maze object is
        // reused by the 3D builder so the 2D and 3D views always describe the same layout.
        this.minimap = addMazeMapOverlay(this.container, MAZE_SETTINGS);
        this.maze = this.minimap.maze;

        // The 3D builder returns both the visible meshes and the shared helper objects used to
        // navigate the maze in world space.
        const mazeWorld = buildMazeWorldFromData(this.maze, {
            scene: this.scene,
            ...MAZE_WORLD_SETTINGS
        });

        this.mazeGroup = mazeWorld.group;
        this.mazeLayout = mazeWorld.layout;
        this.collisionOctree = mazeWorld.collisionOctree;

        window.generatedMazeLayout = this.mazeLayout;
        window.generatedCollisionOctree = this.collisionOctree;

        // The player controller receives the camera plus the collision data generated from the
        // maze walls. This keeps movement logic completely separate from world-building logic.
        this.controls = new FirstPersonPlayerController(this.camera, this.renderer.domElement, {
            mazeLayout: this.mazeLayout,
            collisionOctree: this.collisionOctree,
            moveSpeed: this.mazeLayout.tileSize * 1.25,
            eyeHeight: 2.1,
            playerHeight: 2.1,
            floorHeight: this.mazeLayout.floorY,
            collisionRadius: this.mazeLayout.tileSize * 0.2,
            jumpSpeed: this.mazeLayout.tileSize * 1.35,
            gravity: this.mazeLayout.tileSize * 4
        });

        // Spawn first, then attach the minimap to the live player state so the arrow starts at
        // the correct location and orientation immediately.
        this.spawnPlayerAtMazeStart();
        this.minimap.trackPlayer(this.controls, this.mazeLayout);

        // The loop only knows how to call `tick(delta)`, so every animated system is registered
        // through this shared `updatables` array.
        this.registerUpdatable(this.controls);
        this.registerUpdatable(this.minimap);

        for (const child of this.mazeGroup.children)
        {
            this.registerUpdatable(child);
        }

        this.resizer = new Resizer(this.container, this.camera, this.renderer);
    }

    // Registers one tickable object with the shared loop.
    registerUpdatable(object)
    {
        if (object?.tick)
        {
            this.loop.updatables.push(object);
        }
    }

    // Places the player on the generated start tile and aims the first view toward the maze goal.
    spawnPlayerAtMazeStart()
    {
        // The camera stores the player's eye position, not the feet position. The layout helper
        // gives us the floor position for the start tile, so we offset it by the eye height.
        const spawnPosition = this.mazeLayout.getStartWorldPosition(
            this.mazeLayout.floorY + this.controls.eyeHeight
        );

        // Looking toward the goal gives the player an immediate sense of direction when the maze
        // first loads. If no goal exists, we fall back to the center of the scene.
        const lookTarget = this.maze.goal
            ? this.mazeLayout.getGoalWorldPosition(spawnPosition.y)
            : new THREE.Vector3(0, spawnPosition.y, 0);

        this.controls.spawnAt(spawnPosition, {
            lookAt: lookTarget
        });
    }

    // Starts the animation loop for rendering and game updates.
    start()
    {
        this.loop.start();
    }

    // Stops the animation loop when the world should pause or shut down.
    stop()
    {
        this.loop.stop();
    }
}

// Boots the game once the page has loaded the target container element.
function main()
{
    const container = document.querySelector("#sceneContainer");
    const world = new World(container);
    world.start();

    // Try to enter first-person mode immediately. Browsers may reject this without a user
    // gesture, so the request is best-effort and silently falls back to the normal click flow.
    window.setTimeout(() =>
    {
        world.controls.requestPointerLock();
    }, 0);
}

main();
