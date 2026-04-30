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
    mainTheme: "castle"
};

// These settings control how the generated maze is converted into 3D world geometry.
const MAZE_WORLD_SETTINGS = {
    tileSize: 8,
    wallHeight: 6,
    floorY: -3,
    ceilingThickness: 1.05
};

// The available maze themes are exposed in the UI so the world can be regenerated on demand.
const MAZE_THEME_OPTIONS = [
    { value: "castle", label: "Castle" },
    { value: "industrial", label: "Industrial" },
    { value: "oldForestTemple", label: "Old Forest Temple" },
    { value: "fireCave", label: "Fire Cave" },
    { value: "iceCave", label: "Frost Cave" },
    { value: "random", label: "Random Mix" }
];

const MAZE_THEME_LIGHTING = {
    castle: {
        skyTop: 0x09101f,
        skyBottom: 0x1e2b44,
        hemiSky: 0xb8c6e6,
        hemiGround: 0x2a2332,
        hemiIntensity: 0.72,
        ambientIntensity: 0.284,
        sunColor: 0xe2ebff,
        sunIntensity: 2.8,
        sphereColor: 0xe6edff,
        sphereScale: 1.0,
        sphereName: "moonSphere"
    },
    industrial: {
        skyTop: 0x0f241a,
        skyBottom: 0x21362b,
        hemiSky: 0xa8c5af,
        hemiGround: 0x1f2a23,
        hemiIntensity: 0.7,
        ambientIntensity: 0.284,
        sunColor: 0xdcf8c8,
        sunIntensity: 2.6,
        sphereColor: 0xdff8ce,
        sphereScale: 1.0,
        sphereName: "moonSphere"
    },
    oldForestTemple: {
        skyTop: 0x203a22,
        skyBottom: 0x355d31,
        hemiSky: 0xbfd9a7,
        hemiGround: 0x273222,
        hemiIntensity: 0.78,
        ambientIntensity: 0.285,
        sunColor: 0xfff3ba,
        sunIntensity: 3.4,
        sphereColor: 0xfff4c4,
        sphereScale: 1.08,
        sphereName: "sunSphere"
    },
    fireCave: {
        skyTop: 0x5a1616,
        skyBottom: 0x9a2b1f,
        hemiSky: 0xf2a16b,
        hemiGround: 0x3a1711,
        hemiIntensity: 0.76,
        ambientIntensity: 0.285,
        sunColor: 0xffd17a,
        sunIntensity: 3.2,
        sphereColor: 0xffc85c,
        sphereScale: 1.08,
        sphereName: "sunSphere"
    },
    iceCave: {
        skyTop: 0xcfefff,
        skyBottom: 0x86bddf,
        hemiSky: 0xf4fbff,
        hemiGround: 0x9dc0d7,
        hemiIntensity: 0.95,
        ambientIntensity: 0.28,
        sunColor: 0xf8ffff,
        sunIntensity: 3.2,
        sphereColor: 0xf8ffff,
        sphereScale: 1.02,
        sphereName: "sunSphere"
    },
    random: {
        skyTop: 0x9fd8f2,
        skyBottom: 0xd7f0fb,
        hemiSky: 0xeef9ff,
        hemiGround: 0x8daca6,
        hemiIntensity: 0.78,
        ambientIntensity: 0.285,
        sunColor: 0xfff2c7,
        sunIntensity: 3.0,
        sphereColor: 0xfff6da,
        sphereScale: 1.0,
        sphereName: "sunSphere"
    }
};

const MAZE_THEME_ATMOSPHERE = {
    castle: {
        color: "#121b2c",
        near: 118,
        far: 420
    },
    industrial: {
        color: "#183024",
        near: 118,
        far: 420
    },
    oldForestTemple: {
        color: "#355a31",
        near: 105,
        far: 280
    },
    fireCave: {
        color: "#8f281f",
        near: 122,
        far: 430
    },
    iceCave: {
        color: "#d9f5ff",
        near: 108,
        far: 300
    },
    random: {
        color: "#cfefff",
        near: 82,
        far: 420
    }
};

