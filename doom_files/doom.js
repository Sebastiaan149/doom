// This file sets up the scene, maze, controls, minimap,and render loop into the running game.
// The constructor below is the pipeline for the entire project:
// 1. Create the rendering objects
// 2. Generate the maze + minimap overlay
// 3. Convert the maze into 3D meshes
// 4. Build collision data from the same maze
// 5. Create the player controller
// 6. Register everything within the shared game loop

// These basic settings control the maze generation and the static minimap resolution.
const MAZE_SETTINGS = {
    mazeWidth: 25,
    mazeHeight: 15,
    tileSize: 8,
    mainTheme: "fireCave"
};

// These settings control how the generated maze is converted into 3D world geometry.
const MAZE_WORLD_SETTINGS = {
    tileSize: 8,
    wallHeight: 6,
    floorY: -3
};

// The available maze themes are exposed in the UI so the world can be regenerated on demand.
const MAZE_THEME_OPTIONS = [
    { value: "castle", label: "Castle" },
    { value: "industrial", label: "Industrial" },
    { value: "oldForestTemple", label: "Old Forest Temple" },
    { value: "fireCave", label: "Fire Cave" },
    { value: "iceCave", label: "Ice Cave" },
    { value: "random", label: "Random Mix" }
];

// Owns the game lifecycle and the connections between all the different components.
class World
{
    // Creates the full game world and connects every component together.
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

        this.currentTheme = MAZE_SETTINGS.mainTheme;
        this.controls = null;
        this.minimap = null;
        this.mazeWorld = null;
        this.mazeGroup = null;
        this.mazeLayout = null;
        this.collisionOctree = null;
        this.maze = null;

        this.buildMazeForTheme(this.currentTheme);

