// This file contains shortest-path helpers for navigating the generated maze.
// The maze graph can include both normal floor adjacency and optional teleport links, so callers
// can choose whether they want pure walking routes or the true shortest traversable route.

// Creates a stable string key for one maze cell coordinate.
function createMazeCellKey(x, y)
{
    return `${x},${y}`;
}

// Returns true when the requested cell is inside the maze and walkable.
function isWalkableMazeCell(maze, x, y)
{
    return x >= 0
        && x < maze.width
        && y >= 0
        && y < maze.height
        && maze.cells[y][x]?.type === "floor";
}

// Returns the navigable neighbors for a maze cell, optionally including teleports.
function getPathfindingNeighbors(maze, x, y, options = {})
{
    const includeTeleports = options.includeTeleports ?? false;

    if (typeof maze.getConnectedNeighbors === "function")
    {
        return maze.getConnectedNeighbors(x, y).filter((neighbor) =>
        {
            return includeTeleports || neighbor.via !== "teleport";
        });
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
        const nextX = x + direction.dx;
        const nextY = y + direction.dy;

        if (isWalkableMazeCell(maze, nextX, nextY))
        {
            neighbors.push({
                x: nextX,
                y: nextY,
                via: "walk"
            });
        }
    }

    return neighbors;
}

// Reconstructs a shortest path by walking backward through the predecessor map.
function reconstructShortestMazePath(previousByKey, start, goal)
{
    const path = [];
    let currentKey = createMazeCellKey(goal.x, goal.y);

    while (currentKey)
    {
        const [xText, yText] = currentKey.split(",");
        const previousStep = previousByKey.get(currentKey);

        path.push({
            x: Number(xText),
            y: Number(yText),
            via: previousStep?.via ?? "start"
        });

        currentKey = previousStep?.fromKey ?? null;
    }

    path.reverse();

    if (path.length === 0 || path[0].x !== start.x || path[0].y !== start.y)
    {
        path.unshift({
            x: start.x,
            y: start.y,
            via: "start"
        });
    }

    return path;
}

// Computes the shortest path between two floor cells using breadth-first search.
function findShortestMazePath(maze, start, goal, options = {})
{
    if (!start || !goal)
    {
        return null;
    }

    if (!isWalkableMazeCell(maze, start.x, start.y) || !isWalkableMazeCell(maze, goal.x, goal.y))
    {
        return null;
    }

    if (start.x === goal.x && start.y === goal.y)
    {
        return [{
            x: start.x,
            y: start.y,
            via: "start"
        }];
    }

    const startKey = createMazeCellKey(start.x, start.y);
    const goalKey = createMazeCellKey(goal.x, goal.y);
    const queue = [{ x: start.x, y: start.y }];
    const visited = new Set([startKey]);
    const previousByKey = new Map();

    for (let index = 0; index < queue.length; index++)
    {
        const current = queue[index];

        for (const neighbor of getPathfindingNeighbors(maze, current.x, current.y, options))
        {
            const neighborKey = createMazeCellKey(neighbor.x, neighbor.y);

            if (visited.has(neighborKey))
            {
                continue;
            }

            visited.add(neighborKey);
            previousByKey.set(neighborKey, {
                fromKey: createMazeCellKey(current.x, current.y),
                via: neighbor.via ?? "walk"
            });

            if (neighborKey === goalKey)
            {
                return reconstructShortestMazePath(previousByKey, start, goal);
            }

            queue.push({
                x: neighbor.x,
                y: neighbor.y
            });
        }
    }

    return null;
}
