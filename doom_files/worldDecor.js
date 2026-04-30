// This file adds theme-specific props and local lights on top of the base maze geometry.
// Decorative props contribute collision boxes and local lights so the visual layer also
// affects navigation and atmosphere.

// Builds the decorative object layer that makes maze sections visually distinct.
function createMazeWorldDecorations(maze, layout, options = {})
{
    const tileSize = layout.tileSize;
    const wallHeight = layout.wallHeight;
    const floorY = layout.floorY;
    const maxRegionLights = options.maxRegionLights ?? 1;
    const maxCorridorLights = options.maxCorridorLights ?? 0;
    const maxShadowCastingLights = options.maxShadowCastingLights ?? 4;
    const maxAmbientTileLights = options.maxAmbientTileLights ?? 12;
    const maxAnimatedEmitterLights = options.maxAnimatedEmitterLights ?? 18;
    const maxTileAccents = options.maxTileAccents ?? 12;

    const group = new THREE.Group();
    group.name = "mazeDecorations";

    const materialCache = new Map();
    const geometrySet = new Set();
    let placedRegionLights = 0;
    let placedCorridorLights = 0;
    let placedShadowCastingLights = 0;
    let placedAmbientTileLights = 0;
    let placedAnimatedEmitterLights = 0;
    let placedTileAccents = 0;
    const occlusionTrackedLights = [];
    const occlusionVisibleLights = [];
    let trackedPlayerController = null;
    let lastOcclusionPlayerCellKey = null;
    const lightVisibilityCache = new Map();
    const animatedEmitters = [];

    function registerGeometry(geometry)
    {
        geometrySet.add(geometry);
        return geometry;
    }

    const geometries = {
        pedestal: registerGeometry(new THREE.CylinderGeometry(tileSize * 0.16, tileSize * 0.22, tileSize * 0.24, 16)),
        plinth: registerGeometry(new THREE.BoxGeometry(tileSize * 0.5, tileSize * 0.2, tileSize * 0.5)),
        column: registerGeometry(new THREE.CylinderGeometry(tileSize * 0.08, tileSize * 0.11, wallHeight * 0.72, 12)),
        crate: registerGeometry(new THREE.BoxGeometry(tileSize * 0.28, tileSize * 0.28, tileSize * 0.28)),
        cabinet: registerGeometry(new THREE.BoxGeometry(tileSize * 0.26, tileSize * 0.44, tileSize * 0.18)),
        pipe: registerGeometry(new THREE.CylinderGeometry(tileSize * 0.05, tileSize * 0.05, wallHeight * 0.52, 12)),
        orb: registerGeometry(new THREE.SphereGeometry(tileSize * 0.1, 16, 16)),
        smallOrb: registerGeometry(new THREE.SphereGeometry(tileSize * 0.06, 14, 14)),
        shard: registerGeometry(new THREE.OctahedronGeometry(tileSize * 0.16, 0)),
        smallShard: registerGeometry(new THREE.OctahedronGeometry(tileSize * 0.1, 0)),
        rock: registerGeometry(new THREE.DodecahedronGeometry(tileSize * 0.16, 0)),
        smallRock: registerGeometry(new THREE.DodecahedronGeometry(tileSize * 0.1, 0)),
        ring: registerGeometry(new THREE.TorusGeometry(tileSize * 0.2, tileSize * 0.035, 10, 24)),
        obelisk: registerGeometry(new THREE.ConeGeometry(tileSize * 0.12, tileSize * 0.52, 6)),
        crystalSpike: registerGeometry(new THREE.ConeGeometry(tileSize * 0.08, tileSize * 0.48, 5)),
        beaconCrystal: registerGeometry(new THREE.OctahedronGeometry(tileSize * 0.12, 0)),
        softShadowPlane: registerGeometry(new THREE.PlaneGeometry(1, 1, 1, 1))
    };

    // Produces a stable random sequence per region so decoration placement is deterministic.
    function createSeededRandom(seed)
    {
        let state = seed >>> 0;

        return () =>
        {
            state = (state + 0x6D2B79F5) | 0;

            let result = Math.imul(state ^ (state >>> 15), 1 | state);
            result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
            return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createCellKey(x, y)
    {
        return `${x},${y}`;
    }

    function getSupercoverLineCells(startCell, endCell, target = [])
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

    function hasLineOfSightBetweenCells(startCell, endCell)
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
                return false;
            }
        }

        return true;
    }

    function registerOcclusionTrackedLight(light, sourceCell, options = {})
    {
        if (!light || !sourceCell)
        {
            return light;
        }

        const sourceWorldPosition = layout.gridToWorldPosition(
            sourceCell.x,
            sourceCell.y,
            light.position?.y ?? (layout.floorY + layout.wallHeight * 0.5)
        );

        // Distance-managed lighting: no line-of-sight switching here.
        // The previous LOS approach caused visible popping when crossing corridors.
        const activationDistanceCells = Math.max(
            options.activationDistanceCells ?? options.occlusionDistance ?? 18,
            18
        );
        const fadeStartCells = Math.max(
            options.fadeStartCells ?? activationDistanceCells * 0.72,
            10
        );
        const minimumDistanceMultiplier = options.minimumDistanceMultiplier ?? 0.08;

        light.userData.sourceCell = { x: sourceCell.x, y: sourceCell.y };
        light.userData.sourceWorldPosition = sourceWorldPosition;
        light.userData.sourceRegionId = sourceCell.regionId ?? null;
        light.userData.baseIntensity = options.baseIntensity ?? light.intensity;
        light.userData.visibilityMultiplier = 1;
        light.userData.currentVisibilityMultiplier = 1;
        light.userData.targetVisibilityMultiplier = 1;
        light.userData.occlusionFadeSpeed = options.occlusionFadeSpeed ?? 5.0;
        light.userData.animateWithVisibility = options.animateWithVisibility ?? false;
        light.userData.activationDistanceCells = activationDistanceCells;
        light.userData.activationDistanceSq = (activationDistanceCells * layout.tileSize) ** 2;
        light.userData.fadeStartDistanceSq = (fadeStartCells * layout.tileSize) ** 2;
        light.userData.minimumDistanceMultiplier = minimumDistanceMultiplier;
        light.userData.shadowManaged = false;
        light.userData.wantsShadow = light.castShadow;
        light.userData.lastPlayerDistanceSq = Infinity;
        light.visible = true;
        light.intensity = light.userData.baseIntensity;
        occlusionTrackedLights.push(light);

        return light;
    }

    function smoothstep(edge0, edge1, value)
    {
        if (edge0 === edge1)
        {
            return value < edge0 ? 0 : 1;
        }

        const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    function updateOcclusionTrackedLights(force = false)
    {
        if (occlusionTrackedLights.length === 0)
        {
            return;
        }

        if (!trackedPlayerController)
        {
            return;
        }

        const playerPosition = trackedPlayerController.camera?.position;

        if (!playerPosition)
        {
            return;
        }

        occlusionVisibleLights.length = 0;

        for (const light of occlusionTrackedLights)
        {
            const sourceWorldPosition = light.userData.sourceWorldPosition;
            const dx = sourceWorldPosition.x - playerPosition.x;
            const dz = sourceWorldPosition.z - playerPosition.z;
            const distanceSq = (dx * dx) + (dz * dz);
            const fadeStartDistanceSq = light.userData.fadeStartDistanceSq ?? (layout.tileSize * 12) ** 2;
            const activationDistanceSq = light.userData.activationDistanceSq ?? (layout.tileSize * 18) ** 2;
            const minimumDistanceMultiplier = light.userData.minimumDistanceMultiplier ?? 0.08;
            const fadeAmount = smoothstep(fadeStartDistanceSq, activationDistanceSq, distanceSq);

            light.visible = true;
            light.userData.lastPlayerDistanceSq = distanceSq;
            light.userData.targetVisibilityMultiplier = THREE.MathUtils.lerp(
                1,
                minimumDistanceMultiplier,
                fadeAmount
            );

            if (distanceSq <= activationDistanceSq)
            {
                occlusionVisibleLights.push(light);
            }
        }

        occlusionVisibleLights.sort(
            (firstLight, secondLight) => firstLight.userData.lastPlayerDistanceSq - secondLight.userData.lastPlayerDistanceSq
        );

        // Shadow state stays stable. Do not enable/disable point-light shadows while walking.
        for (let index = 0; index < occlusionVisibleLights.length && index < maxAnimatedEmitterLights; index++)
        {
            occlusionVisibleLights[index].userData.isNearPlayer = true;
        }
    }


    function applyOcclusionLightSmoothing(delta)
    {
        if (occlusionTrackedLights.length === 0)
        {
            return;
        }

        const safeDelta = Math.max(0, Math.min(delta ?? 0, 0.08));

        for (const light of occlusionTrackedLights)
        {
            const currentMultiplier = light.userData.currentVisibilityMultiplier ?? 1;
            const targetMultiplier = light.userData.targetVisibilityMultiplier ?? 1;
            const fadeSpeed = light.userData.occlusionFadeSpeed ?? 5.0;
            const blend = 1 - Math.exp(-fadeSpeed * safeDelta);
            const nextMultiplier = currentMultiplier + (targetMultiplier - currentMultiplier) * blend;

            light.visible = true;
            light.userData.currentVisibilityMultiplier = nextMultiplier;
            light.userData.visibilityMultiplier = nextMultiplier;

            if (!light.userData.animateWithVisibility)
            {
                light.intensity = (light.userData.baseIntensity ?? light.intensity) * nextMultiplier;
            }
        }
    }

    // Maps specific maze theme names to broader decoration families.
    function inferThemeFamily(identifier = "")
    {
        const normalizedIdentifier = String(identifier).toLowerCase();

        if (
            normalizedIdentifier.includes("foresttemple")
            || normalizedIdentifier.includes("oldforesttemple")
        )
        {
            return "forestTemple";
        }

        if (normalizedIdentifier.includes("castle"))
        {
            return "castle";
        }

        if (normalizedIdentifier.includes("industrial"))
        {
            return "industrial";
        }

        if (normalizedIdentifier.includes("firecave"))
        {
            return "fireCave";
        }

        if (normalizedIdentifier.includes("icecave"))
        {
            return "iceCave";
        }

        return "neutral";
    }

    // Defines the materials and light colors that characterize each theme family.
    function getThemePalette(themeFamily)
    {
        switch (themeFamily)
        {
            case "castle":
                return {
                    stone: "#b19f89",
                    metal: "#857f77",
                    accent: "#f0d892",
                    glow: "#ffe08a",
                    light: "#ffe8be",
                    shadow: "#68584a"
                };

            case "industrial":
                return {
                    stone: "#9da8b0",
                    metal: "#d0d9e0",
                    accent: "#f4e79d",
                    glow: "#b7f5ff",
                    light: "#c7f4ff",
                    shadow: "#454c52"
                };

            case "forestTemple":
                return {
                    stone: "#a7b183",
                    metal: "#836644",
                    accent: "#f1f6ab",
                    glow: "#9dffaf",
                    light: "#adffc2",
                    shadow: "#516548"
                };

            case "fireCave":
                return {
                    stone: "#8a6559",
                    metal: "#b28b79",
                    accent: "#ffc57b",
                    glow: "#f56320",
                    light: "#ff9654",
                    shadow: "#442b22"
                };

            case "iceCave":
                return {
                    stone: "#c0dce8",
                    metal: "#93aabe",
                    accent: "#effcff",
                    glow: "#9de6ff",
                    light: "#8cdeff",
                    shadow: "#42647a"
                };

            default:
                return {
                    stone: "#7b7f84",
                    metal: "#a1a6aa",
                    accent: "#d6c97a",
                    glow: "#ffffff",
                    light: "#ffffff",
                    shadow: "#404347"
                };
        }
    }

    // Creates or reuses a material so decorative meshes stay lightweight.
    function getMaterial(key, parameters)
    {
        if (!materialCache.has(key))
        {
            const materialKind = parameters.materialKind;
            const materialParameters = { ...parameters };

            delete materialParameters.materialKind;

            materialCache.set(
                key,
                materialKind === "basic"
                    ? new THREE.MeshBasicMaterial(materialParameters)
                    : new THREE.MeshStandardMaterial(materialParameters)
            );
        }

        return materialCache.get(key);
    }

    // Collects floor cells by region so one decorative cluster can represent one maze section.
    function collectRegions()
    {
        const regionsById = new Map();

        for (let y = 0; y < maze.height; y++)
        {
            for (let x = 0; x < maze.width; x++)
            {
                const cell = maze.cells[y][x];

                if (cell.type !== "floor" || cell.regionId === null)
                {
                    continue;
                }

                if (!regionsById.has(cell.regionId))
                {
                    regionsById.set(cell.regionId, {
                        id: cell.regionId,
                        kind: cell.regionKind ?? "corridor",
                        themeName: cell.themeName ?? "neutral",
                        cells: []
                    });
                }

                regionsById.get(cell.regionId).cells.push(cell);
            }
        }

        return [...regionsById.values()].sort((firstRegion, secondRegion) => firstRegion.id - secondRegion.id);
    }

    // Finds the floor cell nearest to the region center, preferring non-special non-teleport cells.
    function pickAnchorCell(region)
    {
        if (!region.cells.length)
        {
            return null;
        }

        const average = region.cells.reduce(
            (sum, cell) =>
            {
                sum.x += cell.x;
                sum.y += cell.y;
                return sum;
            },
            { x: 0, y: 0 }
        );

        average.x /= region.cells.length;
        average.y /= region.cells.length;

        const preferredCells = region.cells.filter((cell) => !cell.special && cell.teleportId === null);
        const candidateCells = preferredCells.length > 0 ? preferredCells : region.cells;

        let bestCell = candidateCells[0];
        let bestDistance = Infinity;

        for (const cell of candidateCells)
        {
            const distance = ((cell.x - average.x) ** 2) + ((cell.y - average.y) ** 2);

            if (distance < bestDistance)
            {
                bestCell = cell;
                bestDistance = distance;
            }
        }

        return bestCell;
    }

    // Ensures corridor decorations stay sparse while rooms almost always get a focal point.
    function shouldDecorateRegion(region)
    {
        if (region.kind === "room")
        {
            return region.cells.length >= 6;
        }

        return region.cells.length >= 9 && region.id % 3 === 0;
    }

    // Creates a mesh with consistent shadow settings for decorative props.
    function createDecorMesh(geometry, material, position, options = {})
    {
        const mesh = new THREE.Mesh(geometry, material);
        const receiveShadow = options.receiveShadow ?? true;

        mesh.position.copy(position);
        mesh.receiveShadow = receiveShadow;
        mesh.castShadow = options.castShadow ?? receiveShadow;
        mesh.userData.collidable = options.collidable ?? false;
        mesh.userData.collisionType = options.collisionType ?? "decor";
        mesh.userData.collisionScale = options.collisionScale ?? 1;
        mesh.userData.collisionHeightScale = options.collisionHeightScale ?? 1;
        mesh.userData.maxCollisionFootprint = options.maxCollisionFootprint ?? (tileSize * 0.54);

        return mesh;
    }

    // Adds a theme-colored point light at the same place as the visible emissive prop.
    function createDecorationLight(palette, variant, options = {})
    {
        const family = options.themeFamily ?? "neutral";
        const intensityMultiplier =
            family === "fireCave" ? 5.6 :
            family === "industrial" ? 4.8 :
            family === "castle" ? 4.25 :
            family === "forestTemple" ? 4.6 :
            family === "iceCave" ? 4.75 :
            3.8;
        const distanceMultiplier =
            family === "fireCave" ? 1.65 :
            family === "industrial" ? 1.58 :
            family === "castle" ? 1.48 :
            family === "forestTemple" ? 1.55 :
            family === "iceCave" ? 1.62 :
            1.38;
        const light = new THREE.PointLight(
            palette.light,
            (variant === "room" ? 2.45 : 1.7) * intensityMultiplier,
            tileSize * (variant === "room" ? 5.6 : 4.35) * distanceMultiplier,
            1.55
        );

        light.position.copy(options.anchor ?? new THREE.Vector3(0, wallHeight * 0.46, 0));
        light.castShadow = false;

        if (light.castShadow)
        {
            light.shadow.mapSize.width = options.shadowMapSize ?? 1024;
            light.shadow.mapSize.height = options.shadowMapSize ?? 1024;
            light.shadow.bias = -0.000035;
            light.shadow.normalBias = 0.035;
            light.shadow.radius = 2.2;
            light.shadow.camera.near = 0.12;
            light.shadow.camera.far = Math.min(light.distance, tileSize * 6.2);
        }

        if (options.sourceCell)
        {
            registerOcclusionTrackedLight(light, options.sourceCell, {
                baseIntensity: light.intensity,
                wantsShadow: light.castShadow,
                occlusionDistance: options.occlusionDistance ?? 8,
                occludedIntensityMultiplier: options.occludedIntensityMultiplier ?? 0.18
            });
        }

        return light;
    }

    function countPlacedShadowCastingLights()
    {
        let count = 0;

        for (const light of occlusionTrackedLights)
        {
            if (light.castShadow)
            {
                count++;
            }
        }

        return count;
    }

    function configurePointLightShadow(light, options = {})
    {
        if (!options.castShadow)
        {
            light.castShadow = false;
            return light;
        }

        light.castShadow = true;
        light.shadow.mapSize.width = options.mapSize ?? 512;
        light.shadow.mapSize.height = options.mapSize ?? 512;
        light.shadow.bias = options.bias ?? -0.000035;
        light.shadow.normalBias = options.normalBias ?? 0.035;
        light.shadow.radius = options.radius ?? 2.2;
        light.shadow.camera.near = 0.12;
        light.shadow.camera.far = options.far ?? light.distance;
        return light;
    }

    function createAnimatedEmitter(geometry, material, position, options = {})
    {
        const emitter = createDecorMesh(
            geometry,
            options.cloneMaterial ? material.clone() : material,
            position.clone(),
            {
                castShadow: options.meshCastShadow ?? false,
                receiveShadow: false,
                collidable: false
            }
        );
        const canUsePointLight = (options.lightIntensity ?? 1.5) > 0;
        const light = canUsePointLight
            ? new THREE.PointLight(
                options.lightColor ?? material.emissive ?? "#ffffff",
                (options.lightIntensity ?? 1.5) * (options.lightBoost ?? 1.65),
                (options.lightDistance ?? tileSize * 3.8) * (options.distanceBoost ?? 1.18),
                options.decay ?? 1.55
            )
            : null;
        const baseY = position.y;
        const baseScale = options.baseScale ?? 1;
        const scaleAmplitude = options.scaleAmplitude ?? 0.18;
        const verticalAmplitude = options.verticalAmplitude ?? tileSize * 0.08;
        const phase = options.phase ?? 0;
        const speed = options.speed ?? 1;
        const pulseSpeed = options.pulseSpeed ?? speed * 1.6;
        const rotationSpeed = options.rotationSpeed ?? 0.4;
        let baseIntensity = light?.intensity ?? 0;
        const baseOpacity = emitter.material.opacity ?? 1;
        const opacityAmplitude = options.opacityAmplitude ?? 0;

        emitter.scale.setScalar(baseScale);
        emitter.userData.collidable = false;
        emitter.userData.animationTime = phase;

        if (light)
        {
            // Basic stable shadow casting for real light sources only.
            // The glowing mesh itself still has castShadow=false above, so orbs/flames do not
            // cast shadows on themselves. Keep a strict budget and never toggle while walking.
            const animatedLightCastsShadow =
                false;

            configurePointLightShadow(light, {
                castShadow: animatedLightCastsShadow,
                mapSize: options.shadowMapSize ?? 384,
                far: (options.lightDistance ?? tileSize * 4.5) * (options.distanceBoost ?? 1.18),
                bias: -0.000045,
                normalBias: 0.04,
                radius: 2.0
            });

            baseIntensity = light.intensity;
            emitter.add(light);
            if (options.sourceCell)
            {
                registerOcclusionTrackedLight(light, options.sourceCell, {
                    baseIntensity: light.intensity,
                    animateWithVisibility: true,
                    wantsShadow: animatedLightCastsShadow,
                    occlusionDistance: options.occlusionDistance ?? 9,
                    occludedIntensityMultiplier: options.occludedIntensityMultiplier ?? 0.18
                });
            }
        }

        emitter.userData.updateEmitter = (delta) =>
        {
            emitter.userData.animationTime += delta;
            const time = emitter.userData.animationTime;
            const floatPhase = phase + time * speed;
            const pulse = 0.5 + 0.5 * Math.sin(phase + time * pulseSpeed);

            emitter.position.y = baseY + Math.sin(floatPhase) * verticalAmplitude;
            emitter.rotation.x += delta * rotationSpeed * 0.7;
            emitter.rotation.y += delta * rotationSpeed;
            emitter.rotation.z += delta * rotationSpeed * 0.45;
            emitter.scale.setScalar(baseScale * (1 + scaleAmplitude * pulse));

            if (emitter.material.transparent && opacityAmplitude > 0)
            {
                emitter.material.opacity = Math.max(0.04, baseOpacity * (1 - opacityAmplitude + opacityAmplitude * pulse));
            }

            if (light)
            {
                light.intensity = baseIntensity
                    * (light.userData.currentVisibilityMultiplier ?? light.userData.visibilityMultiplier ?? 1)
                    * (0.35 + pulse * 0.65);
            }
        };

        animatedEmitters.push(emitter);
        return emitter;
    }

    function shouldPlaceTileAccent(cell, interval, salt)
    {
        if (
            !cell
            || cell.special
            || cell.teleportId !== null
            || placedTileAccents >= maxTileAccents
        )
        {
            return false;
        }

        const densityInterval = cell.regionKind === "room"
            ? interval + 4
            : interval + 2;
        const value = ((cell.x + 1) * 73856093) ^ ((cell.y + 1) * 19349663) ^ salt;
        return ((value >>> 0) % densityInterval) === 0;
    }

    function claimAmbientTileLight()
    {
        placedAmbientTileLights++;
        return true;
    }

    function createThemeTileAccent(cell)
    {
        const themeFamily = inferThemeFamily(cell.themeName ?? cell.floorType ?? "neutral");
        const accent = new THREE.Group();
        const random = createSeededRandom((cell.x + 1) * 92837111 ^ (cell.y + 1) * 689287499);
        const position = layout.gridToWorldPosition(cell.x, cell.y, floorY);

        accent.position.copy(position);
        accent.name = `tileAccent_${themeFamily}_${cell.x}_${cell.y}`;

        if (themeFamily === "castle")
        {
            if (!shouldPlaceTileAccent(cell, 5, 0xCA571E))
            {
                return null;
            }

            placedTileAccents++;
            const torchMetal = getMaterial("castle:torchMetal", {
                color: "#3b2d25",
                roughness: 0.88,
                metalness: 0.04
            });
            const flameMaterial = getMaterial("castle:torchFlame", {
                materialKind: "basic",
                color: "#b31f15",
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false
            });
            const torch = createDecorMesh(
                geometries.pipe,
                torchMetal,
                new THREE.Vector3((random() - 0.5) * tileSize * 0.36, wallHeight * 0.18, (random() - 0.5) * tileSize * 0.36),
                {
                    collidable: true,
                    collisionScale: 0.45
                }
            );
            const hasLight = claimAmbientTileLight();

            torch.scale.set(0.65, 0.62, 0.65);
            accent.add(torch);
            accent.add(
                createAnimatedEmitter(
                    geometries.smallOrb,
                    flameMaterial,
                    torch.position.clone().add(new THREE.Vector3(0, tileSize * 0.16, 0)),
                    {
                        lightColor: "#ff6416",
                        lightIntensity: hasLight ? 25 : 0,
                        lightDistance: tileSize * 5,
                        baseScale: 0.24,
                        scaleAmplitude: 0.36,
                        opacityAmplitude: 0.38,
                        verticalAmplitude: tileSize * 0.035,
                        speed: 1.25,
                        pulseSpeed: 3.5,
                        rotationSpeed: 0.75,
                        cloneMaterial: true,
                        lightCastShadow: false,
                        sourceCell: cell,
                        occlusionDistance: 10
                    }
                )
            );
            return accent;
        }

        if (themeFamily === "industrial")
        {
            if (!shouldPlaceTileAccent(cell, 5, 0x1ED1ED))
            {
                return null;
            }

            placedTileAccents++;
            const ledMaterial = getMaterial("industrial:led", {
                materialKind: "basic",
                color: "#c8fbff",
                toneMapped: false
            });
            const hasLight = claimAmbientTileLight();

            accent.add(
                createAnimatedEmitter(
                    geometries.smallOrb,
                    ledMaterial,
                    new THREE.Vector3((random() - 0.5) * tileSize * 0.28, wallHeight - tileSize * 0.035, (random() - 0.5) * tileSize * 0.28),
                    {
                        lightColor: "#c8fbff",
                        lightIntensity: hasLight ? 100 : 0,
                        lightDistance: tileSize * 10,
                        baseScale: 0.22,
                        scaleAmplitude: 0.05,
                        verticalAmplitude: 0,
                        speed: 0.1,
                        pulseSpeed: 1.1,
                        rotationSpeed: 0.05,
                        lightCastShadow: true,
                        sourceCell: cell,
                        occlusionDistance: 10
                    }
                )
            );
            return accent;
        }

        if (themeFamily === "forestTemple")
        {
            if (!shouldPlaceTileAccent(cell, 4, 0xF0A57))
            {
                return null;
            }

            placedTileAccents++;
            const orbColor = random() > 0.5 ? "#e4ff62" : "#58ff7d";
            const orbMaterial = getMaterial(`forestTemple:tileOrb:${orbColor}`, {
                materialKind: "basic",
                color: orbColor,
                transparent: true,
                opacity: 0.94,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false
            });
            const hasLight = claimAmbientTileLight();

            for (let index = 0; index < 2; index++)
            {
                accent.add(
                    createAnimatedEmitter(
                        geometries.smallOrb,
                        orbMaterial,
                        new THREE.Vector3((random() - 0.5) * tileSize * 0.52, tileSize * (0.16 + random() * 0.18), (random() - 0.5) * tileSize * 0.52),
                        {
                            lightColor: orbColor,
                            lightIntensity: hasLight && index === 0 ? 25 : 0,
                            lightDistance: tileSize * 8.8,
                            baseScale: 0.16,
                            scaleAmplitude: 0.55,
                            opacityAmplitude: 0.5,
                            verticalAmplitude: tileSize * 0.11,
                            speed: 0.9 + random() * 0.45,
                            pulseSpeed: 2.2 + random(),
                            rotationSpeed: 0.4,
                            phase: random() * Math.PI * 2,
                            cloneMaterial: true,
                            lightCastShadow: true,
                            sourceCell: cell,
                            occlusionDistance: 10
                        }
                    )
                );
            }
            return accent;
        }

        if (themeFamily === "fireCave")
        {
            if (!shouldPlaceTileAccent(cell, 4, 0xF17E))
            {
                return null;
            }

            placedTileAccents++;
            const emberMaterial = getMaterial("fireCave:risingEmber", {
                materialKind: "basic",
                color: "#ff7a20",
                transparent: true,
                opacity: 0.88,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false
            });
            const hasLight = claimAmbientTileLight();

            for (let index = 0; index < 3; index++)
            {
                accent.add(
                    createAnimatedEmitter(
                        geometries.smallOrb,
                        emberMaterial,
                        new THREE.Vector3((random() - 0.5) * tileSize * 0.62, tileSize * (0.08 + random() * 0.16), (random() - 0.5) * tileSize * 0.62),
                        {
                            lightColor: "#ff8a1f",
                            // Let all three ember meshes contribute a small glow instead of only
                            // the first one lighting the tile. The total intensity stays close to
                            // the old single-light value, so the fire cave does not become brighter overall.
                            lightIntensity: hasLight ? 3.2 : 0,
                            lightDistance: tileSize * 7.6,
                            baseScale: 0.2 + random() * 0.12,
                            scaleAmplitude: 0.62,
                            opacityAmplitude: 0.55,
                            verticalAmplitude: tileSize * 0.26,
                            speed: 0.65 + random() * 0.25,
                            pulseSpeed: 2.4 + random(),
                            rotationSpeed: 0.9,
                            phase: random() * Math.PI * 2,
                            cloneMaterial: true,
                            // Tiny floating embers should glow, but they should not cast self-looking
                            // shadows against each other.
                            lightCastShadow: false,
                            sourceCell: cell,
                            occlusionDistance: 10
                        }
                    )
                );
            }
            return accent;
        }

        if (themeFamily === "iceCave")
        {
            if (!shouldPlaceTileAccent(cell, 6, 0x1CE))
            {
                return null;
            }

            placedTileAccents++;
            const iceGlowMaterial = getMaterial("iceCave:softGlowCrystal", {
                materialKind: "basic",
                color: "#dcfbff",
                transparent: true,
                opacity: 0.82,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false
            });
            const hasLight = claimAmbientTileLight();

            const floatingCrystal = createAnimatedEmitter(
                geometries.smallShard,
                iceGlowMaterial,
                new THREE.Vector3((random() - 0.5) * tileSize * 0.36, tileSize * 0.22, (random() - 0.5) * tileSize * 0.36),
                {
                    lightColor: "#dffbff",
                    lightIntensity: hasLight ? 5.4 : 0,
                    lightDistance: tileSize * 9.0,
                    baseScale: 0.32,
                    scaleAmplitude: 0.12,
                    opacityAmplitude: 0.18,
                    verticalAmplitude: tileSize * 0.035,
                    speed: 0.35,
                    pulseSpeed: 0.9,
                    rotationSpeed: 0.34,
                    cloneMaterial: true,
                    lightCastShadow: false,
                    sourceCell: cell,
                    occlusionDistance: 11
                }
            );

            // Make the moving ice-cave accent read as a small crystal instead of a round orb.
            // The point light is still attached inside the emitter, but the visible mesh is now
            // an angular shard with a taller crystal-like silhouette.
            floatingCrystal.scale.y *= 1.75;
            floatingCrystal.rotation.x = random() * Math.PI;
            floatingCrystal.rotation.z = random() * Math.PI;
            accent.add(floatingCrystal);
            return accent;
        }

        return null;
    }

    // Castle sections use pillars and warm braziers.
    function addCastleDecoration(targetGroup, palette, variant, sourceCell)
    {
        const stoneMaterial = getMaterial("castle:stone", {
            color: palette.stone,
            roughness: 0.9,
            metalness: 0.04
        });
        const metalMaterial = getMaterial("castle:metal", {
            color: palette.metal,
            roughness: 0.9,
            metalness: 0.08
        });
        const glowMaterial = getMaterial("castle:glow", {
            materialKind: "basic",
            color: palette.glow,
            toneMapped: false
        });

        targetGroup.add(
            createDecorMesh(
                geometries.plinth,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.1, 0),
                {
                    collidable: true,
                    collisionScale: 0.5,
                    collisionHeightScale: 0.9
                }
            )
        );

        const columnOffsets = variant === "room"
            ? [
                [-tileSize * 0.24, wallHeight * 0.36, -tileSize * 0.24],
                [tileSize * 0.24, wallHeight * 0.36, -tileSize * 0.24],
                [-tileSize * 0.24, wallHeight * 0.36, tileSize * 0.24],
                [tileSize * 0.24, wallHeight * 0.36, tileSize * 0.24]
            ]
            : [[0, wallHeight * 0.28, 0]];

        for (const offset of columnOffsets)
        {
            targetGroup.add(
                createDecorMesh(
                    geometries.column,
                    stoneMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        collidable: true,
                        collisionScale: 0.34
                    }
                )
            );
        }

        targetGroup.add(
            createDecorMesh(
                geometries.orb,
                glowMaterial,
                new THREE.Vector3(0, wallHeight * (variant === "room" ? 0.46 : 0.34), 0),
                {
                    castShadow: false,
                    receiveShadow: false
                }
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.ring,
                metalMaterial,
                new THREE.Vector3(0, tileSize * 0.17, 0),
                {
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor: new THREE.Vector3(0, wallHeight * (variant === "room" ? 0.46 : 0.34), 0)
        };
    }

    // Industrial sections use storage props and colder task lighting.
    function addIndustrialDecoration(targetGroup, palette, variant, sourceCell)
    {
        const cabinetMaterial = getMaterial("industrial:cabinet", {
            color: palette.stone,
            roughness: 0.55,
            metalness: 0.38
        });
        const metalMaterial = getMaterial("industrial:metal", {
            color: palette.metal,
            roughness: 0.96,
            metalness: 0.06
        });
        const glowMaterial = getMaterial("industrial:glow", {
            materialKind: "basic",
            color: palette.glow,
            toneMapped: false
        });

        targetGroup.add(
            createDecorMesh(
                geometries.cabinet,
                cabinetMaterial,
                new THREE.Vector3(0, tileSize * 0.22, 0),
                {
                    collidable: true,
                    collisionScale: 0.46,
                    maxCollisionFootprint: tileSize * 0.5
                }
            )
        );

        const crateOffsets = variant === "room"
            ? [
                [-tileSize * 0.18, tileSize * 0.14, tileSize * 0.18],
                [tileSize * 0.18, tileSize * 0.14, tileSize * 0.14],
                [0, tileSize * 0.42, 0]
            ]
            : [[tileSize * 0.14, tileSize * 0.14, 0]];

        for (const offset of crateOffsets)
        {
            targetGroup.add(
                createDecorMesh(
                    geometries.crate,
                    metalMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        collidable: true,
                        collisionScale: 0.42,
                        maxCollisionFootprint: tileSize * 0.42
                    }
                )
            );
        }

        targetGroup.add(
            createDecorMesh(
                geometries.pipe,
                metalMaterial,
                new THREE.Vector3(-tileSize * 0.2, wallHeight * 0.26, -tileSize * 0.18),
                {
                    collidable: true,
                    collisionScale: 0.28
                }
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.smallOrb,
                glowMaterial,
                new THREE.Vector3(0, wallHeight * 0.5, 0),
                {
                    castShadow: false,
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor: new THREE.Vector3(0, wallHeight * 0.5, 0)
        };
    }

    // Forest-temple sections use altar-like shapes and green crystals.
    function addForestTempleDecoration(targetGroup, palette, variant, sourceCell)
    {
        const stoneMaterial = getMaterial("forestTemple:stone", {
            color: palette.stone,
            roughness: 0.95,
            metalness: 0.02
        });
        const woodMaterial = getMaterial("forestTemple:wood", {
            color: palette.shadow,
            roughness: 0.88,
            metalness: 0.02
        });
        const crystalMaterial = getMaterial("forestTemple:crystal", {
            materialKind: "basic",
            color: "#3dff66",
            toneMapped: false
        });
        const sparkleMaterial = getMaterial("forestTemple:sparkle", {
            materialKind: "basic",
            color: "#48ff71",
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });

        targetGroup.add(
            createDecorMesh(
                geometries.pedestal,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.12, 0),
                {
                    collidable: true,
                    collisionScale: 0.4,
                    collisionHeightScale: 0.84,
                    maxCollisionFootprint: tileSize * 0.42
                }
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.obelisk,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.38, 0),
                {
                    collidable: true,
                    collisionScale: 0.36
                }
            )
        );

        const lightAnchor = new THREE.Vector3(0, tileSize * 0.56, 0);

        const crystalOffsets = variant === "room"
            ? [
                [-tileSize * 0.2, tileSize * 0.2, tileSize * 0.12],
                [tileSize * 0.18, tileSize * 0.16, tileSize * 0.16],
                [0, tileSize * 0.14, -tileSize * 0.2]
            ]
            : [[0, tileSize * 0.18, tileSize * 0.18]];

        for (const offset of crystalOffsets)
        {
            targetGroup.add(
                createDecorMesh(
                    geometries.smallShard,
                    crystalMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        castShadow: false,
                        receiveShadow: false
                    }
                )
            );
        }

        const glowBlobOffsets = variant === "room"
            ? [
                [-tileSize * 0.28, tileSize * 0.24, -tileSize * 0.18],
                [tileSize * 0.26, tileSize * 0.3, -tileSize * 0.08],
                [-tileSize * 0.06, tileSize * 0.34, tileSize * 0.28],
                [tileSize * 0.16, tileSize * 0.22, tileSize * 0.28]
            ]
            : [
                [-tileSize * 0.18, tileSize * 0.25, -tileSize * 0.1],
                [tileSize * 0.16, tileSize * 0.28, tileSize * 0.14]
            ];

        for (const offset of glowBlobOffsets)
        {
            targetGroup.add(
                createAnimatedEmitter(
                    geometries.smallOrb,
                    sparkleMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        lightColor: "#48ff71",
                        lightIntensity: variant === "room" ? 4.6 : 3.3,
                        lightDistance: tileSize * 6.8,
                        baseScale: 0.38,
                        scaleAmplitude: 0.7,
                        opacityAmplitude: 0.92,
                        verticalAmplitude: tileSize * 0.1,
                        speed: 0.95,
                        pulseSpeed: 2.7,
                        rotationSpeed: 0.35,
                        phase: offset[0] * 0.21 + offset[2] * 0.17,
                        cloneMaterial: true,
                        lightCastShadow: true,
                        sourceCell,
                        occlusionDistance: 10
                    }
                )
            );
        }

        targetGroup.add(
            createDecorMesh(
                geometries.beaconCrystal,
                crystalMaterial,
                lightAnchor.clone(),
                {
                    castShadow: false,
                    receiveShadow: false
                }
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.ring,
                woodMaterial,
                new THREE.Vector3(0, tileSize * 0.12, 0),
                {
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor
        };
    }

    // Fire-cave sections use rough rocks plus emissive shards.
    function addFireCaveDecoration(targetGroup, palette, variant, random, sourceCell)
    {
        const rockMaterial = getMaterial("fireCave:rock", {
            color: palette.stone,
            roughness: 0.96,
            metalness: 0.03
        });
        const shardMaterial = getMaterial("fireCave:shard", {
            materialKind: "basic",
            color: "#ff3a10",
            toneMapped: false
        });
        const emberOrbMaterial = getMaterial("fireCave:emberOrb", {
            materialKind: "basic",
            color: "#ff2f00",
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });

        const rockCount = variant === "room" ? 5 : 3;

        for (let index = 0; index < rockCount; index++)
        {
            const rock = createDecorMesh(
                index % 2 === 0 ? geometries.rock : geometries.smallRock,
                rockMaterial,
                new THREE.Vector3(
                    (random() - 0.5) * tileSize * 0.42,
                    tileSize * (index % 2 === 0 ? 0.14 : 0.1),
                    (random() - 0.5) * tileSize * 0.42
                ),
                {
                    collidable: true,
                    collisionScale: 0.42,
                    maxCollisionFootprint: tileSize * 0.46
                }
            );

            rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
            targetGroup.add(rock);
        }

        targetGroup.add(
            createDecorMesh(
                geometries.shard,
                shardMaterial,
                new THREE.Vector3(0, tileSize * 0.28, 0),
                {
                    castShadow: true,
                    receiveShadow: false,
                    collidable: true,
                    collisionScale: 0.34,
                    maxCollisionFootprint: tileSize * 0.34
                }
            )
        );

        const crystalCount = variant === "room" ? 4 : 2;

        for (let index = 0; index < crystalCount; index++)
        {
            const crystal = createDecorMesh(
                geometries.smallShard,
                shardMaterial,
                new THREE.Vector3(
                    (random() - 0.5) * tileSize * 0.5,
                    tileSize * (0.08 + random() * 0.12),
                    (random() - 0.5) * tileSize * 0.5
                ),
                {
                    castShadow: true,
                    receiveShadow: false,
                    collidable: true,
                    collisionScale: 0.26,
                    maxCollisionFootprint: tileSize * 0.24
                }
            );

            crystal.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
            targetGroup.add(crystal);
        }

        const emberOffsets = variant === "room"
            ? [
                [-tileSize * 0.2, tileSize * 0.18, -tileSize * 0.14],
                [tileSize * 0.22, tileSize * 0.2, -tileSize * 0.02],
                [-tileSize * 0.02, tileSize * 0.16, tileSize * 0.22]
            ]
            : [[tileSize * 0.14, tileSize * 0.16, tileSize * 0.1]];

        for (const offset of emberOffsets)
        {
            targetGroup.add(
                createAnimatedEmitter(
                    geometries.smallOrb,
                    emberOrbMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        lightColor: "#ff3a10",
                        lightIntensity: variant === "room" ? 8.8 : 6.6,
                        lightDistance: tileSize * 9.2,
                        baseScale: 0.44,
                        scaleAmplitude: 0.46,
                        opacityAmplitude: 0.55,
                        verticalAmplitude: tileSize * 0.06,
                        speed: 0.65,
                        pulseSpeed: 2.2,
                        rotationSpeed: 0.55,
                        phase: offset[0] * 0.15 + offset[2] * 0.19,
                        cloneMaterial: true,
                        lightCastShadow: true,
                        sourceCell,
                        occlusionDistance: 10
                    }
                )
            );
        }

        return {
            lightAnchor: new THREE.Vector3(0, tileSize * 0.28, 0)
        };
    }

    // Ice-cave sections use cleaner crystal clusters with colder highlights.
    function addIceCaveDecoration(targetGroup, palette, variant, sourceCell)
    {
        const iceMaterial = getMaterial("iceCave:ice", {
            color: palette.stone,
            roughness: 0.26,
            metalness: 0.08
        });
        const crystalMaterial = getMaterial("iceCave:crystal", {
            materialKind: "basic",
            color: "#63dfff",
            toneMapped: false
        });

        targetGroup.add(
            createDecorMesh(
                geometries.pedestal,
                iceMaterial,
                new THREE.Vector3(0, tileSize * 0.11, 0),
                {
                    collidable: true,
                    collisionScale: 0.5,
                    collisionHeightScale: 0.9
                }
            )
        );

        const lightAnchor = new THREE.Vector3(0, tileSize * 0.52, 0);

        // Extra ice spikes were removed. They cluttered the ice map,
        // added unnecessary draw calls, and could cast confusing shadows.

        // Keep only the main beacon crystal on the central stone object.

        targetGroup.add(
            createDecorMesh(
                geometries.beaconCrystal,
                crystalMaterial,
                lightAnchor.clone(),
                {
                    castShadow: false,
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor
        };
    }

    // Creates a decorative cluster for one themed region.
    function createRegionDecoration(region)
    {
        const anchorCell = pickAnchorCell(region);

        if (!anchorCell)
        {
            return null;
        }

        const random = createSeededRandom(region.id * 1103515245 + 12345);
        const themeFamily = inferThemeFamily(region.themeName);
        const palette = getThemePalette(themeFamily);
        const decoration = new THREE.Group();
        const variant = region.kind === "room" ? "room" : "corridor";

        decoration.name = `regionDecor_${region.id}`;
        decoration.position.copy(layout.gridToWorldPosition(anchorCell.x, anchorCell.y, floorY));
        decoration.rotation.y = random() * Math.PI * 2;

        let lightDefinition = null;

        switch (themeFamily)
        {
            case "castle":
                lightDefinition = addCastleDecoration(decoration, palette, variant, anchorCell);
                break;

            case "industrial":
                lightDefinition = addIndustrialDecoration(decoration, palette, variant, anchorCell);
                break;

            case "forestTemple":
                lightDefinition = addForestTempleDecoration(decoration, palette, variant, anchorCell);
                break;

            case "fireCave":
                lightDefinition = addFireCaveDecoration(decoration, palette, variant, random, anchorCell);
                break;

            case "iceCave":
                lightDefinition = addIceCaveDecoration(decoration, palette, variant, anchorCell);
                break;

            default:
                lightDefinition = addCastleDecoration(decoration, palette, variant, anchorCell);
                break;
        }

        const canPlaceRoomLight = variant === "room" && placedRegionLights < maxRegionLights;
        const canPlaceCorridorLight =
            variant === "corridor"
            && placedCorridorLights < maxCorridorLights
            && region.id % 2 === 0;

        if (
            (canPlaceRoomLight || canPlaceCorridorLight)
            && lightDefinition?.lightAnchor
            && countPlacedShadowCastingLights() < maxShadowCastingLights
        )
        {
            const light = createDecorationLight(palette, variant, {
                anchor: lightDefinition.lightAnchor,
                castShadow: true,
                shadowMapSize: variant === "room" ? 1024 : 512,
                occlusionDistance: variant === "room" ? 9 : 7,
                themeFamily,
                sourceCell: anchorCell
            });
            decoration.add(light);

            if (variant === "room")
            {
                placedRegionLights++;
            }
            else
            {
                placedCorridorLights++;
            }
        }

        return decoration;
    }

    // Creates a small landmark for the maze start, goal, and teleport pads.
    function createSpecialLandmark(cell)
    {
        if (!cell)
        {
            return null;
        }

        const landmark = new THREE.Group();
        let lightColor = "#ffffff";
        let emissiveColor = "#ffffff";

        if (cell.special === "start")
        {
            lightColor = "#7dff96";
            emissiveColor = "#58ff75";
        }
        else if (cell.special === "goal")
        {
            lightColor = "#ff8a7a";
            emissiveColor = "#ff5b57";
        }
        else if (cell.teleportId !== null)
        {
            lightColor = "#cf9bff";
            emissiveColor = "#b866ff";
        }
        else
        {
            return null;
        }

        const frameMaterial = getMaterial(`special:frame:${lightColor}`, {
            color: "#f4f4f4",
            roughness: 0.92,
            metalness: 0.04
        });
        const glowMaterial = getMaterial(`special:glow:${emissiveColor}`, {
            materialKind: "basic",
            color: emissiveColor,
            toneMapped: false
        });

        landmark.position.copy(layout.gridToWorldPosition(cell.x, cell.y, floorY));

        const ring = createDecorMesh(
            geometries.ring,
            frameMaterial,
            new THREE.Vector3(0, tileSize * 0.07, 0),
            {
                receiveShadow: false
            }
        );
        ring.rotation.x = Math.PI / 2;

        const crystal = createDecorMesh(
            geometries.beaconCrystal,
            glowMaterial,
            new THREE.Vector3(0, tileSize * 0.22, 0),
            {
                castShadow: false,
                receiveShadow: false
            }
        );

        const light = new THREE.PointLight(lightColor, cell.teleportId !== null ? 8.5 : 6.8, tileSize * 6.2, 1.38);
        light.position.set(0, tileSize * 0.5, 0);
        light.castShadow = countPlacedShadowCastingLights() < maxShadowCastingLights;

        if (light.castShadow)
        {
            light.shadow.mapSize.width = 384;
            light.shadow.mapSize.height = 384;
            light.shadow.bias = -0.00006;
            light.shadow.normalBias = 0.022;
            light.shadow.radius = 2.8;
            light.shadow.camera.near = 0.12;
            light.shadow.camera.far = tileSize * 5.0;
        }

        registerOcclusionTrackedLight(light, cell, {
            baseIntensity: light.intensity,
            wantsShadow: light.castShadow,
            occlusionDistance: 9,
            occludedIntensityMultiplier: 0.035
        });

        landmark.add(ring, crystal, light);
        return landmark;
    }

    function createLavaTileEmbers(cell)
    {
        if (!cell || cell.floorType !== "fireCaveLavaFloor")
        {
            return null;
        }

        const random = createSeededRandom((cell.x + 1) * 73856093 ^ (cell.y + 1) * 19349663);
        const embers = new THREE.Group();
        const emberMaterial = getMaterial("fireCave:lavaTileEmber", {
            materialKind: "basic",
            color: "#ff3a10",
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        });

        embers.name = `lavaEmbers_${cell.x}_${cell.y}`;
        embers.position.copy(layout.gridToWorldPosition(cell.x, cell.y, floorY));

        for (let index = 0; index < 4; index++)
        {
            const emberHasLight = claimAmbientTileLight();
            const ember = createAnimatedEmitter(
                geometries.smallOrb,
                emberMaterial,
                new THREE.Vector3(
                    (random() - 0.5) * tileSize * 0.66,
                    tileSize * (0.055 + random() * 0.07),
                    (random() - 0.5) * tileSize * 0.66
                ),
                {
                    lightColor: "#ff8a1f",
                    lightIntensity: emberHasLight ? 7.4 : 0,
                    lightDistance: tileSize * 8.8,
                    lightCastShadow: true,
                    cloneMaterial: true,
                    sourceCell: cell,
                    occlusionDistance: 10,
                    baseScale: 0.34 + random() * 0.24,
                    scaleAmplitude: 0.52,
                    opacityAmplitude: 0.48,
                    verticalAmplitude: tileSize * 0.055,
                    speed: 0.7 + random() * 0.35,
                    pulseSpeed: 2.1 + random() * 0.6,
                    rotationSpeed: 0.9 + random() * 0.8,
                    phase: random() * Math.PI * 2
                }
            );

            embers.add(ember);
        }

        return embers;
    }

    function collectCollisionEntries()
    {
        const collisionEntries = [];

        group.updateMatrixWorld(true);
        group.traverse((object) =>
        {
            if (!object.isMesh || object.userData.collidable === false)
            {
                return;
            }

            const box = new THREE.Box3().setFromObject(object);

            if (box.isEmpty())
            {
                return;
            }

            const collisionScale = object.userData.collisionScale ?? 1;
            const collisionHeightScale = object.userData.collisionHeightScale ?? 1;

            if (collisionScale < 1 || collisionHeightScale < 1)
            {
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                size.x *= collisionScale;
                size.z *= collisionScale;
                size.y *= collisionHeightScale;
                center.y = box.min.y + size.y / 2;
                box.setFromCenterAndSize(center, size);
            }

            const maxCollisionFootprint = object.userData.maxCollisionFootprint ?? (tileSize * 0.54);

            if (Number.isFinite(maxCollisionFootprint) && maxCollisionFootprint > 0)
            {
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                size.x = Math.min(size.x, maxCollisionFootprint);
                size.z = Math.min(size.z, maxCollisionFootprint);
                box.setFromCenterAndSize(center, size);
            }

            collisionEntries.push({
                box,
                type: object.userData.collisionType ?? "decor",
                object
            });
        });

        updateOcclusionTrackedLights(true);

        return collisionEntries;
    }

    const regions = collectRegions();

    // Adds one decoration cluster to each significant region.
    for (const region of regions)
    {
        if (!shouldDecorateRegion(region))
        {
            continue;
        }

        const decoration = createRegionDecoration(region);

        if (decoration)
        {
            group.add(decoration);
        }
    }

    // Special gameplay tiles also get a small visual landmark.
    for (let y = 0; y < maze.height; y++)
    {
        for (let x = 0; x < maze.width; x++)
        {
            const cell = maze.cells[y][x];

            if (cell.type !== "floor")
            {
                continue;
            }

            const landmark = createSpecialLandmark(cell);

            if (landmark)
            {
                group.add(landmark);
            }

            const themeTileAccent = createThemeTileAccent(cell);

            if (themeTileAccent)
            {
                group.add(themeTileAccent);
            }

            const ambientTileEffect = createLavaTileEmbers(cell);

            if (ambientTileEffect)
            {
                group.add(ambientTileEffect);
            }
        }
    }


    function createSoftShadowTexture()
    {
        const canvas = document.createElement("canvas");
        const size = 128;
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");
        const center = size / 2;
        const gradient = ctx.createRadialGradient(center, center, 2, center, center, center);

        gradient.addColorStop(0.0, "rgba(0, 0, 0, 0.72)");
        gradient.addColorStop(0.34, "rgba(0, 0, 0, 0.36)");
        gradient.addColorStop(0.68, "rgba(0, 0, 0, 0.12)");
        gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function getStaticShadowMaterial()
    {
        if (!materialCache.has("staticSoftShadow:floor"))
        {
            materialCache.set(
                "staticSoftShadow:floor",
                new THREE.MeshBasicMaterial({
                    map: createSoftShadowTexture(),
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.46,
                    depthWrite: false,
                    depthTest: true,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2,
                    blending: THREE.NormalBlending,
                    toneMapped: false
                })
            );
        }

        return materialCache.get("staticSoftShadow:floor");
    }

    function isStaticSoftShadowCaster(object)
    {
        if (!object?.isMesh)
        {
            return false;
        }

        if (object.userData.staticShadowCaster === false)
        {
            return false;
        }

        if (object.userData.collidable)
        {
            return true;
        }

        return object.castShadow === true && object.material?.transparent !== true;
    }

    function collectStaticLightPositions()
    {
        const lights = [];
        const lightPosition = new THREE.Vector3();

        group.updateMatrixWorld(true);
        group.traverse((object) =>
        {
            if (!object.isLight || object.intensity <= 0)
            {
                return;
            }

            object.getWorldPosition(lightPosition);
            lights.push({
                position: lightPosition.clone(),
                distance: object.distance || tileSize * 10,
                intensity: object.userData.baseIntensity ?? object.intensity
            });
        });

        return lights;
    }

    function findNearestShadowLight(casterPosition, lights)
    {
        let bestLight = null;
        let bestScore = Infinity;

        for (const light of lights)
        {
            const distanceSq = casterPosition.distanceToSquared(light.position);
            const maxDistance = Math.max(light.distance, tileSize * 4.5);

            if (distanceSq > maxDistance * maxDistance)
            {
                continue;
            }

            const score = distanceSq / Math.max(light.intensity, 0.001);

            if (score < bestScore)
            {
                bestScore = score;
                bestLight = light;
            }
        }

        return bestLight;
    }

    function addPreRenderedSoftShadows()
    {
        const lights = collectStaticLightPositions();

        if (lights.length === 0)
        {
            return;
        }

        const material = getStaticShadowMaterial();
        const casterPosition = new THREE.Vector3();
        const lightDirection = new THREE.Vector3();
        const casterBox = new THREE.Box3();
        const casterSize = new THREE.Vector3();
        const staticShadowGroup = new THREE.Group();
        const maxStaticShadows = 90;
        let placedStaticShadows = 0;

        staticShadowGroup.name = "preRenderedSoftShadowDecals";

        group.updateMatrixWorld(true);
        group.traverse((object) =>
        {
            if (placedStaticShadows >= maxStaticShadows || !isStaticSoftShadowCaster(object))
            {
                return;
            }

            object.getWorldPosition(casterPosition);

            if (casterPosition.y <= floorY + tileSize * 0.03)
            {
                return;
            }

            const nearestLight = findNearestShadowLight(casterPosition, lights);

            if (!nearestLight)
            {
                return;
            }

            lightDirection.copy(casterPosition).sub(nearestLight.position);
            lightDirection.y = 0;

            if (lightDirection.lengthSq() < 0.0001)
            {
                lightDirection.set(0, 0, 1);
            }
            else
            {
                lightDirection.normalize();
            }

            casterBox.setFromObject(object);
            casterBox.getSize(casterSize);

            const horizontalSize = Math.max(casterSize.x, casterSize.z, tileSize * 0.16);
            const verticalLift = Math.max(0, casterPosition.y - floorY);
            const shadowLength = THREE.MathUtils.clamp(
                horizontalSize * 1.2 + verticalLift * 0.32,
                tileSize * 0.32,
                tileSize * 1.35
            );
            const shadowWidth = THREE.MathUtils.clamp(
                horizontalSize * 1.1,
                tileSize * 0.24,
                tileSize * 0.95
            );
            const offsetDistance = THREE.MathUtils.clamp(
                shadowLength * 0.24,
                tileSize * 0.08,
                tileSize * 0.42
            );

            const shadow = new THREE.Mesh(geometries.softShadowPlane, material);
            shadow.name = "preRenderedSoftShadow";
            shadow.position.set(
                casterPosition.x + lightDirection.x * offsetDistance,
                floorY + 0.045 + placedStaticShadows * 0.00003,
                casterPosition.z + lightDirection.z * offsetDistance
            );
            shadow.rotation.x = -Math.PI / 2;
            shadow.rotation.z = Math.atan2(lightDirection.z, lightDirection.x) - Math.PI / 2;
            shadow.scale.set(shadowWidth, shadowLength, 1);
            shadow.renderOrder = 2;
            shadow.frustumCulled = true;
            shadow.castShadow = false;
            shadow.receiveShadow = false;
            shadow.userData.collidable = false;
            shadow.userData.staticShadowCaster = false;

            staticShadowGroup.add(shadow);
            placedStaticShadows++;
        });

        if (staticShadowGroup.children.length > 0)
        {
            group.add(staticShadowGroup);
        }
    }

    function getWallContactShadowMaterial()
    {
        if (!materialCache.has("staticSoftShadow:wallContact"))
        {
            const material = getStaticShadowMaterial().clone();
            material.opacity = 0.38;
            material.depthWrite = false;
            material.polygonOffset = true;
            material.polygonOffsetFactor = -3;
            material.polygonOffsetUnits = -3;
            material.needsUpdate = true;
            materialCache.set("staticSoftShadow:wallContact", material);
        }

        return materialCache.get("staticSoftShadow:wallContact");
    }

    function addWallContactSoftShadows()
    {
        const material = getWallContactShadowMaterial();
        const wallShadowGroup = new THREE.Group();
        const edgeOffset = tileSize * 0.43;
        const longScale = tileSize * 1.02;
        const thinScale = tileSize * 0.30;
        const shadowY = floorY + 0.052;
        let placed = 0;
        const maxWallContactShadows = 320;

        wallShadowGroup.name = "wallContactSoftShadowDecals";

        function addEdgeShadow(centerX, centerZ, rotationZ)
        {
            if (placed >= maxWallContactShadows)
            {
                return;
            }

            const shadow = new THREE.Mesh(geometries.softShadowPlane, material);
            shadow.name = "wallContactSoftShadow";
            shadow.position.set(centerX, shadowY + placed * 0.00002, centerZ);
            shadow.rotation.x = -Math.PI / 2;
            shadow.rotation.z = rotationZ;
            shadow.scale.set(longScale, thinScale, 1);
            shadow.renderOrder = 1.8;
            shadow.frustumCulled = true;
            shadow.castShadow = false;
            shadow.receiveShadow = false;
            shadow.userData.collidable = false;
            shadow.userData.staticShadowCaster = false;
            wallShadowGroup.add(shadow);
            placed++;
        }

        for (let yIndex = 0; yIndex < maze.height; yIndex++)
        {
            for (let xIndex = 0; xIndex < maze.width; xIndex++)
            {
                const cell = maze.cells[yIndex][xIndex];

                if (cell.type !== "floor")
                {
                    continue;
                }

                const center = layout.gridToWorldPosition(xIndex, yIndex, floorY);

                if (layout.getCell(xIndex, yIndex - 1)?.type === "wall")
                {
                    addEdgeShadow(center.x, center.z - edgeOffset, 0);
                }

                if (layout.getCell(xIndex, yIndex + 1)?.type === "wall")
                {
                    addEdgeShadow(center.x, center.z + edgeOffset, 0);
                }

                if (layout.getCell(xIndex - 1, yIndex)?.type === "wall")
                {
                    addEdgeShadow(center.x - edgeOffset, center.z, Math.PI / 2);
                }

                if (layout.getCell(xIndex + 1, yIndex)?.type === "wall")
                {
                    addEdgeShadow(center.x + edgeOffset, center.z, Math.PI / 2);
                }
            }
        }

        if (wallShadowGroup.children.length > 0)
        {
            group.add(wallShadowGroup);
        }
    }

    addPreRenderedSoftShadows();
    addWallContactSoftShadows();

    const collisionEntries = collectCollisionEntries();

    group.tick = (delta) =>
    {
        updateOcclusionTrackedLights();
        applyOcclusionLightSmoothing(delta);

        for (const emitter of animatedEmitters)
        {
            if (emitter.visible !== false)
            {
                emitter.userData.updateEmitter?.(delta);
            }
        }
    };

    return {
        group,
        collisionEntries,
        trackPlayer(playerController)
        {
            trackedPlayerController = playerController ?? null;
            lastOcclusionPlayerCellKey = null;
            lightVisibilityCache.clear();
            updateOcclusionTrackedLights(true);
        },
        dispose()
        {
            if (group.parent)
            {
                group.parent.remove(group);
            }

            for (const geometry of geometrySet)
            {
                geometry.dispose();
            }

            for (const material of materialCache.values())
            {
                material.dispose();
            }
        }
    };
}