        this.resizer = new Resizer(this.container, this.camera, this.renderer);
    }

    // Registers one tickable object with the shared loop.
    registerUpdatable(object)
    {
        if (object?.tick && !this.loop.updatables.includes(object))
        {
            this.loop.updatables.push(object);
        }
    }

    // Removes one tickable object from the shared loop.
    unregisterUpdatable(object)
    {
        this.loop.updatables = this.loop.updatables.filter((candidate) => candidate !== object);
    }

    // Registers every tickable object inside a group hierarchy.
    registerUpdatableTree(root)
    {
        root?.traverse((object) =>
        {
            this.registerUpdatable(object);
        });
    }

    // Removes every tickable object inside a group hierarchy.
    unregisterUpdatableTree(root)
    {
        if (!root)
        {
            return;
        }

        const objectsToRemove = new Set();
        root.traverse((object) => objectsToRemove.add(object));

        this.loop.updatables = this.loop.updatables.filter((object) => !objectsToRemove.has(object));
    }

    // Derives the player-controller settings from the current maze layout.
    createPlayerSettings(layout)
    {
        return {
            mazeLayout: layout,
            collisionOctree: this.collisionOctree,
            moveSpeed: layout.tileSize * 1.25,
            eyeHeight: 2.1,
            playerHeight: 2.1,
            floorHeight: layout.floorY,
            collisionRadius: layout.tileSize * 0.2,
            jumpSpeed: layout.tileSize * 1.35,
            gravity: layout.tileSize * 4
        };
    }

    // Removes the old maze/minimap instance so a new theme can be generated cleanly.
    teardownMazeSystems()
    {
        if (this.minimap)
        {
            this.unregisterUpdatable(this.minimap);
            this.minimap.destroy();
            this.minimap = null;
        }

        if (this.mazeGroup)
        {
            this.unregisterUpdatableTree(this.mazeGroup);
        }

        if (this.mazeWorld?.dispose)
        {
            this.mazeWorld.dispose();
        }
        else if (this.mazeGroup)
        {
            this.scene.remove(this.mazeGroup);
        }

        this.mazeWorld = null;
        this.mazeGroup = null;
        this.mazeLayout = null;
        this.collisionOctree = null;
        this.maze = null;
    }

    // Creates a full maze/minimap/world bundle without replacing the live one yet.
    createThemeSystems(theme, options = {})
    {
        const shouldKeepExpanded = options.keepMapExpanded ?? false;
        let minimap = null;
        let mazeWorld = null;

        try
        {
            minimap = addMazeMapOverlay(this.container, {
                ...MAZE_SETTINGS,
                mainTheme: theme,
                availableThemes: MAZE_THEME_OPTIONS,
                initialExpanded: shouldKeepExpanded,
                attachToContainer: false,
                onThemeChange: (nextTheme) => this.rebuildMaze(nextTheme)
            });

            const maze = minimap.maze;
            mazeWorld = buildMazeWorldFromData(maze, {
                scene: this.scene,
                renderer: this.renderer,
                attachToScene: false,
                ...MAZE_WORLD_SETTINGS
            });

            return {
                minimap,
                maze,
                mazeWorld,
                mazeGroup: mazeWorld.group,
                mazeLayout: mazeWorld.layout,
                collisionOctree: mazeWorld.collisionOctree
            };
        }
        catch (error)
        {
            minimap?.destroy?.();
            mazeWorld?.dispose?.();
            throw error;
        }
    }

    // Releases a not-yet-committed theme bundle when a rebuild fails mid-flight.
    disposeThemeSystems(themeSystems)
    {
        if (!themeSystems)
        {
            return;
        }

        themeSystems.minimap?.destroy?.();
        themeSystems.mazeWorld?.dispose?.();
    }

    // Replaces the live maze with a fully built theme bundle.
    applyThemeSystems(theme, themeSystems)
    {
        this.teardownMazeSystems();

        this.minimap = themeSystems.minimap;
        this.maze = themeSystems.maze;
        this.mazeWorld = themeSystems.mazeWorld;
        this.mazeGroup = themeSystems.mazeGroup;
        this.mazeLayout = themeSystems.mazeLayout;
        this.collisionOctree = themeSystems.collisionOctree;

        this.minimap.mount?.();
        this.mazeWorld.mount?.();

        window.generatedMazeLayout = this.mazeLayout;
        window.generatedCollisionOctree = this.collisionOctree;

        if (!this.controls)
        {
            this.controls = new FirstPersonPlayerController(
                this.camera,
                this.renderer.domElement,
                this.createPlayerSettings(this.mazeLayout)
            );
            this.registerUpdatable(this.controls);
        }
        else
        {
            this.controls.updateMazeContext(this.createPlayerSettings(this.mazeLayout));
        }

        this.spawnPlayerAtMazeStart();
        this.minimap.trackPlayer(this.controls, this.mazeLayout);

        this.registerUpdatable(this.minimap);
        this.registerUpdatableTree(this.mazeGroup);
        this.currentTheme = theme;
    }

    // Builds the maze, minimap, world geometry, collision, and player sync for one selected theme.
    buildMazeForTheme(theme, options = {})
    {
        const themeSystems = this.createThemeSystems(theme, options);

        try
        {
            this.applyThemeSystems(theme, themeSystems);
        }
        catch (error)
        {
            this.disposeThemeSystems(themeSystems);

            if (this.minimap === themeSystems.minimap)
            {
                this.minimap = null;
                this.maze = null;
                this.mazeWorld = null;
                this.mazeGroup = null;
                this.mazeLayout = null;
                this.collisionOctree = null;
            }

            throw error;
        }
    }

    // Rebuilds the live maze when the user selects a different theme from the UI.
    rebuildMaze(theme)
    {
        if (!theme || theme === this.currentTheme)
        {
            return;
        }

        const previousTheme = this.currentTheme;
        const keepMapExpanded = this.minimap?.getIsExpanded?.() ?? false;

        try
        {
            this.buildMazeForTheme(theme, {
                keepMapExpanded
            });
        }
        catch (error)
        {
            console.error(`Failed to rebuild maze theme "${theme}".`, error);

            const lostLiveMaze = !this.minimap || !this.mazeWorld || !this.maze;

            if (lostLiveMaze && previousTheme && previousTheme !== theme)
            {
                try
                {
                    this.buildMazeForTheme(previousTheme, {
                        keepMapExpanded
                    });
                }
                catch (fallbackError)
                {
                    console.error(`Failed to restore previous maze theme "${previousTheme}".`, fallbackError);
                }
            }
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
