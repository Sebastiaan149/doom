// This file contains the conversions between maze-grid coordinates and world-space positions.
// Helps the minimap and the 3D world stay in sync

// Creates a reusable layout helper around a generated maze and its render settings.
function createMazeLayout(maze, options = {})
{
    const tileSize = options.tileSize ?? 2;
    const wallHeight = options.wallHeight ?? 3;
    const floorThickness = options.floorThickness ?? 0.2;
    const floorY = options.floorY ?? -3;
    const wallY = floorY + wallHeight / 2;

    // The maze is rendered around the world origin, so the center of the maze in world space is a function of the maze dimensions and tile size.
    const centerX = (maze.width * tileSize) / 2 - tileSize / 2;
    const centerZ = (maze.height * tileSize) / 2 - tileSize / 2;

    // Converts a maze column index into a world-space X-coordinate.
    function gridToWorldX(x)
    {
        return x * tileSize - centerX;
    }

    // Converts a maze row index into a world-space Z-coordinate.
    function gridToWorldZ(y)
    {
        return y * tileSize - centerZ;
    }

    // Converts a maze cell into a full 3D position at the requested elevation.
    function gridToWorldPosition(x, y, elevation = floorY)
    {
        return new THREE.Vector3(
            gridToWorldX(x),
            elevation,
            gridToWorldZ(y)
        );
    }

    // Converts a world-space point into fractional maze coordinates, where the integer part is the cell index and the decimal part is the position inside that cell. Is easier to work with than raw world coordinates.
    function worldToGridFractionalCoordinates(worldX, worldZ)
    {
        return {
            x: (worldX + centerX) / tileSize,
            y: (worldZ + centerZ) / tileSize
        };
    }

    // Converts a world-space point into the nearest maze cell indices.
    function worldToGridCoordinates(worldX, worldZ)
    {
        const fractionalCoordinates = worldToGridFractionalCoordinates(worldX, worldZ);

        return {
            // Adding 0.5 rounds to the nearest tile center.
            x: Math.floor(fractionalCoordinates.x + 0.5),
            y: Math.floor(fractionalCoordinates.y + 0.5)
        };
    }

    // Converts a world-space vector into the maze cell it currently occupies.
    function worldToGridPosition(position)
    {
        return worldToGridCoordinates(position.x, position.z);
    }

    // Creates a stable string key for one maze cell coordinate.
    function getCellKey(x, y)
    {
        return `${x},${y}`;
    }

    // Returns true when the provided maze coordinates are inside the map bounds.
    function isInBounds(x, y)
    {
        return x >= 0 && x < maze.width && y >= 0 && y < maze.height;
    }

    // Retrieves the raw maze cell object for a grid location.
    function getCell(x, y)
    {
        if (!isInBounds(x, y))
        {
            return null;
        }

        return maze.cells[y][x];
    }

    // Returns true when the cell can be occupied by the player.
    function isWalkable(x, y)
    {
        // The player can only walk on floor cells, so we check the cell type here.
        const currentCell = getCell(x, y);
        return currentCell?.type === "floor";
    }

    // Returns the nearest walkable floor cell around a world-space position.
    function getNearestWalkableCellFromWorldPosition(worldX, worldZ, options = {})
    {
        const searchRadius = options.searchRadius ?? 1;
        const roundedCell = worldToGridCoordinates(worldX, worldZ);
        const fractionalCoordinates = worldToGridFractionalCoordinates(worldX, worldZ);
        let bestCell = null;
        let bestDistance = Infinity;

        // Sample cells in an area around the provided world position and return the walkable cell closest to that position.
        for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY++)
        {
            for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX++)
            {
                const candidateX = roundedCell.x + offsetX;
                const candidateY = roundedCell.y + offsetY;
                const candidateCell = getCell(candidateX, candidateY);

                if (candidateCell?.type !== "floor")
                {
                    continue;
                }

                const distance =
                    ((candidateX - fractionalCoordinates.x) ** 2) +
                    ((candidateY - fractionalCoordinates.y) ** 2);

                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    bestCell = candidateCell;
                }
            }
        }

        return bestCell;
    }

    // Provides a world-space spawn position for the maze start tile.
    function getStartWorldPosition(elevation = floorY)
    {
        if (!maze.start)
        {
            return gridToWorldPosition(0, 0, elevation);
        }

        return gridToWorldPosition(maze.start.x, maze.start.y, elevation);
    }

    // Provides a world-space target position for the maze goal tile.
    function getGoalWorldPosition(elevation = floorY)
    {
        if (!maze.goal)
        {
            return gridToWorldPosition(maze.width - 1, maze.height - 1, elevation);
        }

        return gridToWorldPosition(maze.goal.x, maze.goal.y, elevation);
    }

    return {
        maze,
        tileSize,
        wallHeight,
        floorThickness,
        floorY,
        wallY,
        centerX,
        centerZ,
        gridToWorldX,
        gridToWorldZ,
        gridToWorldPosition,
        worldToGridFractionalCoordinates,
        worldToGridCoordinates,
        worldToGridPosition,
        getCellKey,
        isInBounds,
        getCell,
        isWalkable,
        getNearestWalkableCellFromWorldPosition,
        getStartWorldPosition,
        getGoalWorldPosition
    };
}
