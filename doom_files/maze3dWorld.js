// This function helps to build a 3D maze representation of the original 2D maze structure.
// TODO: change this with textures
function buildMazeWorldFromData(maze, options = {})
{
    const scene = options.scene;

    if (!scene)
    {
        throw new Error("buildMazeWorldFromData requires options.scene");
    }

    // Configuration options with default values
    const tileSize = options.tileSize ?? 2;
    const wallHeight = options.wallHeight ?? 3;
    const floorThickness = options.floorThickness ?? 0.2;
    const floorY = options.floorY ?? -3;
    const wallY = floorY + wallHeight / 2;
    const sphereRadius = options.teleportSphereRadius ?? tileSize * 0.28;  // sphere is temporarily used to visualize the transportation points.
    const sphereY = floorY + floorThickness / 2 + sphereRadius + 0.08;

    const centerX = (maze.width * tileSize) / 2 - tileSize / 2;
    const centerZ = (maze.height * tileSize) / 2 - tileSize / 2;

    // This group will hold all the maze-related meshes, making it easier to manage them as a single unit in the scene.
    const group = new THREE.Group();  // Likely to change when handling collisions
    group.name = "mazeWorld";

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

    function gridToWorldX(x)
    {
        return x * tileSize - centerX;
    }

    function gridToWorldZ(y)
    {
        return y * tileSize - centerZ;
    }

    function getWallColor(currentCell)
    {
        return wallColorMap[currentCell.wallMaterial] ?? "#ff00ff";
    }

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

        mesh.position.set(
            gridToWorldX(x),
            floorY,
            gridToWorldZ(y)
        );

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

        mesh.position.set(
            gridToWorldX(x),
            wallY,
            gridToWorldZ(y)
        );

        //mesh.castShadow = true;
        //mesh.receiveShadow = true;

        return mesh;
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

    for (let y = 0; y < maze.height; y++)
    {
        for (let x = 0; x < maze.width; x++)
        {
            const currentCell = maze.cells[y][x];

            // Creates walls and floors and adds them to the group based on the cell type.
            if (currentCell.type === "wall")
            {
                group.add(createWallMesh(x, y, currentCell));
            }
            else
            {
                group.add(createFloorMesh(x, y, currentCell));
            }
        }
    }

    for (let y = 0; y < maze.height; y++)
    {
        for (let x = 0; x < maze.width; x++)
        {
            const currentCell = maze.cells[y][x];

            if (currentCell.teleportId === null)
            {
                continue;
            }

            const sphereColor = teleportColorById.get(currentCell.teleportId) ?? new THREE.Color("#db4fff");
            const sphereMaterial = getTeleportMaterial(`#${sphereColor.getHexString()}`);

            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

            sphere.position.set(
                gridToWorldX(x),
                sphereY,
                gridToWorldZ(y)
            );

            //sphere.castShadow = true;
            //sphere.receiveShadow = true;
            sphere.name = `teleport_${currentCell.teleportId}`;

            // Simple animation (still TODO)
            sphere.tick = (delta) =>
            {
                sphere.rotation.y += delta * 2.5;
            };

            group.add(sphere);
        }
    }

    scene.add(group);
    return group;
}