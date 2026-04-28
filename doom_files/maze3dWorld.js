// This file converts the generated 2D maze data into meshes placed in the 3D world.

// Builds the visible floors, walls and teleport markers for a generated maze.
function buildMazeWorldFromData(maze, options = {})
{
    const scene = options.scene;
    const attachToScene = options.attachToScene ?? true;

    if (!scene)
    {
        throw new Error("buildMazeWorldFromData requires options.scene");
    }

    const layout = createMazeLayout(maze, options);

    const tileSize = layout.tileSize;
    const wallHeight = layout.wallHeight;
    const floorThickness = layout.floorThickness;
    const floorY = layout.floorY;
    const wallY = layout.wallY;
    const ceilingY = floorY + wallHeight;
    const materialLibrary = createMazeWorldMaterialLibrary({
        renderer: options.renderer,
        tileSize,
        wallHeight,
        floorY
    });
    const decorationLayer = createMazeWorldDecorations(maze, layout, options);

    // Teleport spheres float slightly above the floor
    const sphereRadius = options.teleportSphereRadius ?? tileSize * 0.28;  // Sphere is temporarily used to visualize the transportation points.
    const sphereY = floorY + floorThickness / 2 + sphereRadius + 0.08;

    // This group holds the maze meshes (still temporary)
    const group = new THREE.Group();  // Likely to change when handling collisions
    group.name = "mazeWorld";
    group.userData.mazeLayout = layout;

    const floorGeometry = new THREE.PlaneGeometry(tileSize, tileSize).toNonIndexed();
    floorGeometry.rotateX(-Math.PI / 2);
    const ceilingGeometry = new THREE.PlaneGeometry(tileSize, tileSize).toNonIndexed();
    ceilingGeometry.rotateX(Math.PI / 2);
    const wallGeometry = new THREE.BoxGeometry(tileSize, wallHeight, tileSize).toNonIndexed();
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 20, 20);

    // Creates the floor mesh
    function createFloorMesh(x, y, currentCell)
    {
        const placement = {
            worldX: layout.gridToWorldX(x),
            worldZ: layout.gridToWorldZ(y),
            tileSize
        };
        const material = materialLibrary.createFloorMaterialInstance(currentCell, {
            worldX: placement.worldX,
            worldZ: placement.worldZ,
            tileSize
        });
        const geometry = materialLibrary.createFloorGeometry(floorGeometry, currentCell, placement);
        const mesh = new THREE.Mesh(geometry, material);

        // Every tile occupies a predictable centered position in world space. Reusing the layout
        // helper keeps mesh placement aligned with collision and minimap math.
        mesh.position.copy(layout.gridToWorldPosition(x, y, floorY));
        mesh.receiveShadow = true;

        if (currentCell.special === "start")
        {
            mesh.name = "mazeStartTile";
        }
        else if (currentCell.special === "goal")
        {
            mesh.name = "mazeGoalTile";
        }

        return mesh;
    }

    // Creates a ceiling tile above one walkable maze cell.
    function createCeilingMesh(x, y, currentCell)
    {
        const placement = {
            worldX: layout.gridToWorldX(x),
            worldZ: layout.gridToWorldZ(y),
            tileSize
        };
        const material = materialLibrary.createCeilingMaterialInstance(currentCell, {
            worldX: placement.worldX,
            worldZ: placement.worldZ,
            tileSize
        });
        const geometry = materialLibrary.createCeilingGeometry(ceilingGeometry, currentCell, placement);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.copy(layout.gridToWorldPosition(x, y, ceilingY));
        mesh.receiveShadow = true;

        return mesh;
    }

    // Creates the wall mesh
    function createWallMesh(x, y, currentCell)
    {
        const placement = {
            worldX: layout.gridToWorldX(x),
            worldZ: layout.gridToWorldZ(y),
            worldY: wallY,
            tileSize,
            wallHeight,
            floorY
        };
        const material = materialLibrary.createWallMaterialSet(currentCell.wallMaterial, placement);
        const geometry = materialLibrary.createWallGeometry(wallGeometry, currentCell.wallMaterial, placement);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.copy(layout.gridToWorldPosition(x, y, wallY));
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    // Creates the animated teleport marker mesh for one linked teleport cell.
    function createTeleportMesh(x, y, currentCell)
    {
        const sphereColor = teleportColorById.get(currentCell.teleportId) ?? new THREE.Color("#db4fff");
        const sphereMaterial = materialLibrary.getTeleportMaterial(`#${sphereColor.getHexString()}`);
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

        sphere.position.copy(layout.gridToWorldPosition(x, y, sphereY));

        sphere.castShadow = true;
        sphere.receiveShadow = true;
        sphere.name = `teleport_${currentCell.teleportId}`;

        // Simple animation (still TODO)
        sphere.tick = (delta) =>
        {
            sphere.rotation.y += delta * 2.5;
        };

        return sphere;
    }

    // Chooses a random color for teleportation points (easily distinguishable from each other)
    function randomColorFromSeed(seed)
    {
        const hue = (seed * 137.508) % 360;
        const color = new THREE.Color();
        color.setHSL(hue / 360, 0.8, 0.58);
        return color;
    }

    const teleportColorById = new Map();

    // Assign the colors for the teleportation points
    if (Array.isArray(maze.teleportPairs))
    {
        for (const pair of maze.teleportPairs)
        {
            const baseColor = randomColorFromSeed(pair.from.teleportId + pair.to.teleportId);
            teleportColorById.set(pair.from.teleportId, baseColor.clone());
            teleportColorById.set(pair.to.teleportId, baseColor.clone());
        }
    }

    const wallCollisionEntries = [];

    // Creates an axis-aligned collision box for one wall tile so it can be inserted into the octree.
    function createWallCollisionEntry(x, y)
    {
        return {
            // The wall collision box matches the visible wall cube dimensions so the physics and
            // visuals describe the same obstacle volume.
            box: new THREE.Box3().setFromCenterAndSize(
                layout.gridToWorldPosition(x, y, wallY),
                new THREE.Vector3(tileSize, wallHeight, tileSize)
            ),
            type: "wall",
            cell: { x, y }
        };
    }

    for (let y = 0; y < maze.height; y++)
    {
        for (let x = 0; x < maze.width; x++)
        {
            const currentCell = maze.cells[y][x];

            // This first pass lays down the static maze geometry and simultaneously gathers the
            // wall boxes that will later be inserted into the collision octree.
            if (currentCell.type === "wall")
            {
                group.add(createWallMesh(x, y, currentCell));
                wallCollisionEntries.push(createWallCollisionEntry(x, y));
            }
            else
            {
                group.add(createFloorMesh(x, y, currentCell));
                group.add(createCeilingMesh(x, y, currentCell));
                if (currentCell.teleportId !== null)
                {
                    // Teleport markers sit on top of an existing floor tile, so they can be
                    // created immediately after the floor mesh without a second full maze pass.
                    group.add(createTeleportMesh(x, y, currentCell));
                }
            }
        }
    }

    // The octree is built once when the maze is created. After that, player collision queries
    // can ask for "nearby walls" instead of testing against every wall in the maze.
    // Prefer the high-resolution timer and present more precision. If the octree recorded
    // its own internal build time, prefer that value as it measures exactly the work done
    // inside the octree implementation (including inserts and any subdivides).
    const now = typeof performance !== "undefined" && performance.now
        ? performance.now.bind(performance)
        : Date.now;

    const collisionOctree = createCollisionOctree(wallCollisionEntries);

    // Use the octree's internal timing if available.
    let octreeBuildMs = typeof collisionOctree.buildTimeMs === "number"
        ? collisionOctree.buildTimeMs
        : NaN;

    // If the measured build time is extremely small (zero because of timer
    // resolution), run a quick micro-benchmark that rebuilds the octree several
    // times and averages the result so the reported number is meaningful.
    if (!Number.isFinite(octreeBuildMs) || octreeBuildMs < 0.001)
    {
        const runs = 30;
        const benchStart = now();
        for (let i = 0; i < runs; i++)
        {
            // Recreate the octree to measure the same work the constructor does.
            createCollisionOctree(wallCollisionEntries);
        }
        const benchEnd = now();
        octreeBuildMs = (benchEnd - benchStart) / runs;
    }

    collisionOctree.buildTimeMs = octreeBuildMs;
    group.userData.collisionOctree = collisionOctree;
    group.userData.collisionOctreeBuildMs = octreeBuildMs;

    // Log with microsecond precision to make very fast builds visible.
    const octreeBuildUs = octreeBuildMs * 1000;
    console.info(`Octree build: ${octreeBuildMs.toFixed(6)} ms (${Math.round(octreeBuildUs)} µs, ${wallCollisionEntries.length} walls)`);

    group.add(decorationLayer.group);

    let isMounted = false;

    function mount()
    {
        if (isMounted)
        {
            return;
        }

        scene.add(group);
        isMounted = true;
    }

    if (attachToScene)
    {
        mount();
    }

    // Returns both the generated mesh group and the shared layout helper used to place it.
    return {
        group,
        layout,
        collisionOctree,
        octreeBuildTimeMs: octreeBuildMs,
        mount,
        dispose()
        {
            if (isMounted)
            {
                scene.remove(group);
            }
            else if (group.parent)
            {
                group.parent.remove(group);
            }

            isMounted = false;
            decorationLayer.dispose();
            floorGeometry.dispose();
            ceilingGeometry.dispose();
            wallGeometry.dispose();
            sphereGeometry.dispose();
            materialLibrary.dispose();
        }
    };
}