// Owns the game lifecycle and the connections between all the different components.
class World
{
    // Creates the full game world and connects every component together.
    constructor(container)
    {
        this.container = container;
        this.currentTheme = MAZE_SETTINGS.mainTheme;
        this.camera = createCamera();
        this.renderer = createRenderer();
        this.scene = createScene();
        this.themeLights = createLights(this.currentTheme, MAZE_THEME_LIGHTING[this.currentTheme]);
        this.scene.add(this.camera);
        this.scene.add(this.themeLights);
        attachCameraLight(this.camera);
        addControlsHint(this.container);
        this.renderPipeline = createScreenSpaceAmbientOcclusionRenderer(
            this.renderer,
            this.scene,
            this.camera
        );

        this.loop = new Loop(this.camera, this.scene, this.renderer, this.renderPipeline);
        this.themeLights.trackCamera?.(this.camera);
        this.registerUpdatable(this.themeLights);
        this.container.append(this.renderer.domElement);
        this.controls = null;
        this.minimap = null;
        this.mazeWorld = null;
        this.mazeGroup = null;
        this.mazeLayout = null;
        this.collisionOctree = null;
        this.maze = null;
        this.textureDisplacementEnabled = false;
        this.pendingWarmupHandle = null;
        this.pendingWarmupTimeoutId = null;

        this.buildMazeForTheme(this.currentTheme);

        this.resizer = new Resizer(this.container, this.camera, this.renderer, this.renderPipeline);
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

    applyThemeAtmosphere(theme)
    {
        const atmosphere = MAZE_THEME_ATMOSPHERE[theme] ?? MAZE_THEME_ATMOSPHERE.random;
        const color = new THREE.Color(atmosphere.color);

        this.scene.background = new THREE.Color(atmosphere.color);
        this.scene.fog = new THREE.Fog(color, atmosphere.near, atmosphere.far);
    }

    clearThemeAtmosphere()
    {
        this.scene.background = new THREE.Color("#d9f0fb");
        this.scene.fog = new THREE.Fog("#d9f0fb", 160, 500);
    }

    syncRenderAtmosphere()
    {
        this.applyThemeAtmosphere(this.currentTheme);
        this.syncThemeLighting(this.currentTheme);
    }

    syncThemeLighting(theme = this.currentTheme)
    {
        if (this.themeLights)
        {
            this.unregisterUpdatable(this.themeLights);
            this.scene.remove(this.themeLights);
        }

        this.themeLights = createLights(theme, MAZE_THEME_LIGHTING[theme] ?? MAZE_THEME_LIGHTING.random);
        this.themeLights.trackCamera?.(this.camera);
        this.scene.add(this.themeLights);
        this.registerUpdatable(this.themeLights);
    }

    clearWarmRenderPrograms()
    {
        if (typeof window === "undefined")
        {
            return;
        }

        if (this.pendingWarmupHandle && window.cancelIdleCallback)
        {
            window.cancelIdleCallback(this.pendingWarmupHandle);
        }

        if (this.pendingWarmupTimeoutId)
        {
            window.clearTimeout(this.pendingWarmupTimeoutId);
        }

        this.pendingWarmupHandle = null;
        this.pendingWarmupTimeoutId = null;
    }

    warmRenderPrograms()
    {
        this.clearWarmRenderPrograms();

        const runWarmup = async () =>
        {
            this.pendingWarmupHandle = null;
            this.pendingWarmupTimeoutId = null;

            try
            {
                if (typeof this.renderer.compileAsync === "function")
                {
                    await this.renderer.compileAsync(this.scene, this.camera);
                }
                else
                {
                    this.renderer.compile(this.scene, this.camera);
                }
            }
            catch (error)
            {
                console.warn("Renderer shader warmup failed.", error);
            }
        };

        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function")
        {
            this.pendingWarmupHandle = window.requestIdleCallback(() =>
            {
                runWarmup();
            }, { timeout: 180 });
            return;
        }

        if (typeof window !== "undefined")
        {
            this.pendingWarmupTimeoutId = window.setTimeout(() =>
            {
                runWarmup();
            }, 34);
            return;
        }

        runWarmup();
    }

    // Removes the old maze/minimap instance so a new theme can be generated cleanly.
    teardownMazeSystems()
    {
        this.clearWarmRenderPrograms();

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
                textureDisplacementEnabled: this.textureDisplacementEnabled,
                onThemeChange: (nextTheme) => this.rebuildMaze(nextTheme),
                onTextureDisplacementChange: (enabled) => this.setTextureDisplacementEnabled(enabled)
            });

