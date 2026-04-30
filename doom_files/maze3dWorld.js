// This file converts the generated 2D maze data into meshes placed in the 3D world.

// Builds the visible floors, walls and teleport markers for a generated maze.
function buildMazeWorldFromData(maze, options = {})
{
    const scene = options.scene;
    const attachToScene = options.attachToScene ?? true;
    const textureDisplacementEnabled = options.textureDisplacementEnabled ?? false;
    const useVisibilityCulling = options.useVisibilityCulling ?? false;
    const visibilityWarmupEnabled = options.visibilityWarmupEnabled ?? false;

    if (!scene)
    {
        throw new Error("buildMazeWorldFromData requires options.scene");
    }

    const layout = createMazeLayout(maze, options);

    const tileSize = layout.tileSize;
    const wallHeight = layout.wallHeight;
    const floorThickness = layout.floorThickness;
    const ceilingThickness = options.ceilingThickness ?? Math.max(tileSize * 0.12, floorThickness * 4);
    const floorY = layout.floorY;
    const wallY = layout.wallY;
    const ceilingY = floorY + wallHeight;
    const materialLibrary = createMazeWorldMaterialLibrary({
        renderer: options.renderer,
        tileSize,
        wallHeight,
        floorY,
        textureDisplacementEnabled
    });
    const decorationLayer = createMazeWorldDecorations(maze, layout, options);

    // Teleport spheres float slightly above the floor
    const sphereRadius = options.teleportSphereRadius ?? tileSize * 0.28;  // Sphere is temporarily used to visualize the transportation points.
    const sphereY = floorY + floorThickness / 2 + sphereRadius + 0.08;

    // This group holds the maze meshes (still temporary)
    const group = new THREE.Group();  // Likely to change when handling collisions
    group.name = "mazeWorld";
    group.userData.mazeLayout = layout;
    group.userData.trackedPlayer = null;

    // Displacement needs enough vertices to follow the real height texture. Too few segments
    // create large, soft bumps instead of tile/brick-level depth.
    const geometrySegments = textureDisplacementEnabled ? 32 : 1;
    const wallHeightSegments = textureDisplacementEnabled ? 18 : 1;
    const floorGeometry = new THREE.PlaneGeometry(
        tileSize,
        tileSize,
        geometrySegments,
        geometrySegments
    ).toNonIndexed();
    floorGeometry.rotateX(-Math.PI / 2);
    const ceilingGeometry = new THREE.BoxGeometry(
        tileSize,
        ceilingThickness,
        tileSize,
        geometrySegments,
        1,
        geometrySegments
    ).toNonIndexed();
    const wallGeometry = new THREE.BoxGeometry(
        tileSize,
        wallHeight,
        tileSize,
        geometrySegments,
        wallHeightSegments,
        geometrySegments
    ).toNonIndexed();
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

        trackRenderableCell(mesh, x, y, "floor");
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

        mesh.position.copy(layout.gridToWorldPosition(x, y, ceilingY + ceilingThickness / 2));
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        trackRenderableCell(mesh, x, y, "ceiling");
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

        trackRenderableCell(mesh, x, y, "wall");
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

        const teleportLight = new THREE.PointLight(sphereColor, 4.6, tileSize * 5.6, 1.25);
        teleportLight.position.set(0, sphereRadius * 1.2, 0);
        teleportLight.castShadow = options.teleportLightCastShadow ?? false;
        teleportLight.shadow.mapSize.width = 256;
        teleportLight.shadow.mapSize.height = 256;
        teleportLight.shadow.bias = -0.00006;
        teleportLight.shadow.normalBias = 0.02;
        teleportLight.shadow.radius = 2.4;
        teleportLight.shadow.camera.near = 0.2;
        teleportLight.shadow.camera.far = tileSize * 6;
        sphere.add(teleportLight);

        // Simple animation (still TODO)
        sphere.tick = (delta) =>
        {
            sphere.rotation.y += delta * 2.5;
        };

        trackRenderableCell(sphere, x, y, "teleport");
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
    const renderVisibilityEntries = [];
    const visibleCellKeys = new Set();
    const bufferedCellKeys = new Set();
    const cornerPeekCellKeys = new Set();
    const visibilityScratchCells = [];
    const visibilityProbeCells = [];
    const cornerPeekQueue = [];
    const visibilityCache = new Map();
    let lastVisibilityCellKey = null;
    let lastVisibilityProbeKey = null;

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

    const collisionEntries = [];

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

    function createCeilingCollisionEntry(x, y)
    {
        return {
            box: new THREE.Box3().setFromCenterAndSize(
                layout.gridToWorldPosition(x, y, ceilingY + ceilingThickness / 2),
                new THREE.Vector3(tileSize, ceilingThickness, tileSize)
            ),
            type: "ceiling",
            cell: { x, y }
        };
    }

    function hasSkylightOpening(x, y, currentCell)
    {
        return false;
    }

    function createCellKey(x, y)
    {
        return `${x},${y}`;
    }

    function trackRenderableCell(mesh, x, y, type)
    {
        mesh.userData.mazeCell = { x, y };
        mesh.userData.renderVisibilityType = type;
        renderVisibilityEntries.push({
            mesh,
            x,
            y,
            key: createCellKey(x, y),
            type
        });
    }

    function getSupercoverLineCells(startCell, endCell, target = visibilityScratchCells)
    {
        target.length = 0;

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

        target.push({ x: currentX, y: currentY });

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

            target.push({ x: currentX, y: currentY });
        }

        return target;
    }

    function hasLineOfSightToCell(startCell, endCell)
    {
        const cells = getSupercoverLineCells(startCell, endCell);

        for (let index = 1; index < cells.length; index++)
        {
            const cell = layout.getCell(cells[index].x, cells[index].y);

            if (!cell)
            {
                return false;
            }

            if (cell.type === "wall")
            {
                return index === cells.length - 1;
            }
        }

        return true;
    }

    function markVisibleCell(x, y, targetSet)
    {
        if (!layout.isInBounds(x, y))
        {
            return;
        }

        targetSet.add(createCellKey(x, y));
    }

    function markCellAndNeighbors(x, y, targetSet, radius = 1)
    {
        for (let offsetY = -radius; offsetY <= radius; offsetY++)
        {
            for (let offsetX = -radius; offsetX <= radius; offsetX++)
            {
                markVisibleCell(x + offsetX, y + offsetY, targetSet);
            }
        }
    }

    function collectVisibilityProbeCells(playerCell)
    {
        const fractionalCoordinates = layout.worldToGridFractionalCoordinates(
            group.userData.trackedPlayer.camera.position.x,
            group.userData.trackedPlayer.camera.position.z
        );
        const localX = fractionalCoordinates.x - playerCell.x;
        const localY = fractionalCoordinates.y - playerCell.y;
        const edgeThreshold = 0.24;

        visibilityProbeCells.length = 0;
        visibilityProbeCells.push({ x: playerCell.x, y: playerCell.y });

        if (localX > edgeThreshold && layout.isWalkable(playerCell.x + 1, playerCell.y))
        {
            visibilityProbeCells.push({ x: playerCell.x + 1, y: playerCell.y });
        }

        if (localX < -edgeThreshold && layout.isWalkable(playerCell.x - 1, playerCell.y))
        {
            visibilityProbeCells.push({ x: playerCell.x - 1, y: playerCell.y });
        }

        if (localY > edgeThreshold && layout.isWalkable(playerCell.x, playerCell.y + 1))
        {
            visibilityProbeCells.push({ x: playerCell.x, y: playerCell.y + 1 });
        }

        if (localY < -edgeThreshold && layout.isWalkable(playerCell.x, playerCell.y - 1))
        {
            visibilityProbeCells.push({ x: playerCell.x, y: playerCell.y - 1 });
        }

        return visibilityProbeCells;
    }

    function revealCellsAroundCorners(sourceCellKeys, targetCellKeys)
    {
        const cornerPeekDepth = 3;

        cornerPeekCellKeys.clear();
        cornerPeekQueue.length = 0;

        for (const key of sourceCellKeys)
        {
            const [x, y] = key.split(",").map(Number);

            if (!layout.isWalkable(x, y))
            {
                continue;
            }

            cornerPeekCellKeys.add(key);
            cornerPeekQueue.push({ x, y, depth: 0 });
        }

        for (let index = 0; index < cornerPeekQueue.length; index++)
        {
            const current = cornerPeekQueue[index];

            markCellAndNeighbors(current.x, current.y, targetCellKeys, 1);

            if (current.depth >= cornerPeekDepth)
            {
                continue;
            }

            for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            {
                const nextX = current.x + offsetX;
                const nextY = current.y + offsetY;
                const nextKey = createCellKey(nextX, nextY);

                if (!layout.isWalkable(nextX, nextY) || cornerPeekCellKeys.has(nextKey))
                {
                    continue;
                }

                cornerPeekCellKeys.add(nextKey);
                cornerPeekQueue.push({
                    x: nextX,
                    y: nextY,
                    depth: current.depth + 1
                });
            }
        }
    }

    function buildVisibilityProbeKey(playerCell)
    {
        return collectVisibilityProbeCells(playerCell)
            .map((cell) => createCellKey(cell.x, cell.y))
            .join("|");
    }

    function getVisibilityForProbeCell(probeCell)
    {
        const visibilityRadius = 8;
        const probeCellKey = createCellKey(probeCell.x, probeCell.y);
        const cachedVisibility = visibilityCache.get(probeCellKey);

        if (cachedVisibility)
        {
            return cachedVisibility;
        }

        visibleCellKeys.clear();

        for (let y = probeCell.y - visibilityRadius; y <= probeCell.y + visibilityRadius; y++)
        {
            for (let x = probeCell.x - visibilityRadius; x <= probeCell.x + visibilityRadius; x++)
            {
                if (!layout.isInBounds(x, y))
                {
                    continue;
                }

                const deltaX = x - probeCell.x;
                const deltaY = y - probeCell.y;

                if ((deltaX * deltaX) + (deltaY * deltaY) > visibilityRadius * visibilityRadius)
                {
                    continue;
                }

                if (hasLineOfSightToCell(probeCell, { x, y }))
                {
                    markVisibleCell(x, y, visibleCellKeys);
                }
            }
        }

        const visibility = new Set();
        revealCellsAroundCorners(visibleCellKeys, visibility);
        visibilityCache.set(probeCellKey, visibility);

        if (visibilityCache.size > 512)
        {
            visibilityCache.delete(visibilityCache.keys().next().value);
        }

        return visibility;
    }

    function updateVisibleCellsFromPlayer(playerCell)
    {
        const probeCells = collectVisibilityProbeCells(playerCell);

        bufferedCellKeys.clear();

        for (const probeCell of probeCells)
        {
            const probeVisibility = getVisibilityForProbeCell(probeCell);

            for (const key of probeVisibility)
            {
                bufferedCellKeys.add(key);
            }
        }
    }

    function applyRenderableVisibility()
    {
        for (const entry of renderVisibilityEntries)
        {
            const shouldBeVisible = bufferedCellKeys.has(entry.key);

            if (entry.mesh.visible !== shouldBeVisible)
            {
                entry.mesh.visible = shouldBeVisible;
            }
        }
    }

    function startVisibilityCacheWarmup()
    {
        const warmupQueue = [];
        const warmupRadius = 2;
        const warmupCenter = maze.start ?? {
            x: Math.floor(maze.width / 2),
            y: Math.floor(maze.height / 2)
        };

        for (let y = warmupCenter.y - warmupRadius; y <= warmupCenter.y + warmupRadius; y++)
        {
            for (let x = warmupCenter.x - warmupRadius; x <= warmupCenter.x + warmupRadius; x++)
            {
                if (layout.isWalkable(x, y))
                {
                    warmupQueue.push({ x, y });
                }
            }
        }

        function scheduleNextWarmup()
        {
            if (warmupQueue.length === 0)
            {
                return;
            }

            if (typeof window !== "undefined" && window.requestIdleCallback)
            {
                window.requestIdleCallback(processWarmupBatch, { timeout: 200 });
            }
            else if (typeof window !== "undefined")
            {
                window.setTimeout(() => processWarmupBatch(), 16);
            }
        }

        function processWarmupBatch(deadline)
        {
            let processedCount = 0;

            while (
                warmupQueue.length > 0
                && processedCount < 2
                && (!deadline || deadline.timeRemaining() > 2)
            )
            {
                getVisibilityForProbeCell(warmupQueue.shift());
                processedCount++;
            }

            scheduleNextWarmup();
        }

        scheduleNextWarmup();
    }

    function updateRenderableVisibility(force = false)
    {
        if (!useVisibilityCulling)
        {
            for (const entry of renderVisibilityEntries)
            {
                entry.mesh.visible = true;
            }

            lastVisibilityCellKey = null;
            lastVisibilityProbeKey = null;
            return;
        }

        const trackedPlayer = group.userData.trackedPlayer;
        const playerCell = trackedPlayer?.getCurrentMazeCell?.();

        if (!playerCell)
        {
            for (const entry of renderVisibilityEntries)
            {
                entry.mesh.visible = true;
            }

            lastVisibilityCellKey = null;
            lastVisibilityProbeKey = null;
            return;
        }

        const playerCellKey = createCellKey(playerCell.x, playerCell.y);
        const probeKey = buildVisibilityProbeKey(playerCell);

        if (!force && playerCellKey === lastVisibilityCellKey && probeKey === lastVisibilityProbeKey)
        {
            return;
        }

        updateVisibleCellsFromPlayer(playerCell);

        applyRenderableVisibility();

        lastVisibilityCellKey = playerCellKey;
        lastVisibilityProbeKey = probeKey;
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
                collisionEntries.push(createWallCollisionEntry(x, y));
            }
            else
            {
                group.add(createFloorMesh(x, y, currentCell));

                if (!hasSkylightOpening(x, y, currentCell))
                {
                    group.add(createCeilingMesh(x, y, currentCell));
                    collisionEntries.push(createCeilingCollisionEntry(x, y));
                }

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
    // can ask for nearby walls, ceilings, and props instead of testing every object in the maze.
    // Prefer the high-resolution timer and present more precision. If the octree recorded
    // its own internal build time, prefer that value as it measures exactly the work done
    // inside the octree implementation (including inserts and any subdivides).
    const now = typeof performance !== "undefined" && performance.now
        ? performance.now.bind(performance)
        : Date.now;

    collisionEntries.push(...decorationLayer.collisionEntries);
    const collisionOctree = createCollisionOctree(collisionEntries);

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
            createCollisionOctree(collisionEntries);
        }
        const benchEnd = now();
        octreeBuildMs = (benchEnd - benchStart) / runs;
    }

    collisionOctree.buildTimeMs = octreeBuildMs;
    group.userData.collisionOctree = collisionOctree;
    group.userData.collisionOctreeBuildMs = octreeBuildMs;

    // Log with microsecond precision to make very fast builds visible.
    const octreeBuildUs = octreeBuildMs * 1000;
    console.info(`Octree build: ${octreeBuildMs.toFixed(6)} ms (${Math.round(octreeBuildUs)} us, ${collisionEntries.length} entries)`);

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

    group.trackPlayer = (playerController) =>
    {
        group.userData.trackedPlayer = playerController;
        decorationLayer.trackPlayer?.(playerController);
        updateRenderableVisibility(true);

        if (useVisibilityCulling && visibilityWarmupEnabled)
        {
            startVisibilityCacheWarmup();
        }
    };

    if (useVisibilityCulling)
    {
        group.tick = () =>
        {
            updateRenderableVisibility();
        };
    }

    // Returns both the generated mesh group and the shared layout helper used to place it.
    return {
        group,
        layout,
        collisionOctree,
        octreeBuildTimeMs: octreeBuildMs,
        mount,
        trackPlayer(playerController)
        {
            group.trackPlayer(playerController);
        },
        whenTexturesReady()
        {
            return materialLibrary.whenTexturesReady();
        },
        updateVisibilityNow()
        {
            updateRenderableVisibility(true);
        },
        setTextureDisplacementEnabled(enabled)
        {
            materialLibrary.setTextureDisplacementEnabled(enabled);
        },
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
