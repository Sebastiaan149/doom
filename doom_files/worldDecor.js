// This file adds theme-specific props and local lights on top of the base maze geometry.
// Decorations are intentionally non-colliding for now so the visual layer can evolve
// independently from player movement and collision.

// Builds the decorative object layer that makes maze sections visually distinct.
function createMazeWorldDecorations(maze, layout, options = {})
{
    const tileSize = layout.tileSize;
    const wallHeight = layout.wallHeight;
    const floorY = layout.floorY;
    const maxRegionLights = options.maxRegionLights ?? 6;
    const maxCorridorLights = options.maxCorridorLights ?? 4;
    const maxShadowCastingLights = options.maxShadowCastingLights ?? 3;

    const group = new THREE.Group();
    group.name = "mazeDecorations";

    const materialCache = new Map();
    const geometrySet = new Set();
    let placedRegionLights = 0;
    let placedCorridorLights = 0;
    let placedShadowCastingLights = 0;

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
        beaconCrystal: registerGeometry(new THREE.OctahedronGeometry(tileSize * 0.12, 0))
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
                    stone: "#8a7c6a",
                    metal: "#5f5a54",
                    accent: "#d9bf78",
                    glow: "#ffb95a",
                    light: "#ffd28a",
                    shadow: "#3d342d"
                };

            case "industrial":
                return {
                    stone: "#738089",
                    metal: "#aeb8c1",
                    accent: "#e6d47b",
                    glow: "#93e9ff",
                    light: "#95e6ff",
                    shadow: "#2c3136"
                };

            case "forestTemple":
                return {
                    stone: "#7d8867",
                    metal: "#5d4a31",
                    accent: "#d4dd90",
                    glow: "#79ff92",
                    light: "#8cffab",
                    shadow: "#334027"
                };

            case "fireCave":
                return {
                    stone: "#5a4740",
                    metal: "#846a5b",
                    accent: "#ff9750",
                    glow: "#ff7c38",
                    light: "#ffa15f",
                    shadow: "#241714"
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
            materialCache.set(key, new THREE.MeshStandardMaterial(parameters));
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

        mesh.position.copy(position);
        mesh.castShadow = options.castShadow ?? true;
        mesh.receiveShadow = options.receiveShadow ?? true;

        return mesh;
    }

    // Adds a theme-colored point light at the same place as the visible emissive prop.
    function createDecorationLight(palette, variant, options = {})
    {
        const light = new THREE.PointLight(
            palette.light,
            variant === "room" ? 3.1 : 2,
            tileSize * (variant === "room" ? 8.6 : 6.4),
            1.2
        );

        light.position.copy(options.anchor ?? new THREE.Vector3(0, wallHeight * 0.46, 0));
        light.castShadow = options.castShadow ?? false;

        if (light.castShadow)
        {
            light.shadow.mapSize.width = 512;
            light.shadow.mapSize.height = 512;
            light.shadow.bias = -0.0008;
            light.shadow.radius = 4;
            light.shadow.camera.near = 0.2;
            light.shadow.camera.far = tileSize * 7;
        }

        return light;
    }

    // Castle sections use pillars and warm braziers.
    function addCastleDecoration(targetGroup, palette, variant)
    {
        const stoneMaterial = getMaterial("castle:stone", {
            color: palette.stone,
            roughness: 0.9,
            metalness: 0.04
        });
        const metalMaterial = getMaterial("castle:metal", {
            color: palette.metal,
            roughness: 0.58,
            metalness: 0.5
        });
        const glowMaterial = getMaterial("castle:glow", {
            color: palette.accent,
            emissive: palette.glow,
            emissiveIntensity: 0.85,
            roughness: 0.34,
            metalness: 0.15
        });

        targetGroup.add(
            createDecorMesh(
                geometries.plinth,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.1, 0)
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
                    new THREE.Vector3(offset[0], offset[1], offset[2])
                )
            );
        }

        targetGroup.add(
            createDecorMesh(
                geometries.orb,
                glowMaterial,
                new THREE.Vector3(0, wallHeight * (variant === "room" ? 0.46 : 0.34), 0),
                {
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
    function addIndustrialDecoration(targetGroup, palette, variant)
    {
        const cabinetMaterial = getMaterial("industrial:cabinet", {
            color: palette.stone,
            roughness: 0.55,
            metalness: 0.38
        });
        const metalMaterial = getMaterial("industrial:metal", {
            color: palette.metal,
            roughness: 0.36,
            metalness: 0.74
        });
        const glowMaterial = getMaterial("industrial:glow", {
            color: palette.accent,
            emissive: palette.glow,
            emissiveIntensity: 0.95,
            roughness: 0.22,
            metalness: 0.18
        });

        targetGroup.add(
            createDecorMesh(
                geometries.cabinet,
                cabinetMaterial,
                new THREE.Vector3(0, tileSize * 0.22, 0)
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
                    new THREE.Vector3(offset[0], offset[1], offset[2])
                )
            );
        }

        targetGroup.add(
            createDecorMesh(
                geometries.pipe,
                metalMaterial,
                new THREE.Vector3(-tileSize * 0.2, wallHeight * 0.26, -tileSize * 0.18)
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.smallOrb,
                glowMaterial,
                new THREE.Vector3(0, wallHeight * 0.5, 0),
                {
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor: new THREE.Vector3(0, wallHeight * 0.5, 0)
        };
    }

    // Forest-temple sections use altar-like shapes and green crystals.
    function addForestTempleDecoration(targetGroup, palette, variant)
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
            color: palette.accent,
            emissive: palette.glow,
            emissiveIntensity: 0.82,
            roughness: 0.22,
            metalness: 0.08
        });

        targetGroup.add(
            createDecorMesh(
                geometries.pedestal,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.12, 0)
            )
        );

        targetGroup.add(
            createDecorMesh(
                geometries.obelisk,
                stoneMaterial,
                new THREE.Vector3(0, tileSize * 0.38, 0)
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
                        receiveShadow: false
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
    function addFireCaveDecoration(targetGroup, palette, variant, random)
    {
        const rockMaterial = getMaterial("fireCave:rock", {
            color: palette.stone,
            roughness: 0.96,
            metalness: 0.03
        });
        const shardMaterial = getMaterial("fireCave:shard", {
            color: palette.accent,
            emissive: palette.glow,
            emissiveIntensity: 1.05,
            roughness: 0.28,
            metalness: 0.08
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
                )
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
                    receiveShadow: false
                }
            )
        );

        return {
            lightAnchor: new THREE.Vector3(0, tileSize * 0.28, 0)
        };
    }

    // Ice-cave sections use cleaner crystal clusters with colder highlights.
    function addIceCaveDecoration(targetGroup, palette, variant)
    {
        const iceMaterial = getMaterial("iceCave:ice", {
            color: palette.stone,
            roughness: 0.26,
            metalness: 0.08
        });
        const crystalMaterial = getMaterial("iceCave:crystal", {
            color: palette.accent,
            emissive: palette.glow,
            emissiveIntensity: 0.92,
            roughness: 0.14,
            metalness: 0.04
        });

        targetGroup.add(
            createDecorMesh(
                geometries.pedestal,
                iceMaterial,
                new THREE.Vector3(0, tileSize * 0.11, 0)
            )
        );

        const lightAnchor = new THREE.Vector3(0, tileSize * 0.52, 0);

        const spikeOffsets = variant === "room"
            ? [
                [-tileSize * 0.14, tileSize * 0.32, -tileSize * 0.08],
                [tileSize * 0.12, tileSize * 0.28, tileSize * 0.12],
                [0, tileSize * 0.38, 0],
                [tileSize * 0.2, tileSize * 0.24, -tileSize * 0.16]
            ]
            : [[0, tileSize * 0.32, 0], [tileSize * 0.14, tileSize * 0.24, tileSize * 0.1]];

        for (const offset of spikeOffsets)
        {
            targetGroup.add(
                createDecorMesh(
                    geometries.crystalSpike,
                    crystalMaterial,
                    new THREE.Vector3(offset[0], offset[1], offset[2]),
                    {
                        receiveShadow: false
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
                lightDefinition = addCastleDecoration(decoration, palette, variant);
                break;

            case "industrial":
                lightDefinition = addIndustrialDecoration(decoration, palette, variant);
                break;

            case "forestTemple":
                lightDefinition = addForestTempleDecoration(decoration, palette, variant);
                break;

            case "fireCave":
                lightDefinition = addFireCaveDecoration(decoration, palette, variant, random);
                break;

            case "iceCave":
                lightDefinition = addIceCaveDecoration(decoration, palette, variant);
                break;

            default:
                lightDefinition = addCastleDecoration(decoration, palette, variant);
                break;
        }

        const canPlaceRoomLight = variant === "room" && placedRegionLights < maxRegionLights;
        const canPlaceCorridorLight =
            variant === "corridor"
            && placedCorridorLights < maxCorridorLights
            && region.id % 2 === 0;

        if ((canPlaceRoomLight || canPlaceCorridorLight) && lightDefinition?.lightAnchor)
        {
            const castShadow = variant === "room" && placedShadowCastingLights < maxShadowCastingLights;
            const light = createDecorationLight(palette, variant, {
                anchor: lightDefinition.lightAnchor,
                castShadow
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

            if (castShadow)
            {
                placedShadowCastingLights++;
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
            roughness: 0.34,
            metalness: 0.42
        });
        const glowMaterial = getMaterial(`special:glow:${emissiveColor}`, {
            color: "#ffffff",
            emissive: emissiveColor,
            emissiveIntensity: 1,
            roughness: 0.2,
            metalness: 0.08
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
                receiveShadow: false
            }
        );

        const light = new THREE.PointLight(lightColor, 1.8, tileSize * 4.8, 1.2);
        light.position.set(0, tileSize * 0.5, 0);
        light.castShadow = cell.special === "start" || cell.special === "goal";

        if (light.castShadow)
        {
            light.shadow.mapSize.width = 512;
            light.shadow.mapSize.height = 512;
            light.shadow.bias = -0.0008;
            light.shadow.radius = 4;
            light.shadow.camera.near = 0.2;
            light.shadow.camera.far = tileSize * 4.8;
        }

        landmark.add(ring, crystal, light);
        return landmark;
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
        }
    }

    return {
        group,
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