            const maze = minimap.maze;
            mazeWorld = buildMazeWorldFromData(maze, {
                scene: this.scene,
                renderer: this.renderer,
                attachToScene: false,
                textureDisplacementEnabled: this.textureDisplacementEnabled,
                useVisibilityCulling: false,
                visibilityWarmupEnabled: false,
                maxRegionLights: 1,
                maxCorridorLights: 0,
                maxShadowCastingLights: 6,
                maxAmbientTileLights: 12,
                maxAnimatedEmitterLights: 18,
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

        this.currentTheme = theme;
        this.syncRenderAtmosphere();
        this.minimap.mount?.();
        this.mazeWorld.mount?.();
        this.mazeWorld.whenTexturesReady?.().then(() =>
        {
            if (this.mazeWorld !== themeSystems.mazeWorld)
            {
                return;
            }

            this.renderNow();
        });

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
        this.mazeWorld.trackPlayer?.(this.controls);
        this.controls.onTeleport = () => this.mazeWorld?.updateVisibilityNow?.();
        this.minimap.trackPlayer(this.controls, this.mazeLayout);

        this.registerUpdatable(this.minimap);
        this.registerUpdatableTree(this.mazeGroup);
        this.warmRenderPrograms();
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

    rebuildMazeRenderingForCurrentMaze()
    {
        if (!this.maze)
        {
            return;
        }

        this.clearWarmRenderPrograms();

        const previousMazeWorld = this.mazeWorld;
        const previousMazeGroup = this.mazeGroup;

        if (previousMazeGroup)
        {
            this.unregisterUpdatableTree(previousMazeGroup);
        }

        const nextMazeWorld = buildMazeWorldFromData(this.maze, {
            scene: this.scene,
            renderer: this.renderer,
            attachToScene: false,
            textureDisplacementEnabled: this.textureDisplacementEnabled,
            useVisibilityCulling: false,
            visibilityWarmupEnabled: false,
            maxRegionLights: 1,
            maxCorridorLights: 0,
            maxShadowCastingLights: 6,
            maxAmbientTileLights: 12,
            maxAnimatedEmitterLights: 18,
            ...MAZE_WORLD_SETTINGS
        });

        previousMazeWorld?.dispose?.();

        this.mazeWorld = nextMazeWorld;
        this.mazeGroup = nextMazeWorld.group;
        this.mazeLayout = nextMazeWorld.layout;
        this.collisionOctree = nextMazeWorld.collisionOctree;

        this.mazeWorld.mount?.();
        this.controls.updateMazeContext(this.createPlayerSettings(this.mazeLayout));
        this.mazeWorld.trackPlayer?.(this.controls);
        this.controls.onTeleport = () => this.mazeWorld?.updateVisibilityNow?.();
        this.minimap.trackPlayer(this.controls, this.mazeLayout);

        window.generatedMazeLayout = this.mazeLayout;
        window.generatedCollisionOctree = this.collisionOctree;

        this.registerUpdatableTree(this.mazeGroup);
        this.syncRenderAtmosphere();
        this.warmRenderPrograms();
        this.mazeWorld.whenTexturesReady?.().then(() =>
        {
            if (this.mazeWorld !== nextMazeWorld)
            {
                return;
            }

            this.renderNow();
        });
    }

    // Toggles the displacement rendering pipeline without regenerating the maze data.
    setTextureDisplacementEnabled(enabled)
    {
        const nextEnabled = !!enabled;

        if (nextEnabled === this.textureDisplacementEnabled)
        {
            return;
        }

        this.textureDisplacementEnabled = !!enabled;
        this.rebuildMazeRenderingForCurrentMaze();
        this.renderNow();
    }

    renderNow()
    {
        this.loop.render();
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
