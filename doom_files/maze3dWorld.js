// This file converts the generated 2D maze data into meshes placed in the 3D world.
// It is the bridge between the abstract maze data (`cells`, `start`, `goal`, teleports) and
// the concrete Three.js scene graph used for rendering and collision.

// Builds the visible floors, walls, and teleport markers for a generated maze.
// TODO: change this with textures
function buildMazeWorldFromData(maze, options = {})
{
    const scene = options.scene;

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

    // Teleport spheres float slightly above the floor so they read as interactable markers
    // instead of being visually merged into the ground plane.
    const sphereRadius = options.teleportSphereRadius ?? tileSize * 0.28;  // sphere is temporarily used to visualize the transportation points.
    const sphereY = floorY + floorThickness / 2 + sphereRadius + 0.08;

    // This group will hold all the maze-related meshes, making it easier to manage them as a single unit in the scene.
    const group = new THREE.Group();  // Likely to change when handling collisions
    group.name = "mazeWorld";
    group.userData.mazeLayout = layout;

    //const floorGeometry = new THREE.BoxGeometry(tileSize, floorThickness, tileSize);
    const floorGeometry = new THREE.PlaneGeometry(tileSize, tileSize);
    floorGeometry.rotateX(-Math.PI / 2);
    const wallGeometry = new THREE.BoxGeometry(tileSize, wallHeight, tileSize);
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 20, 20);

    // These color maps define the colors for different wall materials
    // TODO: replace these with actual textures
    const wallColorMap = {
        castleBrickWall: "#3d2621",
        castleStoneWall: "#323335",
        industrialDarkMetalWall: "#000000",
        industrialPanelWall: "#696969",
        industrialConcreteWall: "#a4a4a4",
        forestTempleMossWall: "#09a037",
        forestTempleRootWall: "#4f7727",
        fireCaveBasaltWall: "#711800",
        fireCaveObsidianWall: "#48062a",
        iceCaveBlueIceWall: "#045d9d",
        iceCaveCrystalWall: "#63beff",
        voidRockWall: "#0f0f0f",
        rock: "#0f0f0f"
    };

    // This color map defines the colors for different floor types and special tiles.
    // TODO: replace these with actual textures
    const floorColorMap = {
        castleStoneFloor: "#8a8282",
        castleTileFloor: "#ffffff",
        castleCrackedStone: "#574b3b",
        castleCrackedTile: "#a89c7d",
        castleMossStone: "#a2b886",
        castleRuneTile: "#e6d789",
        castleBannerTile: "#d7b778",

        industrialMetalFloor: "#b7c4cf",
        industrialGrateFloor: "#d3dce1",
        industrialConcreteFloor: "#c8c1b6",
        industrialDarkTileFloor: "#a7a0ab",
        industrialOilFloor: "#8b7c53",
        industrialPatchFloor: "#d8d3ca",
        industrialBrokenFloor: "#9f9384",

        forestTempleStoneFloor: "#b9c1a1",
        forestTempleMossFloor: "#b8d48d",
        forestTempleRootFloor: "#c0a276",
        forestTempleVineFloor: "#8fd97d",
        forestTempleRuneFloor: "#e4dd95",

        fireCaveAshFloor: "#d9b191",
        fireCaveDarkBasaltFloor: "#aaa09b",
        fireCaveLavaCrackFloor: "#ff9c5a",
        fireCaveEmberFloor: "#ffd56c",
        fireCaveScorchFloor: "#b88c6d",

        iceCavePackedSnowFloor: "#eef4fb",
        iceCaveIceFloor: "#c7ebff",
        iceCaveCrystalFloor: "#dffcff",
        iceCaveSlipperyIceFloor: "#b4e1ff",
        iceCaveFrostFloor: "#f7fcff",

        teleportPad: "#db4fff",

        startPad: "#46ff46",
        goalPad: "#ff2a2a",
    };

    // Caches for materials to avoid creating multiple material instances with the same color, which can be performance-heavy. Reuses materials based on their color keys.
    const standardMaterialCache = new Map();
    const teleportMaterialCache = new Map();

    // Retrieves a standard material for a given hex color, creating and caching it if it doesn't already exist.
    function getStandardMaterial(hexColor)
    {
        if (!standardMaterialCache.has(hexColor))
        {
            standardMaterialCache.set(
                hexColor,
                new THREE.MeshStandardMaterial({
                    color: hexColor
                })
            );
        }

        return standardMaterialCache.get(hexColor);
    }

    // Similar to getStandardMaterial, but specifically for teleportation spheres.
    function getTeleportMaterial(colorKey)
    {
        if (!teleportMaterialCache.has(colorKey))
        {
            const color = new THREE.Color(colorKey);

            teleportMaterialCache.set(
                colorKey,
                new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color.clone().multiplyScalar(0.88),  // Make material emit light for glowing effect
                    metalness: 0.35,
                    roughness: 0.35
                })
            );
        }

        return teleportMaterialCache.get(colorKey);
    }

    // Resolves the display color for a wall cell based on its material.
    function getWallColor(currentCell)
    {
        return wallColorMap[currentCell.wallMaterial] ?? "#ff00ff";
    }

    // Resolves the display color for a floor cell, including special start/goal tiles.
    function getFloorColor(currentCell)
    {
        if (currentCell.special === "start")
        {
            return floorColorMap.startPad;
        }

        if (currentCell.special === "goal")
        {
            return floorColorMap.goalPad;
        }

        return floorColorMap[currentCell.floorType] ?? "#ff00ff";
    }

    // Creates the floor mesh
    function createFloorMesh(x, y, currentCell)
    {
        const material = getStandardMaterial(getFloorColor(currentCell));
        const mesh = new THREE.Mesh(floorGeometry, material);

        // Every tile occupies a predictable centered position in world space. Reusing the layout
        // helper keeps mesh placement aligned with collision and minimap math.
        mesh.position.copy(layout.gridToWorldPosition(x, y, floorY));

        if (currentCell.special === "start")
        {
            mesh.name = "mazeStartTile";
        }
        else if (currentCell.special === "goal")
        {
            mesh.name = "mazeGoalTile";
        }

        // TODO: shadows + lighting

        return mesh;
    }

    // Creates the wall mesh
    function createWallMesh(x, y, currentCell)
    {
        const material = getStandardMaterial(getWallColor(currentCell));
        const mesh = new THREE.Mesh(wallGeometry, material);

        mesh.position.copy(layout.gridToWorldPosition(x, y, wallY));

        //mesh.castShadow = true;
        //mesh.receiveShadow = true;

        return mesh;
    }

    // Creates the animated teleport marker mesh for one linked teleport cell.
    function createTeleportMesh(x, y, currentCell)
    {
        const sphereColor = teleportColorById.get(currentCell.teleportId) ?? new THREE.Color("#db4fff");
        const sphereMaterial = getTeleportMaterial(`#${sphereColor.getHexString()}`);
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

        sphere.position.copy(layout.gridToWorldPosition(x, y, sphereY));

        //sphere.castShadow = true;
        //sphere.receiveShadow = true;
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
    // can cheaply ask for "nearby walls" instead of testing against every wall in the maze.
    const collisionOctree = createCollisionOctree(wallCollisionEntries);
    group.userData.collisionOctree = collisionOctree;

    scene.add(group);

    // Returns both the generated mesh group and the shared layout helper used to place it.
    return {
        group,
        layout,
        collisionOctree
    };
}
