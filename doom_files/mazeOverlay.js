// This file builds the minimap overlay and keeps both the player marker and route display
// in sync with the live game state.
// The minimap is composed from three layers:
// 1. A static canvas generated from the maze ASCII
// 2. An SVG route layer for the current destination/path
// 3. An SVG player arrow image that tracks the camera position and facing direction

const MINIMAP_SVG_NS = "http://www.w3.org/2000/svg";

// Converts the ASCII maze into a canvas texture that can be reused for the minimap.
function createMazeTextureFromAscii(ascii, tileSize = 8)
{
    // Gets the canvas and texture for the maze base layer, which is a simple colored grid based on the ASCII layout.
    const canvas = asciiToTileMapCanvas(ascii, tileSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return { canvas, texture };
}

// Creates the SVG marker element used to show the player's position and facing direction.
function createMinimapPlayerMarker()
{
    const playerMarker = document.createElement("img");
    playerMarker.className = "maze-map-player-marker";
    playerMarker.src = "./assets/player_arrow.svg";
    playerMarker.alt = "Player direction marker";
    playerMarker.style.display = "none";

    return playerMarker;
}

// Creates an SVG overlay used to draw the selected destination and the current shortest path.
function createMinimapPathLayer(baseCanvas, tileSize)
{
    const pathSvg = document.createElementNS(MINIMAP_SVG_NS, "svg");
    pathSvg.classList.add("maze-map-path-layer");
    pathSvg.setAttribute("viewBox", `0 0 ${baseCanvas.width} ${baseCanvas.height}`);
    pathSvg.setAttribute("preserveAspectRatio", "none");

    const routeGroup = document.createElementNS(MINIMAP_SVG_NS, "g");

    const destinationMarker = document.createElementNS(MINIMAP_SVG_NS, "circle");
    destinationMarker.classList.add("maze-map-destination");
    destinationMarker.setAttribute("r", `${Math.max(tileSize * 0.3, 2.5)}`);
    destinationMarker.style.display = "none";

    pathSvg.append(routeGroup, destinationMarker);

    return {
        svg: pathSvg,
        routeGroup,
        destinationMarker
    };
}

// Groups the static map, the route overlay and the player marker so they stay perfectly aligned.
function createMinimapCanvasStack(baseCanvas, pathLayer, playerMarker)
{
    const canvasStack = document.createElement("div");
    const collapsedWidth = parseFloat(baseCanvas.style.width) || baseCanvas.width;
    const collapsedHeight = parseFloat(baseCanvas.style.height) || baseCanvas.height;

    canvasStack.className = "maze-map-stack";
    canvasStack.style.setProperty("--collapsed-width", `${collapsedWidth}px`);
    canvasStack.style.setProperty("--collapsed-height", `${collapsedHeight}px`);
    canvasStack.style.setProperty("--map-aspect-ratio", `${baseCanvas.width} / ${baseCanvas.height}`);

    baseCanvas.classList.add("maze-map-canvas");
    baseCanvas.style.width = "100%";
    baseCanvas.style.height = "100%";

    canvasStack.append(baseCanvas, pathLayer.svg, playerMarker);

    return canvasStack;
}

// Stores useful debug references on the window for manual inspection in the browser console.
function exposeGeneratedMazeDebugData(maze, minimap)
{
    // These are just for debugging purposes
    window.generatedMaze = maze;
    window.generatedMazeAscii = maze.ascii;
    window.generatedMazeCanvas = minimap.baseCanvas;
    window.generatedMazeTexture = minimap.texture;
    window.generatedMazePlayerMarker = minimap.playerMarker;
    window.generatedMazeRouteLayer = minimap.pathLayer.svg;
}

// Creates a controller that manages marker placement, destination selection and route drawing.
function createMinimapController(maze, result, tileSize)
{
    const baseCanvas = result.canvas;
    const playerMarker = createMinimapPlayerMarker();
    const pathLayer = createMinimapPathLayer(baseCanvas, tileSize);
    const canvasStack = createMinimapCanvasStack(baseCanvas, pathLayer, playerMarker);

    let mazeLayout = null;
    let trackedPlayer = null;
    let mapWrapper = null;
    let toggleButton = null;
    let isExpanded = false;
    let destinationCell = null;
    let currentPath = [];
    let lastRouteStartKey = null;
    let lastRouteDestinationKey = null;

    // Returns the current on-screen size of the map, which changes when the minimap is expanded.
    function getDisplayMetrics()
    {
        const rect = baseCanvas.getBoundingClientRect();
        const displayWidth = rect.width || parseFloat(getComputedStyle(canvasStack).width) || baseCanvas.width;
        const displayHeight = rect.height || parseFloat(getComputedStyle(canvasStack).height) || baseCanvas.height;

        return {
            displayWidth,
            displayHeight,
            scaleX: displayWidth / baseCanvas.width,
            scaleY: displayHeight / baseCanvas.height
        };
    }

    // Converts a maze cell to the source-canvas center point used by the SVG path layer.
    function gridCellToSourcePixels(x, y)
    {
        return {
            x: x * tileSize + tileSize / 2,
            y: y * tileSize + tileSize / 2
        };
    }

    // Converts the player's world-space position into displayed minimap pixel coordinates.
    function worldToMinimapPixels(position, metrics = getDisplayMetrics())
    {
        if (!mazeLayout)
        {
            return null;
        }

        const fractionalCoordinates = mazeLayout.worldToGridFractionalCoordinates(position.x, position.z);

        return {
            x: (fractionalCoordinates.x * tileSize + tileSize / 2) * metrics.scaleX,
            y: (fractionalCoordinates.y * tileSize + tileSize / 2) * metrics.scaleY
        };
    }

    // Returns the walkable maze cell that best matches the player's current world position.
    function getTrackedPlayerCell()
    {
        if (!trackedPlayer || !mazeLayout)
        {
            return null;
        }

        const currentCell = mazeLayout.getNearestWalkableCellFromWorldPosition(
            trackedPlayer.camera.position.x,
            trackedPlayer.camera.position.z
        );

        return currentCell
            ? {
                x: currentCell.x,
                y: currentCell.y
            }
            : null;
    }

    // Returns true when two maze cells refer to the same grid position.
    function isSameCell(firstCell, secondCell)
    {
        return !!firstCell
            && !!secondCell
            && firstCell.x === secondCell.x
            && firstCell.y === secondCell.y;
    }

    // Returns all grid cells touched by a straight line between two maze cells.
    function getSupercoverLineCells(startCell, endCell)
    {
        const cells = [];
        const deltaX = endCell.x - startCell.x;
        const deltaY = endCell.y - startCell.y;
        const stepX = Math.sign(deltaX);
        const stepY = Math.sign(deltaY);
        const absoluteDeltaX = Math.abs(deltaX);
        const absoluteDeltaY = Math.abs(deltaY);
        let currentX = startCell.x;
        let currentY = startCell.y;
        let walkedX = 0;
        let walkedY = 0;

        cells.push({ x: currentX, y: currentY });

        while (walkedX < absoluteDeltaX || walkedY < absoluteDeltaY)
        {
            const decision = (1 + 2 * walkedX) * absoluteDeltaY - (1 + 2 * walkedY) * absoluteDeltaX;

            if (decision <= 0 && walkedX < absoluteDeltaX)
            {
                currentX += stepX;
                walkedX++;
            }

            if (decision >= 0 && walkedY < absoluteDeltaY)
            {
                currentY += stepY;
                walkedY++;
            }

            cells.push({ x: currentX, y: currentY });
        }

        return cells;
    }

    // Returns true when a straight line between two cells stays inside walkable floor space.
    function hasWalkableLineOfSight(startCell, endCell)
    {
        if (!startCell || !endCell)
        {
            return false;
        }

        const traversedCells = getSupercoverLineCells(startCell, endCell);

        for (const traversedCell of traversedCells)
        {
            if (!isWalkableMazeCell(maze, traversedCell.x, traversedCell.y))
            {
                return false;
            }
        }

        for (let index = 1; index < traversedCells.length; index++)
        {
            const previousCell = traversedCells[index - 1];
            const currentCell = traversedCells[index];

            if (previousCell.x !== currentCell.x && previousCell.y !== currentCell.y)
            {
                if (
                    !isWalkableMazeCell(maze, previousCell.x, currentCell.y)
                    || !isWalkableMazeCell(maze, currentCell.x, previousCell.y)
                )
                {
                    return false;
                }
            }
        }

        return true;
    }

    // Simplifies a walk-only route segment so open areas can be drawn with diagonal shortcuts.
    function simplifyWalkSegment(segment)
    {
        if (segment.length <= 2)
        {
            return segment.slice();
        }

        const simplifiedSegment = [segment[0]];
        let anchorIndex = 0;

        while (anchorIndex < segment.length - 1)
        {
            let farthestVisibleIndex = anchorIndex + 1;

            for (let candidateIndex = segment.length - 1; candidateIndex > anchorIndex + 1; candidateIndex--)
            {
                if (hasWalkableLineOfSight(segment[anchorIndex], segment[candidateIndex]))
                {
                    farthestVisibleIndex = candidateIndex;
                    break;
                }
            }

            simplifiedSegment.push(segment[farthestVisibleIndex]);
            anchorIndex = farthestVisibleIndex;
        }

        return simplifiedSegment;
    }

    // Converts the full BFS path into visible draw segments plus subtle teleport connectors.
    function buildRenderableRouteSegments(path)
    {
        const walkSegments = [];
        const teleportHops = [];
        let currentSegment = [];

        for (let index = 0; index < path.length; index++)
        {
            const step = path[index];

            if (currentSegment.length === 0)
            {
                currentSegment.push(step);
                continue;
            }

            if (step.via === "teleport")
            {
                const previousStep = path[index - 1];

                walkSegments.push(simplifyWalkSegment(currentSegment));

                if (previousStep)
                {
                    teleportHops.push({
                        from: previousStep,
                        to: step
                    });
                }

                currentSegment = [step];
                continue;
            }

            currentSegment.push(step);
        }

        if (currentSegment.length > 0)
        {
            walkSegments.push(simplifyWalkSegment(currentSegment));
        }

        return {
            walkSegments: walkSegments.filter((segment) => segment.length > 1),
            teleportHops
        };
    }

    // Shows or hides the selected destination marker, walk path and subtle teleport connectors.
    function drawCurrentRoute()
    {
        if (destinationCell)
        {
            const destinationPixels = gridCellToSourcePixels(destinationCell.x, destinationCell.y);

            pathLayer.destinationMarker.setAttribute("cx", `${destinationPixels.x}`);
            pathLayer.destinationMarker.setAttribute("cy", `${destinationPixels.y}`);
            pathLayer.destinationMarker.style.display = "block";
        }
        else
        {
            pathLayer.destinationMarker.style.display = "none";
        }

        const renderableRoute = buildRenderableRouteSegments(currentPath);
        const teleportLines = renderableRoute.teleportHops.map((hop) =>
        {
            const line = document.createElementNS(MINIMAP_SVG_NS, "line");
            const fromPoint = gridCellToSourcePixels(hop.from.x, hop.from.y);
            const toPoint = gridCellToSourcePixels(hop.to.x, hop.to.y);

            line.classList.add("maze-map-route-teleport");
            line.setAttribute("x1", `${fromPoint.x}`);
            line.setAttribute("y1", `${fromPoint.y}`);
            line.setAttribute("x2", `${toPoint.x}`);
            line.setAttribute("y2", `${toPoint.y}`);

            return line;
        });

        if (renderableRoute.walkSegments.length > 0 || teleportLines.length > 0)
        {
            const routePolylines = renderableRoute.walkSegments.map((segment) =>
            {
                const routePolyline = document.createElementNS(MINIMAP_SVG_NS, "polyline");
                const pointString = segment.map((step) =>
                {
                    const point = gridCellToSourcePixels(step.x, step.y);
                    return `${point.x},${point.y}`;
                }).join(" ");

                routePolyline.classList.add("maze-map-route");
                routePolyline.setAttribute("points", pointString);

                return routePolyline;
            });

            pathLayer.routeGroup.replaceChildren(...teleportLines, ...routePolylines);
        }
        else
        {
            pathLayer.routeGroup.replaceChildren();
        }
    }

    // Clears the selected destination and removes the currently drawn route.
    function clearDestination()
    {
        destinationCell = null;
        currentPath = [];
        lastRouteStartKey = null;
        lastRouteDestinationKey = null;
        drawCurrentRoute();
    }

    // Recomputes the current shortest path when the player cell or destination has changed.
    function updateRoute(force = false)
    {
        if (!destinationCell)
        {
            currentPath = [];
            drawCurrentRoute();
            return;
        }

        const playerCell = getTrackedPlayerCell();

        if (!playerCell)
        {
            currentPath = [];
            drawCurrentRoute();
            return;
        }

        if (isSameCell(playerCell, destinationCell))
        {
            // Arriving at the destination clears the route automatically.
            clearDestination();
            return;
        }

        const startKey = createMazeCellKey(playerCell.x, playerCell.y);
        const destinationKey = createMazeCellKey(destinationCell.x, destinationCell.y);

        if (!force && startKey === lastRouteStartKey && destinationKey === lastRouteDestinationKey)
        {
            return;
        }

        currentPath = findShortestMazePath(maze, playerCell, destinationCell, {
            includeTeleports: true
        }) ?? [];

        lastRouteStartKey = startKey;
        lastRouteDestinationKey = destinationKey;

        drawCurrentRoute();
    }

    // Updates the route destination and treats a repeat click as a toggle to remove the route.
    function setDestinationCell(nextDestinationCell)
    {
        if (!nextDestinationCell || !isWalkableMazeCell(maze, nextDestinationCell.x, nextDestinationCell.y))
        {
            return;
        }

        if (isSameCell(destinationCell, nextDestinationCell))
        {
            clearDestination();
            return;
        }

        destinationCell = {
            x: nextDestinationCell.x,
            y: nextDestinationCell.y
        };

        lastRouteStartKey = null;
        lastRouteDestinationKey = null;
        updateRoute(true);
    }

    // Updates the expand/collapse button and the overlay class.
    function syncExpandedState()
    {
        if (mapWrapper)
        {
            mapWrapper.classList.toggle("is-expanded", isExpanded);
        }

        if (toggleButton)
        {
            toggleButton.textContent = isExpanded ? "Close Map" : "Expand Map";
            toggleButton.setAttribute("aria-pressed", isExpanded ? "true" : "false");
        }
    }

    // Links the minimap to the maze layout and live player controller.
    function trackPlayer(playerController, layout)
    {
        trackedPlayer = playerController;
        mazeLayout = layout;
        updateRoute(true);
        drawTrackedPlayer();
    }

    // Positions and rotates the SVG marker to match the player's location and facing direction.
    function updatePlayerMarker(pixelPosition, lookDirection, metrics = getDisplayMetrics())
    {
        const displayTileSize = metrics.displayWidth / maze.width;
        const markerSize = Math.max(displayTileSize * 1.4, 16);

        // The SVG asset points "up" by default. atan2 returns the angle relative to the positive X axis, so we add 90 degrees to align it with the positive Y axis.
        const angleInRadians = Math.atan2(lookDirection.z, lookDirection.x) + Math.PI / 2;
        const angleInDegrees = THREE.MathUtils.radToDeg(angleInRadians);

        playerMarker.style.width = `${markerSize}px`;
        playerMarker.style.height = `${markerSize}px`;
        playerMarker.style.left = `${pixelPosition.x}px`;
        playerMarker.style.top = `${pixelPosition.y}px`;
        playerMarker.style.transform = `translate(-50%, -50%) rotate(${angleInDegrees}deg)`;
        playerMarker.style.display = "block";
    }

    // Refreshes the player indicator from the tracked controller's current position and look direction.
    function drawTrackedPlayer()
    {
        if (!trackedPlayer || !mazeLayout)
        {
            playerMarker.style.display = "none";
            return;
        }

        const metrics = getDisplayMetrics();
        const pixelPosition = worldToMinimapPixels(trackedPlayer.camera.position, metrics);

        if (
            !pixelPosition
            || pixelPosition.x < 0
            || pixelPosition.x > metrics.displayWidth
            || pixelPosition.y < 0
            || pixelPosition.y > metrics.displayHeight
        )
        {
            // If the player is outside the bounds of the minimap (by falling into the void should this bug happen), we hide the marker to avoid confusion from it being stuck at the edge of the map.
            playerMarker.style.display = "none";
            return;
        }

        updatePlayerMarker(pixelPosition, trackedPlayer.getLookDirectionOnPlane(), metrics);
    }

    // Converts a click on the displayed map back into a maze cell selection.
    function getClickedCell(event)
    {
        const rect = baseCanvas.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0)
        {
            return null;
        }

        const normalizedX = (event.clientX - rect.left) / rect.width;
        const normalizedY = (event.clientY - rect.top) / rect.height;

        if (
            normalizedX < 0
            || normalizedX > 1
            || normalizedY < 0
            || normalizedY > 1
        )
        {
            return null;
        }

        return {
            x: Math.floor((normalizedX * baseCanvas.width) / tileSize),
            y: Math.floor((normalizedY * baseCanvas.height) / tileSize)
        };
    }

    // Handles a destination click on the expanded minimap.
    function handleMapClick(event)
    {
        if (!isExpanded)
        {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const clickedCell = getClickedCell(event);
        setDestinationCell(clickedCell);
    }

    // Expands or collapses the minimap and releases pointer lock when interaction is needed.
    function setExpanded(nextExpanded)
    {
        isExpanded = nextExpanded;

        if (isExpanded)
        {
            if (trackedPlayer)
            {
                trackedPlayer.releasePointerLock();
            }
            else if (document.pointerLockElement && document.exitPointerLock)
            {
                document.exitPointerLock();
            }
        }
        else if (trackedPlayer)
        {
            trackedPlayer.requestPointerLock();
        }

        syncExpandedState();
        drawTrackedPlayer();
        drawCurrentRoute();
    }

    // Toggles between the compact and expanded minimap states.
    function toggleExpanded()
    {
        setExpanded(!isExpanded);
    }

    // Allows the minimap to be opened and closed from the keyboard.
    function handleGlobalKeyDown(event)
    {
        const pressedMinimapKey = event.code === "KeyM" || event.key?.toLowerCase() === "m";

        if (!pressedMinimapKey || event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        {
            return;
        }

        event.preventDefault();
        toggleExpanded();
    }

    document.addEventListener("keydown", handleGlobalKeyDown);

    return {
        maze,
        texture: result.texture,
        baseCanvas,
        canvasStack,
        pathLayer,
        playerMarker,
        trackPlayer,
        handleMapClick,
        clearDestination,
        attachUi(nextMapWrapper, nextToggleButton)
        {
            mapWrapper = nextMapWrapper;
            toggleButton = nextToggleButton;
            syncExpandedState();
        },
        toggleExpanded,
        setExpanded,

        // Updates the route state and the live player arrow each frame after the player moves.
        tick()
        {
            updateRoute();
            drawTrackedPlayer();
        }
    };
}

// Creates the DOM overlay for the minimap and returns both the maze and its live UI controller.
function addMazeMapOverlay(container, options = {})
{
    const mazeWidth = options.mazeWidth ?? 25;
    const mazeHeight = options.mazeHeight ?? 15;
    const tileSize = options.tileSize ?? 8;
    const mainTheme = options.mainTheme ?? "random";

    const maze = generateMazeMap(mazeWidth, mazeHeight, {
        mainTheme: mainTheme
    });

    // The maze generator already returns an ASCII field, so the minimap can be built without
    // re-walking the maze cells in a second custom rendering path.
    const result = createMazeTextureFromAscii(maze.ascii, tileSize);
    result.canvas.style.width = `${maze.width * tileSize * 2}px`;
    result.canvas.style.height = `${maze.height * tileSize * 2}px`;

    const minimap = createMinimapController(maze, result, tileSize);
    exposeGeneratedMazeDebugData(maze, minimap);

    const mapWrapper = document.createElement("div");
    mapWrapper.className = "maze-map-overlay";

    const header = document.createElement("div");
    header.className = "maze-map-header";

    const title = document.createElement("div");
    title.className = "maze-map-title";
    title.textContent = `Maze Map (${mainTheme})`;

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "maze-map-toggle";

    header.append(title, toggleButton);
    mapWrapper.append(header, minimap.canvasStack);
    container.appendChild(mapWrapper);

    minimap.attachUi(mapWrapper, toggleButton);

    toggleButton.addEventListener("click", (event) =>
    {
        event.preventDefault();
        event.stopPropagation();
        minimap.toggleExpanded();
    });

    minimap.canvasStack.addEventListener("click", (event) =>
    {
        minimap.handleMapClick(event);
    });

    console.log("Generated maze ascii:");
    console.log(maze.ascii);
    console.log("Teleport pairs:");
    console.log(maze.teleportPairs);

    return minimap;
}

// Adds a lightweight control legend so the first-person interaction is discoverable.
function addControlsHint(container)
{
    const hint = document.createElement("div");
    hint.className = "controls-overlay";
    hint.textContent = "Click to capture mouse | WASD / ZQSD move | Space jump | Shift sprint | M toggle map | Select destination on map";

    container.appendChild(hint);
    return hint;
}
