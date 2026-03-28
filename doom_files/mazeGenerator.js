/** 
 * This file contains the maze generation algorithm, which produces a 2D array of cell data that can be used to build the 3D world. It also includes an wide range of options to customize the generated maze, such as themes, teleportation mechanics, ...etc.
 * Some important definitions:
 * - ROOM: this is a larger open area, usually in the form of a square or rectangle, that is carved out in the maze. This is to prevent a full corridor-like structure of the maze.
 * - CORRIDOR: this is a narrow path that connects different rooms and areas in the maze. Corridors can have twists and turns, but they are usually only 1 cell wide.
 * - CELL: this is the smallest unit of the maze grid, basically a single tile.
 */ 

function generateMazeMap(width, height, options = {})
{
    // Settings of the maze generation, with default values that can be overridden by the options parameter
    const settings = {
        roomAttempts: options.roomAttempts ?? 12,                       // Number of attempts to place random rooms in the maze
        tinyRoomAttempts: options.tinyRoomAttempts ?? 8,                // Number of attempts to place tiny 2x2 or 3x3 rooms in the maze, which can fit in more tighter spaces
        minRoomSize: options.minRoomSize ?? 3,                          // Minimum width/height of a room
        maxRoomSize: options.maxRoomSize ?? 7,                          // Maximum width/height of a room (should be less than maze dimensions)
        extraConnectors: options.extraConnectors ?? 10,                 // The higher the number, the less complex/open-ended the maze will be (handy for large mazes + you can use quite large numbers to make this work)
        deadEndRoomAttempts: options.deadEndRoomAttempts ?? 10,         // Attempts to place smaller rooms in dead-end corridors
        deadEndCorridorAttempts: options.deadEndCorridorAttempts ?? 20, // Attemps to extend the corridor further into dead ends (you can use pretty large numbers if need be)
        themeRunMin: options.themeRunMin ?? 3,                          // The minimum number of consecutive corridor cells to carve before switching to a different theme (only applies to corridors) NOTE: still somewhat influenced by the randomness, so it's not a guaranteed minimum, but it does increase the chances of longer runs of the same theme appearing
        themeRunMax: options.themeRunMax ?? 8,                          // The maximum number of consecutive corridor cells to carve before switching to a different theme (only applies to corridors) NOTE: still somewhat influenced by the randomness, so it's not a guaranteed maximum, but it does increase the chances of shorter runs of the same theme appearing
        mainTheme: options.mainTheme ?? "random",                       // The main theme of the maze
        seedRandom: options.seedRandom ?? Math.random,                  // The random function to use for maze generation, which can be seeded for reproducible mazes (should return a float between 0 and 1)

        // Teleport controls
        minTeleportDistance: options.minTeleportDistance ?? 5,          // Minimum distance between teleport pairs (measured in grid cells)
        maxTeleportDistance: options.maxTeleportDistance ?? 15,         // Maximum distance between teleport pairs (measured in grid cells)
        teleportPairDivisor: options.teleportPairDivisor ?? 220,        // The higher this number, the less teleport pairs there will be
        maxTeleportPairs: options.maxTeleportPairs ?? null,             // The maximum number of teleport pairs to generate. If null, this will be calculated based on the maze size and teleportPairDivisor setting.

        // Keep teleports away from start / goal zones
        startSafeRadius: options.startSafeRadius ?? 8,                  // Minimum distance from the start point that teleports can spawn (measured in grid cells)
        goalSafeRadius: options.goalSafeRadius ?? 8                     // Minimum distance from the goal point that teleports can spawn (measured in grid cells) 
    };

    // Check if minRoomSize and maxRoomSize are valid
    if (settings.minRoomSize < 2 || settings.maxRoomSize < 2 || settings.minRoomSize > settings.maxRoomSize || settings.maxRoomSize >= Math.min(width, height) - 2)
    {
        throw new Error("Invalid room size settings.");
    }

    // Check if themeRunMin and themeRunMax are valid
    if (settings.themeRunMin < 1 || settings.themeRunMax < 1 || settings.themeRunMin > settings.themeRunMax)
    {
        throw new Error("Invalid theme run length settings.");
    }

    // Check if teleport distance settings are valid
    if (settings.minTeleportDistance < 1 || settings.maxTeleportDistance < 1 || settings.minTeleportDistance > settings.maxTeleportDistance)
    {
        throw new Error("Invalid teleport distance settings.");
    }

    const random = settings.seedRandom;

    if (width % 2 === 0) width -= 1;
    if (height % 2 === 0) height -= 1;

    if (width < 7 || height < 7)
    {
        throw new Error("Width and height must be at least 7.");
    }

    // Themesets to choose from when generating a maze.
    const themeSets = {
        castle: {
            corridorThemes: [
                {
                    name: "castleBrickPassage",
                    wallMaterial: "castleBrickWall",
                    floorType: "castleStoneFloor",
                    detailFloorTypes: ["castleCrackedStone", "castleMossStone", "castleRuneTile"]
                },
                {
                    name: "castleStonePassage",
                    wallMaterial: "castleStoneWall",
                    floorType: "castleTileFloor",
                    detailFloorTypes: ["castleCrackedTile", "castleMossStone", "castleRuneTile"]
                }
            ],
            roomThemes: [
                {
                    name: "castleHallBrick",
                    wallMaterial: "castleBrickWall",
                    floorType: "castleStoneFloor",
                    detailFloorTypes: ["castleCrackedStone", "castleMossStone", "castleBannerTile"]
                },
                {
                    name: "castleHallStone",
                    wallMaterial: "castleStoneWall",
                    floorType: "castleTileFloor",
                    detailFloorTypes: ["castleCrackedTile", "castleRuneTile", "castleBannerTile"]
                }
            ]
        },

        industrial: {
            corridorThemes: [
                {
                    name: "industrialMetalCorridor",
                    wallMaterial: "industrialDarkMetalWall",
                    floorType: "industrialMetalFloor",
                    detailFloorTypes: ["industrialGrateFloor", "industrialOilFloor", "industrialPatchFloor"]
                },
                {
                    name: "industrialServiceCorridor",
                    wallMaterial: "industrialPanelWall",
                    floorType: "industrialGrateFloor",
                    detailFloorTypes: ["industrialMetalFloor", "industrialBrokenFloor", "industrialOilFloor"]
                }
            ],
            roomThemes: [
                {
                    name: "industrialWorkshop",
                    wallMaterial: "industrialDarkMetalWall",
                    floorType: "industrialConcreteFloor",
                    detailFloorTypes: ["industrialGrateFloor", "industrialPatchFloor", "industrialOilFloor"]
                },
                {
                    name: "industrialStorage",
                    wallMaterial: "industrialConcreteWall",
                    floorType: "industrialDarkTileFloor",
                    detailFloorTypes: ["industrialBrokenFloor", "industrialPatchFloor", "industrialOilFloor"]
                }
            ]
        },

        oldForestTemple: {
            corridorThemes: [
                {
                    name: "forestTempleMossPassage",
                    wallMaterial: "forestTempleMossWall",
                    floorType: "forestTempleStoneFloor",
                    detailFloorTypes: ["forestTempleRootFloor", "forestTempleMossFloor", "forestTempleRuneFloor"]
                },
                {
                    name: "forestTempleRootPassage",
                    wallMaterial: "forestTempleRootWall",
                    floorType: "forestTempleMossFloor",
                    detailFloorTypes: ["forestTempleStoneFloor", "forestTempleVineFloor", "forestTempleRuneFloor"]
                }
            ],
            roomThemes: [
                {
                    name: "forestTempleSanctum",
                    wallMaterial: "forestTempleMossWall",
                    floorType: "forestTempleStoneFloor",
                    detailFloorTypes: ["forestTempleRuneFloor", "forestTempleMossFloor", "forestTempleVineFloor"]
                },
                {
                    name: "forestTempleChamber",
                    wallMaterial: "forestTempleRootWall",
                    floorType: "forestTempleMossFloor",
                    detailFloorTypes: ["forestTempleRootFloor", "forestTempleRuneFloor", "forestTempleVineFloor"]
                }
            ]
        },

        fireCave: {
            corridorThemes: [
                {
                    name: "fireCaveAshTunnel",
                    wallMaterial: "fireCaveBasaltWall",
                    floorType: "fireCaveAshFloor",
                    detailFloorTypes: ["fireCaveLavaCrackFloor", "fireCaveEmberFloor", "fireCaveScorchFloor"]
                },
                {
                    name: "fireCaveMagmaTunnel",
                    wallMaterial: "fireCaveObsidianWall",
                    floorType: "fireCaveDarkBasaltFloor",
                    detailFloorTypes: ["fireCaveLavaCrackFloor", "fireCaveEmberFloor", "fireCaveScorchFloor"]
                }
            ],
            roomThemes: [
                {
                    name: "fireCaveChamber",
                    wallMaterial: "fireCaveBasaltWall",
                    floorType: "fireCaveAshFloor",
                    detailFloorTypes: ["fireCaveEmberFloor", "fireCaveScorchFloor", "fireCaveLavaCrackFloor"]
                },
                {
                    name: "fireCaveVault",
                    wallMaterial: "fireCaveObsidianWall",
                    floorType: "fireCaveDarkBasaltFloor",
                    detailFloorTypes: ["fireCaveEmberFloor", "fireCaveLavaCrackFloor", "fireCaveScorchFloor"]
                }
            ]
        },

        iceCave: {
            corridorThemes: [
                {
                    name: "iceCaveBluePassage",
                    wallMaterial: "iceCaveBlueIceWall",
                    floorType: "iceCavePackedSnowFloor",
                    detailFloorTypes: ["iceCaveCrystalFloor", "iceCaveSlipperyIceFloor", "iceCaveFrostFloor"]
                },
                {
                    name: "iceCaveCrystalPassage",
                    wallMaterial: "iceCaveCrystalWall",
                    floorType: "iceCaveIceFloor",
                    detailFloorTypes: ["iceCaveCrystalFloor", "iceCaveFrostFloor", "iceCavePackedSnowFloor"]
                }
            ],
            roomThemes: [
                {
                    name: "iceCaveHall",
                    wallMaterial: "iceCaveBlueIceWall",
                    floorType: "iceCaveIceFloor",
                    detailFloorTypes: ["iceCaveCrystalFloor", "iceCaveFrostFloor", "iceCavePackedSnowFloor"]
                },
                {
                    name: "iceCaveVault",
                    wallMaterial: "iceCaveCrystalWall",
                    floorType: "iceCavePackedSnowFloor",
                    detailFloorTypes: ["iceCaveCrystalFloor", "iceCaveSlipperyIceFloor", "iceCaveFrostFloor"]
                }
            ]
        }
    };

    const validThemes = ["castle", "industrial", "oldForestTemple", "fireCave", "iceCave", "random"];

    if (!validThemes.includes(settings.mainTheme))
    {
        throw new Error(`Invalid mainTheme "${settings.mainTheme}". Valid options are: ${validThemes.join(", ")}`);
    }

    let corridorThemes;
    let roomThemes;

    // Room will use a combination of themes.
    if (settings.mainTheme === "random")
    {
        corridorThemes = [];
        roomThemes = [];

        for (const themeKey of Object.keys(themeSets))
        {
            corridorThemes.push(...themeSets[themeKey].corridorThemes);
            roomThemes.push(...themeSets[themeKey].roomThemes);
        }
    }
    else
    {
        corridorThemes = themeSets[settings.mainTheme].corridorThemes.slice();
        roomThemes = themeSets[settings.mainTheme].roomThemes.slice();
    }

    const map = [];
    const regionThemes = new Map();
    const teleportPairs = []; // pairs of teleportation points
    const teleportLookup = new Map(); // maps teleportation point coordinates to their corresponding pair, for quick lookup during world generation and gameplay

    let currentRegionId = 0; // Incremental ID for regions (rooms and corridors).
    let nextTeleportId = 1;  // Incremental ID for teleport pairs, starting from 1 (0 can be reserved for non-teleport cells)

    let startPoint = null;   // Coordinates of the start point in the maze (will be set to the first carved floor cell, normally near the top-left corner)
    let goalPoint = null;    // Coordinates of the goal point in the maze (will be set to the last carved floor cell, normally near the bottom-right corner)

    // Initialize maze with walls (default)
    for (let y = 0; y < height; y++)
    {
        const row = [];
        for (let x = 0; x < width; x++)
        {
            row.push({
                x,
                y,
                type: "wall",
                wallMaterial: null,
                floorType: null,
                baseFloorType: null,
                regionId: null,
                regionKind: null,
                themeName: null,
                teleportId: null,
                teleportTargetId: null,
                teleportTargetX: null,
                teleportTargetY: null,
                special: null
            });
        }
        map.push(row);
    }

    // Utility function for maze generation.
    function randInt(min, max)
    {
        return Math.floor(random() * (max - min + 1)) + min;
    }

    // Utility functions for maze generation based on the provided random function and a probability value between 0 and 1.
    function chance(probability)
    {
        return random() < probability;
    }

    // Choose random element from an array
    function choose(array)
    {
        return array[Math.floor(random() * array.length)];
    }

    // Shuffle an array in place using the Fisher-Yates algorithm, based on the provided random function
    function shuffle(array)
    {
        for (let i = array.length - 1; i > 0; i--)
        {
            const j = Math.floor(random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }

        return array;
    }

    // Return true if the given coordinates are within the bounds of the maze grid
    function inBounds(x, y)
    {
        return x >= 0 && x < width && y >= 0 && y < height;
    }

    // Return the cell object at the given coordinates
    function cell(x, y)
    {
        return map[y][x];
    }

    // Return true if the cell is within boundaries of the maze
    function isInterior(x, y)
    {
        return x > 0 && y > 0 && x < width - 1 && y < height - 1;
    }

    // Create a new region (room or corridor) and return its ID
    function createRegion()
    {
        currentRegionId++;
        return currentRegionId;
    }

    // Assign a theme to a region based on its ID and kind (room or corridor)
    function setRegionTheme(regionId, regionKind, theme)
    {
        regionThemes.set(regionId, {
            regionKind,
            themeName: theme.name,
            wallMaterial: theme.wallMaterial,
            floorType: theme.floorType,
            detailFloorTypes: theme.detailFloorTypes
        });
    }

    // Choose a random theme from the room themeset and return it
    function chooseRoomTheme()
    {
        return choose(roomThemes);
    }

    // Choose a random theme from the corridor themeset and return it
    function chooseCorridorTheme()
    {
        return choose(corridorThemes);
    }

    // Choose a random theme from the corridor themeset that is different from the provided currentTheme, and return it. If all themes are the same as currentTheme, then just return a random theme from the corridor themeset.
    function chooseDifferentCorridorTheme(currentTheme)
    {
        const candidates = corridorThemes.filter(theme => theme.name !== currentTheme.name);
        return choose(candidates.length > 0 ? candidates : corridorThemes);
    }

    // Carve out a floor cell at the given coordinates, and assign it to the specified region with the provided theme details.
    function carveFloor(x, y, regionId, regionKind, floorType, themeName, baseFloorType = null)
    {
        // As long as the cell is within the outer walls, you can carve out the floor
        if (!inBounds(x, y))
        {
            return;
        }

        const targetCell = cell(x, y);
        targetCell.type = "floor";
        targetCell.regionId = regionId;
        targetCell.regionKind = regionKind;
        targetCell.floorType = floorType;
        targetCell.baseFloorType = baseFloorType ?? floorType;
        targetCell.themeName = themeName;
    }

    // Check if a rectangular/square room of the given width and height can be placed at the specified coordinates without overlapping existing floor cells (to ensure rooms don't overlap with each other or with existing corridors)
    function canPlaceRoom(x, y, roomWidth, roomHeight)
    {
        // The additional "1" is to check for a border of walls around the room
        for (let yy = y - 1; yy <= y + roomHeight; yy++)
        {
            for (let xx = x - 1; xx <= x + roomWidth; xx++)
            {
                if (!inBounds(xx, yy))
                {
                    return false;
                }

                if (cell(xx, yy).type === "floor")
                {
                    return false;
                }
            }
        }

        return true;
    }

    // Get all cells that belong to a specific region (room or corridor) based on the region ID. This is useful for adding details to rooms after they have been carved out, such as changing some floor types to add more visual variety.
    function getCellsOfRegion(regionId)
    {
        const result = [];

        for (let y = 0; y < height; y++)
        {
            for (let x = 0; x < width; x++)
            {
                const currentCell = cell(x, y);

                if (currentCell.type === "floor" && currentCell.regionId === regionId)
                {
                    result.push(currentCell);
                }
            }
        }
        return result;
    }

    // Add additional details to a region based on its theme
    function addRegionDetails(regionId)
    {
        const region = regionThemes.get(regionId);

        if (!region)
        {
            return;
        }

        const regionCells = getCellsOfRegion(regionId);

        if (regionCells.length === 0)
        {
            return;
        }

        // The chance to add details is higher for rooms than for corridors
        let detailChance = region.regionKind === "room" ? 0.09 : 0.06;

        if (regionCells.length <= 6)
        {
            detailChance *= 0.5;
        }

        // For each cell in the region, there is a chance to change its floor type.
        for (const currentCell of regionCells)
        {
            if (!chance(detailChance))
            {
                continue;
            }

            if (!region.detailFloorTypes || region.detailFloorTypes.length === 0)
            {
                continue;
            }

            currentCell.floorType = choose(region.detailFloorTypes);
        }


        // When region is bigger than 9 cells (bigger areas), we increase the chances of adding a cluster of details (more visually interesting)
        if (regionCells.length >= 9 && chance(0.45))
        {
            const anchor = choose(regionCells);
            const clusterSize = chance(0.6) ? 2 : 3;

            for (let yy = 0; yy < clusterSize; yy++)
            {
                for (let xx = 0; xx < clusterSize; xx++)
                {
                    const tx = anchor.x + xx;
                    const ty = anchor.y + yy;

                    if (!inBounds(tx, ty))
                    {
                        continue;
                    }

                    const targetCell = cell(tx, ty);

                    if (targetCell.type !== "floor" || targetCell.regionId !== regionId)
                    {
                        continue;
                    }

                    targetCell.floorType = choose(region.detailFloorTypes);
                }
            }
        }
    }

    // Carve out a rectangular/square room at the specified coordinates with the given width and height, and assign it a theme.
    function carveRoom(x, y, roomWidth, roomHeight, forcedTheme = null)
    {
        const theme = forcedTheme ?? chooseRoomTheme();
        const regionId = createRegion();

        setRegionTheme(regionId, "room", theme);

        for (let yy = y; yy < y + roomHeight; yy++)
        {
            for (let xx = x; xx < x + roomWidth; xx++)
            {
                carveFloor(xx, yy, regionId, "room", theme.floorType, theme.name, theme.floorType);
            }
        }

        addRegionDetails(regionId);
    }

    // Try placing randomly sized rooms in the maze
    function tryPlaceRandomRooms()
    {
        for (let i = 0; i < settings.roomAttempts; i++)
        {
            let roomWidth = randInt(settings.minRoomSize, settings.maxRoomSize);
            let roomHeight = randInt(settings.minRoomSize, settings.maxRoomSize);

            if (roomWidth % 2 === 0) roomWidth += 1;
            if (roomHeight % 2 === 0) roomHeight += 1;

            if (roomWidth >= width - 2) roomWidth = width - 4;
            if (roomHeight >= height - 2) roomHeight = height - 4;

            const x = randInt(1, width - roomWidth - 2);
            const y = randInt(1, height - roomHeight - 2);

            if (canPlaceRoom(x, y, roomWidth, roomHeight))
            {
                carveRoom(x, y, roomWidth, roomHeight);
            }
        }
    }

    // Try placing smaller rooms (2x2, 3x3) in the maze. This prevents a maze from being too corridor-like with some big rooms
    function tryPlaceTinyRooms()
    {
        const tinySizes = [
            { w: 2, h: 2 },
            { w: 3, h: 3 },
            { w: 2, h: 3 },
            { w: 3, h: 2 }
        ];

        for (let i = 0; i < settings.tinyRoomAttempts; i++)
        {
            const size = choose(tinySizes);
            const x = randInt(1, width - size.w - 2);
            const y = randInt(1, height - size.h - 2);

            if (canPlaceRoom(x, y, size.w, size.h))
            {
                carveRoom(x, y, size.w, size.h);
            }
        }
    }

    // Carve out a corridor with a theme
    function carveCorridorCellWithTheme(x, y, regionId, theme)
    {
        carveFloor(x, y, regionId, "corridor", theme.floorType, theme.name, theme.floorType);
    }

    // Looks at directly neighboring cells to determine if they are floor cells, and counts how many of them are open (floor) cells.
    function countOpenNeighbors(x, y)
    {
        let count = 0;

        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        for (const direction of directions)
        {
            const nx = x + direction.dx;
            const ny = y + direction.dy;

            if (inBounds(nx, ny) && cell(nx, ny).type === "floor")
            {
                count++;
            }
        }

        return count;
    }

    // Carves out a maze-like structure using a Depth-First kind of approach from a giving starting position. Stops carving when no more paths are possible
    function carveMazeFrom(startX, startY)
    {
        const regionId = createRegion();
        const startTheme = chooseCorridorTheme();

        setRegionTheme(regionId, "corridor", startTheme);
        carveCorridorCellWithTheme(startX, startY, regionId, startTheme);

        const stack = [
            {
                x: startX,
                y: startY,
                theme: startTheme,
                runLeft: randInt(settings.themeRunMin, settings.themeRunMax)
            }
        ];

        while (stack.length > 0)
        {
            const current = stack[stack.length - 1];

            const directions = shuffle([
                { dx: 0, dy: -2 },
                { dx: 2, dy: 0 },
                { dx: 0, dy: 2 },
                { dx: -2, dy: 0 }
            ]);

            let carved = false;

            for (const direction of directions)
            {
                const nx = current.x + direction.dx;
                const ny = current.y + direction.dy;
                const betweenX = current.x + direction.dx / 2;
                const betweenY = current.y + direction.dy / 2;

                if (!isInterior(nx, ny))
                {
                    continue;
                }

                if (cell(nx, ny).type !== "wall")
                {
                    continue;
                }

                let themeForSegment = current.theme;
                let nextRunLeft = current.runLeft - 1;

                const shouldSwitchTheme = nextRunLeft <= 0 || chance(0.2);

                if (shouldSwitchTheme)
                {
                    themeForSegment = chooseDifferentCorridorTheme(current.theme);
                    nextRunLeft = randInt(settings.themeRunMin, settings.themeRunMax);
                }

                carveCorridorCellWithTheme(betweenX, betweenY, regionId, themeForSegment);
                carveCorridorCellWithTheme(nx, ny, regionId, themeForSegment);

                stack.push({
                    x: nx,
                    y: ny,
                    theme: themeForSegment,
                    runLeft: nextRunLeft
                });

                carved = true;
                break;
            }

            if (!carved)
            {
                stack.pop();
            }
        }

        addRegionDetails(regionId);
    }

    // Loops over grid and starts the maze carving process from every unvisited wall cell.
    function carveMazeCorridors()
    {
        for (let y = 1; y < height; y += 2)
        {
            for (let x = 1; x < width; x += 2)
            {
                if (cell(x, y).type === "wall")
                {
                    carveMazeFrom(x, y);
                }
            }
        }
    }

    // Finds walls between two or more different regions (rooms/corridors). Detects places where you could potentially carve out a connecting corridor between these regions to make the maze more interconnected and less linear.
    function findConnectorWalls()
    {
        const connectors = [];

        for (let y = 1; y < height - 1; y++)
        {
            for (let x = 1; x < width - 1; x++)
            {
                if (cell(x, y).type !== "wall")
                {
                    continue;
                }

                const neighbors = [
                    cell(x, y - 1),
                    cell(x + 1, y),
                    cell(x, y + 1),
                    cell(x - 1, y)
                ];

                const floorNeighbors = neighbors.filter(neighbor => neighbor.type === "floor");

                if (floorNeighbors.length < 2)
                {
                    continue;
                }

                const uniqueRegions = [...new Set(floorNeighbors.map(neighbor => neighbor.regionId))];

                if (uniqueRegions.length >= 2)
                {
                    connectors.push({ x, y });
                }
            }
        }

        return connectors;
    }

    // Connect different regions (rooms and corridors).
    function connectRegions()
    {
        const connectors = findConnectorWalls();
        shuffle(connectors);

        let opened = 0;

        for (const connector of connectors)
        {
            if (opened >= settings.extraConnectors)
            {
                break;
            }

            // Get neighboring cells of the connector wall
            const neighbors = [
                cell(connector.x, connector.y - 1),
                cell(connector.x + 1, connector.y),
                cell(connector.x, connector.y + 1),
                cell(connector.x - 1, connector.y)
            ];

            const floorNeighbors = neighbors.filter(neighbor => neighbor.type === "floor"); // Filter only the floor neighbors
            const uniqueRegions = [...new Set(floorNeighbors.map(neighbor => neighbor.regionId))]; // Filter the unique regions among the neighboring floor cells

            if (uniqueRegions.length >= 2)
            {
                const corridorNeighbor = floorNeighbors.find(neighbor => neighbor.regionKind === "corridor");
                const chosenNeighbor = corridorNeighbor ?? floorNeighbors[0];

                // Carve out the connector wall to create a new path between the regions.
                carveFloor(
                    connector.x,
                    connector.y,
                    chosenNeighbor.regionId,
                    chosenNeighbor.regionKind,
                    chosenNeighbor.baseFloorType,
                    chosenNeighbor.themeName,
                    chosenNeighbor.baseFloorType
                );

                const chosenRegion = regionThemes.get(chosenNeighbor.regionId);

                // Possibility of changing the new corridor tile to a more detailed floor type
                if (
                    chosenRegion &&
                    chosenRegion.detailFloorTypes &&
                    chosenRegion.detailFloorTypes.length > 0 &&
                    chance(0.35)
                )
                {
                    cell(connector.x, connector.y).floorType = choose(chosenRegion.detailFloorTypes);
                }

                opened++;
            }
        }
    }


    // Look for all the cells which are dead ends (only one open neighboring cell).
    function getDeadEndCells()
    {
        const deadEnds = [];

        for (let y = 1; y < height - 1; y++)
        {
            for (let x = 1; x < width - 1; x++)
            {
                const currentCell = cell(x, y);

                if (currentCell.type !== "floor" || currentCell.regionKind !== "corridor")
                {
                    continue;
                }

                if (countOpenNeighbors(x, y) === 1)
                {
                    deadEnds.push(currentCell);
                }
            }
        }

        return deadEnds;
    }

    // Try to extend dead-end corridors further by carving out additional corridor cells in the direction of the open neighboring cell.
    function tryAddDeadEndCorridors()
    {
        const deadEnds = shuffle(getDeadEndCells().slice());
        let attempts = 0;

        for (const deadEnd of deadEnds)
        {
            if (attempts >= settings.deadEndCorridorAttempts)
            {
                break;
            }

            const directions = shuffle([
                { dx: 0, dy: -1 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }
            ]);

            for (const direction of directions)
            {
                const nx = deadEnd.x + direction.dx;
                const ny = deadEnd.y + direction.dy;
                const nx2 = deadEnd.x + direction.dx * 2;
                const ny2 = deadEnd.y + direction.dy * 2;

                if (!isInterior(nx, ny) || !isInterior(nx2, ny2))
                {
                    continue;
                }

                if (cell(nx, ny).type !== "wall" || cell(nx2, ny2).type !== "wall")
                {
                    continue;
                }

                // Carve out two new corridor cells to extend the dead-end corridor further in the same direction.
                carveFloor(nx, ny, deadEnd.regionId, "corridor", deadEnd.baseFloorType, deadEnd.themeName, deadEnd.baseFloorType);
                carveFloor(nx2, ny2, deadEnd.regionId, "corridor", deadEnd.baseFloorType, deadEnd.themeName, deadEnd.baseFloorType);

                const region = regionThemes.get(deadEnd.regionId);

                // Possibility of changing the new corridor tiles to a more detailed floor type
                if (region && region.detailFloorTypes && region.detailFloorTypes.length > 0 && chance(0.4))
                {
                    cell(nx2, ny2).floorType = choose(region.detailFloorTypes);
                }

                attempts++;
                break;
            }
        }
    }

    // Try to place smaller rooms at the end of a dead-end corridor. Makes the maze more visually interesting.
    function tryAddDeadEndRooms()
    {
        const deadEnds = shuffle(getDeadEndCells().slice());
        let made = 0;

        for (const deadEnd of deadEnds)
        {
            if (made >= settings.deadEndRoomAttempts)
            {
                break;
            }

            const directions = shuffle([
                { dx: 0, dy: -1 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }
            ]);

            // For each dead end, we look in all 4 directions for a potential place to carve out a doorway that leads to a new room.
            for (const direction of directions)
            {
                const doorwayX = deadEnd.x + direction.dx;
                const doorwayY = deadEnd.y + direction.dy;

                if (!isInterior(doorwayX, doorwayY))
                {
                    continue;
                }

                if (cell(doorwayX, doorwayY).type !== "wall")
                {
                    continue;
                }

                // Possible sizes of the new room
                const size = choose([
                    { w: 2, h: 2 },
                    { w: 3, h: 2 },
                    { w: 2, h: 3 },
                    { w: 3, h: 3 }
                ]);

                let roomX = doorwayX;
                let roomY = doorwayY;

                // Based on the direction of the doorway, we calculate where the new room would be placed relative to the doorway. The doorway should be in the middle of one of the walls of the new room.
                if (direction.dx === 1)
                {
                    roomY = doorwayY - Math.floor(size.h / 2);
                }
                else if (direction.dx === -1)
                {
                    roomX = doorwayX - size.w + 1;
                    roomY = doorwayY - Math.floor(size.h / 2);
                }
                else if (direction.dy === 1)
                {
                    roomX = doorwayX - Math.floor(size.w / 2);
                }
                else if (direction.dy === -1)
                {
                    roomX = doorwayX - Math.floor(size.w / 2);
                    roomY = doorwayY - size.h + 1;
                }

                if (!canPlaceRoom(roomX, roomY, size.w, size.h))
                {
                    continue;
                }

                // Carve out the doorway cell that connects the dead-end corridor to the new room.
                carveFloor(doorwayX, doorwayY, deadEnd.regionId, "corridor", deadEnd.baseFloorType, deadEnd.themeName, deadEnd.baseFloorType);

                const roomTheme = chooseRoomTheme();
                const roomRegionId = createRegion();

                setRegionTheme(roomRegionId, "room", roomTheme);

                for (let yy = roomY; yy < roomY + size.h; yy++)
                {
                    for (let xx = roomX; xx < roomX + size.w; xx++)
                    {
                        carveFloor(xx, yy, roomRegionId, "room", roomTheme.floorType, roomTheme.name, roomTheme.floorType);
                    }
                }

                // Add details to the new room based on its theme.
                addRegionDetails(roomRegionId);
                made++;
                break;
            }
        }
    }


    // Calculate the Manhattan distance between two points a and b.
    function manhattanDistance(a, b)
    {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    // Find the nearest floor cell to the given corner coordinates (cornerX, cornerY) using a breadth-first search.
    function findNearestFloorToCorner(cornerX, cornerY)
    {
        const visited = new Set();
        const queue = [{ x: cornerX, y: cornerY }];

        while (queue.length > 0)
        {
            const current = queue.shift();
            const key = `${current.x},${current.y}`;

            if (visited.has(key))
            {
                continue;
            }

            visited.add(key);

            if (inBounds(current.x, current.y) && cell(current.x, current.y).type === "floor")
            {
                return cell(current.x, current.y);
            }

            const directions = [
                { dx: 0, dy: -1 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }
            ];

            for (const direction of directions)
            {
                const nx = current.x + direction.dx;
                const ny = current.y + direction.dy;

                if (!inBounds(nx, ny))
                {
                    continue;
                }

                const nextKey = `${nx},${ny}`;

                if (!visited.has(nextKey))
                {
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        return null;
    }

    // Mark the start and end goal points in the maze by finding the nearest floor cells to the top-left and bottom-right corners (there could be some cases where these points are not exactly in the corners due to the maze layout, but they will be close to the corners).
    function markStartAndGoal()
    {
        const startCell = findNearestFloorToCorner(1, 1);
        const goalCell = findNearestFloorToCorner(width - 2, height - 2);

        if (!startCell || !goalCell)
        {
            return;
        }

        startCell.special = "start";
        startCell.floorType = "startPad";

        goalCell.special = "goal";
        goalCell.floorType = "goalPad";

        startPoint = { x: startCell.x, y: startCell.y };
        goalPoint = { x: goalCell.x, y: goalCell.y };
    }

    // Check if a cell is a valid candidate for placing a teleportation point.
    function isValidTeleportCell(currentCell, preferOpen = false)
    {
        if (!currentCell)
        {
            return false;
        }

        // Teleportation points can only be placed on floor cells, and not on walls or other types of cells.
        if (currentCell.type !== "floor")
        {
            return false;
        }

        // A cell that already has a teleportation point cannot have another one placed on it.
        if (currentCell.teleportId !== null)
        {
            return false;
        }

        // Teleportation points cannot be placed on the start or goal cells, to avoid blocking the player's path at the beginning or end of the maze.
        if (currentCell.special === "start" || currentCell.special === "goal")
        {
            return false;
        }

        // Prioritizes placing teleportation points closer to more open areas of the maze (rather than small corridors) if preferOpen is true.
        if (preferOpen && countOpenNeighbors(currentCell.x, currentCell.y) < 2)
        {
            return false;
        }

        return true;
    }

    // Get a list of all valid candidate cells for placing teleportation points. If preferOpen is true, it will prioritize cells that are in more open areas of the maze (with more neighboring floor cells) rather than narrow corridors.
    function getTeleportCandidateCells(preferOpen = true)
    {
        const candidates = [];

        for (let y = 1; y < height - 1; y++)
        {
            for (let x = 1; x < width - 1; x++)
            {
                const currentCell = cell(x, y);

                if (!isValidTeleportCell(currentCell, preferOpen))
                {
                    continue;
                }

                // Ensures teleportation points are not too close to the start or goal points.
                if (startPoint && manhattanDistance(currentCell, startPoint) < settings.startSafeRadius)
                {
                    continue;
                }
                if (goalPoint && manhattanDistance(currentCell, goalPoint) < settings.goalSafeRadius)
                {
                    continue;
                }

                candidates.push(currentCell);
            }
        }

        return candidates;
    }

    // Check if a candidate cell for placing a teleportation point is far enough from all already placed teleportation points, based on the minimum teleport distance setting.
    function isFarEnoughFromPlacedTeleports(candidate, placedTeleportCells)
    {
        for (const placed of placedTeleportCells)
        {
            if (manhattanDistance(candidate, placed) < settings.minTeleportDistance)
            {
                return false;
            }
        }

        return true;
    }


    // Check if the distance between two teleportation points is within the specified minimum and maximum teleport distance bounds.
    function isWithinTeleportDistanceBounds(a, b)
    {
        const distance = manhattanDistance(a, b);
        return distance >= settings.minTeleportDistance && distance <= settings.maxTeleportDistance;
    }

    // Determine how many pairs of teleportation points to place in the maze based on the settings.
    function getDesiredTeleportPairCount()
    {
        if (typeof settings.maxTeleportPairs === "number")
        {
            return Math.max(0, settings.maxTeleportPairs);
        }

        const area = width * height;
        return Math.max(1, Math.floor(area / settings.teleportPairDivisor));
    }

    // Build a pool of candidate cells for placing teleportation points.
    function buildTeleportCandidatePool()
    {
        const preferred = shuffle(getTeleportCandidateCells(true).slice()); // Prioritizes cells in open areas
        const fallback = shuffle(getTeleportCandidateCells(false).slice()); // Includes all valid cells (even in smaller corridors)

        const unique = new Map();

        for (const current of preferred)
        {
            unique.set(`${current.x},${current.y}`, current);
        }

        for (const current of fallback)
        {
            unique.set(`${current.x},${current.y}`, current);
        }

        return shuffle([...unique.values()]);
    }

    // Connect two teleportation cells together.
    function linkTeleportCells(firstCell, secondCell)
    {
        const firstTeleportId = nextTeleportId++;
        const secondTeleportId = nextTeleportId++;

        firstCell.teleportId = firstTeleportId;           // ID of the teleportation point on the first cell
        firstCell.teleportTargetId = secondTeleportId;    // ID of the teleportation point on the second cell
        firstCell.teleportTargetX = secondCell.x;         // X coordinate of the target cell
        firstCell.teleportTargetY = secondCell.y;         // Y coordinate of the target cell
        firstCell.floorType = "teleportPad";              // Change the floor type of the first cell to indicate it has a teleportation point

        // Same but from the perspective of the second cell
        secondCell.teleportId = secondTeleportId;
        secondCell.teleportTargetId = firstTeleportId;
        secondCell.teleportTargetX = firstCell.x;
        secondCell.teleportTargetY = firstCell.y;
        secondCell.floorType = "teleportPad";

        teleportLookup.set(firstTeleportId, firstCell);
        teleportLookup.set(secondTeleportId, secondCell);

        teleportPairs.push({
            from: {
                x: firstCell.x,
                y: firstCell.y,
                teleportId: firstTeleportId,
                targetX: secondCell.x,
                targetY: secondCell.y,
                targetTeleportId: secondTeleportId
            },
            to: {
                x: secondCell.x,
                y: secondCell.y,
                teleportId: secondTeleportId,
                targetX: firstCell.x,
                targetY: firstCell.y,
                targetTeleportId: firstTeleportId
            }
        });
    }

    // Get a list of neighboring cells that are directly connected to the current cell, either by being adjacent floor cells or through teleportation links.
    function getConnectedNeighbors(x, y)
    {
        if (!inBounds(x, y))
        {
            return [];
        }

        const currentCell = cell(x, y);

        if (currentCell.type !== "floor")
        {
            return [];
        }

        const neighbors = [];
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];

        for (const direction of directions)
        {
            const nx = x + direction.dx;
            const ny = y + direction.dy;

            if (!inBounds(nx, ny))
            {
                continue;
            }

            const nextCell = cell(nx, ny);

            if (nextCell.type === "floor")
            {
                neighbors.push({
                    x: nx,
                    y: ny,
                    via: "walk"
                });
            }
        }

        // Check if there is a teleportation link from the current cell to another cell, and if so, add the target cell as a neighbor.
        if (
            currentCell.teleportId !== null &&
            currentCell.teleportTargetX !== null &&
            currentCell.teleportTargetY !== null &&
            inBounds(currentCell.teleportTargetX, currentCell.teleportTargetY)
        )
        {
            const targetCell = cell(currentCell.teleportTargetX, currentCell.teleportTargetY);

            if (targetCell.type === "floor")
            {
                neighbors.push({
                    x: currentCell.teleportTargetX,
                    y: currentCell.teleportTargetY,
                    via: "teleport",
                    teleportId: currentCell.teleportId,
                    teleportTargetId: currentCell.teleportTargetId
                });
            }
        }

        return neighbors;
    }

    // Check if it's possible to step from one cell to another, either by walking to an adjacent floor cell or by teleporting if there is a teleportation link between them.
    function canStepBetween(fromX, fromY, toX, toY)
    {
        const neighbors = getConnectedNeighbors(fromX, fromY);
        return neighbors.some(neighbor => neighbor.x === toX && neighbor.y === toY);
    }

    // Perform a flood fill algorithm starting from the given coordinates, marking all reachable cells that can be accessed either by walking through adjacent floor cells or by teleporting through linked teleportation points.
    function floodReachableIncludingTeleports(startX, startY)
    {
        const visited = new Set(); // Set to keep track of visited cells during the flood fill
        const stack = [{ x: startX, y: startY }];

        while (stack.length > 0)
        {
            const current = stack.pop();
            const key = `${current.x},${current.y}`;

            if (visited.has(key))
            {
                continue;
            }

            visited.add(key);

            // Get all neighboring cells that can be reached from the current cell (including teleportation)
            const neighbors = getConnectedNeighbors(current.x, current.y);

            for (const neighbor of neighbors)
            {
                const nextKey = `${neighbor.x},${neighbor.y}`;

                // If the neighboring cell has not been visited yet, add it to the stack to continue the flood fill from that cell.
                if (!visited.has(nextKey))
                {
                    stack.push({ x: neighbor.x, y: neighbor.y });
                }
            }
        }

        return visited;
    }

    // Similar to previous function, but doesn't include the teleportation links (so just walkable adjacent floor cells).
    function floodWalkOnlyFrom(startX, startY, globalVisited = null)
    {
        const visited = new Set();
        const stack = [{ x: startX, y: startY }];

        while (stack.length > 0)
        {
            const current = stack.pop();
            const key = `${current.x},${current.y}`;

            if (visited.has(key))
            {
                continue;
            }

            if (globalVisited && globalVisited.has(key))
            {
                continue;
            }

            visited.add(key);

            // All four directions (up, right, down, left)
            const directions = [
                { dx: 0, dy: -1 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 }
            ];

            for (const direction of directions)
            {
                const nx = current.x + direction.dx;
                const ny = current.y + direction.dy;

                if (!inBounds(nx, ny))
                {
                    continue;
                }

                const nextCell = cell(nx, ny);

                if (nextCell.type !== "floor")
                {
                    continue;
                }

                const nextKey = `${nx},${ny}`;

                // If the neighboring cell is a floor cell and has not been visited yet, add it
                if (!visited.has(nextKey) && (!globalVisited || !globalVisited.has(nextKey)))
                {
                    stack.push({ x: nx, y: ny });
                }
            }
        }

        return visited;
    }

    // From a collection of candidate cells, choose the best one for placing a teleportation point based on various factors.
    function chooseBestCellFromCollection(cells, options = {})
    {
        // Configuration factors
        const preferOpen = options.preferOpen ?? true;
        const avoidStartGoalRadius = options.avoidStartGoalRadius ?? true;   // avoids too close to start/end point
        const placedTeleportCells = options.placedTeleportCells ?? [];       // already placed teleport cells to ensure new ones are not too close to existing ones
        const targetPoint = options.targetPoint ?? null;                     // a point (like start or goal) that we want to be reasonably close to, but not too close
        const strictDistanceFromExisting = options.strictDistanceFromExisting ?? false;

        let bestCell = null;
        let bestScore = -Infinity;  // Higher score means a better candidate for placing a teleportation point

        for (const currentCell of cells)
        {
            if (!isValidTeleportCell(currentCell, preferOpen))
            {
                continue;
            }

            // Avoids placing teleportation close to the start or goal points (otherwise could make it rather easy)
            if (avoidStartGoalRadius)
            {
                if (startPoint && manhattanDistance(currentCell, startPoint) < settings.startSafeRadius)
                {
                    continue;
                }

                if (goalPoint && manhattanDistance(currentCell, goalPoint) < settings.goalSafeRadius)
                {
                    continue;
                }
            }

            // If true, ensures a minimum distance between teleportation points.
            if (strictDistanceFromExisting && !isFarEnoughFromPlacedTeleports(currentCell, placedTeleportCells))
            {
                continue;
            }

            let score = 0;
            score += countOpenNeighbors(currentCell.x, currentCell.y) * 10;

            if (targetPoint)
            {
                score += manhattanDistance(currentCell, targetPoint);
            }

            if (startPoint)
            {
                score += manhattanDistance(currentCell, startPoint) * 0.2;
            }

            if (goalPoint)
            {
                score += manhattanDistance(currentCell, goalPoint) * 0.2;
            }

            // If better score, mark this cell as the best candidate for placing a teleportation point.
            if (score > bestScore)
            {
                bestScore = score;
                bestCell = currentCell;
            }
        }

        return bestCell;
    }

    // Place a teleportation pair in the maze
    function placeTeleportPairs()
    {
        const desiredPairs = getDesiredTeleportPairCount();

        // No need to go through the process if we don't want to place any teleportation pairs. (Usefull for small mazes)
        if (desiredPairs <= 0)
        {
            return;
        }

        // Build a pool of candidate cells for placing teleportation points.
        const candidatePool = buildTeleportCandidatePool();
        if (candidatePool.length < 2)
        {
            return;
        }

        const placedTeleportCells = [];

        // Try to find the best pairs of cells to place teleportation points on.
        for (let pairIndex = 0; pairIndex < desiredPairs; pairIndex++)
        {
            let bestPair = null;
            let bestScore = -Infinity;

            for (let i = 0; i < candidatePool.length; i++)
            {
                const first = candidatePool[i];

                if (first.teleportId !== null)
                {
                    continue;
                }

                // Ensures minimum distance
                if (!isFarEnoughFromPlacedTeleports(first, placedTeleportCells))
                {
                    continue;
                }

                for (let j = i + 1; j < candidatePool.length; j++)
                {
                    const second = candidatePool[j];

                    if (second.teleportId !== null)
                    {
                        continue;
                    }

                    // A cell cannot be paired with itself, so we skip if the first and second candidate cells are the same.
                    if (first.x === second.x && first.y === second.y)
                    {
                        continue;
                    }

                    // Ensures minimum and maximum distance between teleportation points to avoid pairs that are too close.
                    if (!isWithinTeleportDistanceBounds(first, second))
                    {
                        continue;
                    }

                    // Ensures new teleportation points are not too close to already placed teleportation points.
                    if (!isFarEnoughFromPlacedTeleports(second, placedTeleportCells))
                    {
                        continue;
                    }

                    const distanceBetweenPads = manhattanDistance(first, second);
                    const differentRegionBonus = first.regionId !== second.regionId ? 50 : 0;  // Bonus points if the two teleportation points are in different regions (rooms/corridors).
                    const opennessScore = countOpenNeighbors(first.x, first.y) + countOpenNeighbors(second.x, second.y);

                    // Bonus points for being farther from the start and goal points.
                    const startDistanceBonus = (startPoint ? manhattanDistance(first, startPoint) + manhattanDistance(second, startPoint) : 0);
                    const goalDistanceBonus = (goalPoint ? manhattanDistance(first, goalPoint) + manhattanDistance(second, goalPoint) : 0);

                    // Calculate the score
                    const score =
                        distanceBetweenPads +
                        differentRegionBonus +
                        opennessScore +
                        startDistanceBonus * 0.2 +
                        goalDistanceBonus * 0.2;

                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestPair = { first, second };
                    }
                }
            }

            if (!bestPair)
            {
                break;
            }

            linkTeleportCells(bestPair.first, bestPair.second);  // Link the two best candidate cells
            placedTeleportCells.push(bestPair.first, bestPair.second); // Add them to the list
        }
    }

    // This function fixes an "issue" with the maze generation where rooms could become isolated/disconnected. Adding a teleportation link could grant access.
    function ensureDisconnectedZonesHaveTeleports()
    {
        if (!startPoint)
        {
            return;
        }

        let reachable = floodReachableIncludingTeleports(startPoint.x, startPoint.y);
        const processedDisconnected = new Set();

        while (true)
        {
            let disconnectedSeed = null;

            // Look for a cell that is not reachable from the start point.
            for (let y = 1; y < height - 1 && !disconnectedSeed; y++)
            {
                for (let x = 1; x < width - 1; x++)
                {
                    const currentCell = cell(x, y);
                    const key = `${x},${y}`;

                    if (currentCell.type !== "floor")
                    {
                        continue;
                    }

                    if (reachable.has(key))
                    {
                        continue;
                    }

                    if (processedDisconnected.has(key))
                    {
                        continue;
                    }

                    disconnectedSeed = currentCell; // This cell is a seed for a disconnected component of the maze that cannot be reached from the start point.
                    break;
                }
            }

            if (!disconnectedSeed)
            {
                break;
            }

            // From the disconnected seed cell, perform a flood fill to find all cells in this disconnected component of the maze.
            const disconnectedComponent = floodWalkOnlyFrom(disconnectedSeed.x, disconnectedSeed.y, processedDisconnected);

            for (const key of disconnectedComponent)
            {
                processedDisconnected.add(key);
            }

            const disconnectedCells = [];
            for (const key of disconnectedComponent)
            {
                const [x, y] = key.split(",").map(Number);
                disconnectedCells.push(cell(x, y));
            }

            const reachableCells = [];
            for (const key of reachable)
            {
                const [x, y] = key.split(",").map(Number);
                reachableCells.push(cell(x, y));
            }

            // Try to find the best candidate cell within the disconnected component to place a teleportation point on.
            let insideCell = chooseBestCellFromCollection(disconnectedCells, {
                preferOpen: true,
                avoidStartGoalRadius: false,
                strictDistanceFromExisting: false
            });

            // If we can't find a suitable cell in the disconnected component that is in an open area, we relax the criteria and allow cells in more narrow areas of the maze (like corridors) to be chosen.
            if (!insideCell)
            {
                insideCell = chooseBestCellFromCollection(disconnectedCells, {
                    preferOpen: false,
                    avoidStartGoalRadius: false,
                    strictDistanceFromExisting: false
                });
            }

            if (!insideCell)
            {
                continue;
            }

            // Try to find the best candidate cell within the reachable area of the maze to place the other teleportation point on, prioritizing cells in open areas and reasonably close to the disconnected component (but again not too close to the start or goal points).
            let anchorCell = chooseBestCellFromCollection(reachableCells, {
                preferOpen: true,
                avoidStartGoalRadius: true,
                targetPoint: insideCell,
                strictDistanceFromExisting: false
            });

            if (!anchorCell)
            {
                anchorCell = chooseBestCellFromCollection(reachableCells, {
                    preferOpen: false,
                    avoidStartGoalRadius: false,
                    targetPoint: insideCell,
                    strictDistanceFromExisting: false
                });
            }

            if (!anchorCell)
            {
                continue;
            }

            // Link the two chosen cells together with a teleportation link.
            linkTeleportCells(anchorCell, insideCell);
            // Recalculate the reachable area from the start point.
            reachable = floodReachableIncludingTeleports(startPoint.x, startPoint.y);
        }
    }

    // Assign wall materials
    function assignWallMaterials()
    {
        for (let y = 0; y < height; y++)
        {
            for (let x = 0; x < width; x++)
            {
                const currentCell = cell(x, y);

                if (currentCell.type !== "wall")
                {
                    continue;
                }

                const neighbors = [
                    inBounds(x, y - 1) ? cell(x, y - 1) : null,
                    inBounds(x + 1, y) ? cell(x + 1, y) : null,
                    inBounds(x, y + 1) ? cell(x, y + 1) : null,
                    inBounds(x - 1, y) ? cell(x - 1, y) : null
                ].filter(Boolean);

                const floorNeighbors = neighbors.filter(neighbor => neighbor.type === "floor");

                // If there are no adjacent floor cells, we can assign a default wall material (like "voidRockWall") since this wall is not really visible or relevant to the player.
                if (floorNeighbors.length === 0)
                {
                    currentCell.wallMaterial = "voidRockWall";
                    continue;
                }

                const counts = {};

                // Look at the adjacent floor cells and their regions to determine which wall material is most common among them, and assign that material to the current wall cell.
                for (const neighbor of floorNeighbors)
                {
                    const region = regionThemes.get(neighbor.regionId);

                    if (!region)
                    {
                        continue;
                    }

                    // Count how many times each wall material appears among the adjacent floor cells' regions.
                    counts[region.wallMaterial] = (counts[region.wallMaterial] ?? 0) + 1;
                }

                let bestMaterial = "voidRockWall";
                let bestCount = -1;

                for (const material in counts)
                {
                    if (counts[material] > bestCount)
                    {
                        bestCount = counts[material];
                        bestMaterial = material;
                    }
                }

                // Assign the most common adjacent wall material to the current wall cell.
                currentCell.wallMaterial = bestMaterial;
            }
        }
    }

    // Create an ASCII representation of the maze for easy visualization and debugging. Different symbols represent different types of cells, walls, floors, start/goal points, and teleportation points.
    function createAsciiPreview()
    {
        // Walls have capital identifiers
        const wallSymbolMap = {
            castleBrickWall: "B",
            castleStoneWall: "S",
            industrialDarkMetalWall: "D",
            industrialPanelWall: "P",
            industrialConcreteWall: "C",
            forestTempleMossWall: "M",
            forestTempleRootWall: "R",
            fireCaveBasaltWall: "F",
            fireCaveObsidianWall: "O",
            iceCaveBlueIceWall: "I",
            iceCaveCrystalWall: "K",
            voidRockWall: "#"
        };

        // Floors have punctuation or lowercase identifiers
        const floorSymbolMap = {
            castleStoneFloor: ".",
            castleTileFloor: ":",
            castleCrackedStone: ";",
            castleCrackedTile: "=",
            castleMossStone: "\"",
            castleRuneTile: "*",
            castleBannerTile: "+",

            industrialMetalFloor: ",",
            industrialGrateFloor: "-",
            industrialConcreteFloor: "_",
            industrialDarkTileFloor: "~",
            industrialOilFloor: "!",
            industrialPatchFloor: "%",
            industrialBrokenFloor: "?",

            forestTempleStoneFloor: "g",
            forestTempleMossFloor: "h",
            forestTempleRootFloor: "j",
            forestTempleVineFloor: "v",
            forestTempleRuneFloor: "u",

            fireCaveAshFloor: "a",
            fireCaveDarkBasaltFloor: "b",
            fireCaveLavaCrackFloor: "l",
            fireCaveEmberFloor: "e",
            fireCaveScorchFloor: "q",

            iceCavePackedSnowFloor: "n",
            iceCaveIceFloor: "i",
            iceCaveCrystalFloor: "c",
            iceCaveSlipperyIceFloor: "s",
            iceCaveFrostFloor: "f",

            // Some special tiles
            teleportPad: "T",
            startPad: "A",
            goalPad: "Z"
        };

        let output = "";

        // Generate the ASCII representation of the maze
        for (let y = 0; y < height; y++)
        {
            for (let x = 0; x < width; x++)
            {
                const currentCell = cell(x, y);

                if (currentCell.type === "wall")
                {
                    output += wallSymbolMap[currentCell.wallMaterial] ?? "#";
                }
                else
                {
                    output += floorSymbolMap[currentCell.floorType] ?? " ";
                }
            }

            output += "\n";
        }

        return output;
    }

    // MAIN EXECUTION OF THE ALGORITHM: here the different steps of the maze generation process is being executed
    tryPlaceTinyRooms();
    tryPlaceRandomRooms();
    carveMazeCorridors();
    connectRegions();
    tryAddDeadEndCorridors();
    tryAddDeadEndRooms();
    markStartAndGoal();
    placeTeleportPairs();
    ensureDisconnectedZonesHaveTeleports();
    assignWallMaterials();

    // After all the maze generation steps are completed, we calculate the set of cells that are reachable from the start point, taking into account both walking through adjacent floor cells and teleporting through linked teleportation points. Validates if the maze is properly connected
    const reachableFromStart = startPoint
        ? floodReachableIncludingTeleports(startPoint.x, startPoint.y)
        : new Set();

    return {
        width,
        height,
        cells: map,
        teleportPairs,
        start: startPoint,
        goal: goalPoint,
        ascii: createAsciiPreview(),
        getConnectedNeighbors,
        canStepBetween,
        floodReachableIncludingTeleports,
        reachableFromStart,
        teleportLookup
    };
}

// Generates a tile map canvas based on the ASCII representation of the maze.
function asciiToTileMapCanvas(ascii, tileSize)
{
    const lines = ascii.trim().split("\n");
    const mapHeight = lines.length;
    const mapWidth = lines[0].length;

    const canvas = document.createElement("canvas");
    canvas.width = mapWidth * tileSize;
    canvas.height = mapHeight * tileSize;

    const ctx = canvas.getContext("2d");

    // Colors for the map visualization.
    const colors = {
        "B": "#4b2c26",
        "S": "#3d4048",
        "D": "#1f252c",
        "P": "#2a333c",
        "C": "#313131",
        "M": "#294030",
        "R": "#382f24",
        "F": "#2f2421",
        "O": "#141414",
        "I": "#1d3e55",
        "K": "#35576f",
        "#": "#0f0f0f",

        ".": "#c9bea8",
        ":": "#dbcfae",
        ";": "#baa98f",
        "=": "#d7c38f",
        "\"": "#a2b886",
        "*": "#e6d789",
        "+": "#d7b778",

        ",": "#b7c4cf",
        "-": "#d3dce1",
        "_": "#c8c1b6",
        "~": "#a7a0ab",
        "!": "#8b7c53",
        "%": "#d8d3ca",
        "?": "#9f9384",

        "g": "#b9c1a1",
        "h": "#b8d48d",
        "j": "#c0a276",
        "v": "#8fd97d",
        "u": "#e4dd95",

        "a": "#d9b191",
        "b": "#aaa09b",
        "l": "#ff9c5a",
        "e": "#ffd56c",
        "q": "#b88c6d",

        "n": "#eef4fb",
        "i": "#c7ebff",
        "c": "#dffcff",
        "s": "#b4e1ff",
        "f": "#f7fcff",

        "T": "#db4fff",
        "A": "#38d66b",
        "Z": "#ff4a4a",

        " ": "#ffffff"
    };

    for (let y = 0; y < mapHeight; y++)
    {
        for (let x = 0; x < mapWidth; x++)
        {
            const symbol = lines[y][x];
            const color = colors[symbol] ?? "#ff00ff";  // Magenta color for unknown symbols to easily spot them

            ctx.fillStyle = color;
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
    }

    return canvas;
}