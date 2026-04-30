// This file contains the descriptive "style recipes" used by the material system.
// It keeps theme decisions separate from texture painting and material instancing.

// Maps a wall/floor/theme identifier back to its broader theme family.
function inferSurfaceFamily(identifier = "")
{
    const normalizedIdentifier = String(identifier).toLowerCase();

    if (
        normalizedIdentifier.includes("foresttemple") ||
        normalizedIdentifier.includes("oldforesttemple")
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

    if (
        normalizedIdentifier.includes("teleportpad") ||
        normalizedIdentifier.includes("startpad") ||
        normalizedIdentifier.includes("goalpad")
    )
    {
        return "special";
    }

    if (normalizedIdentifier.includes("void") || normalizedIdentifier === "rock")
    {
        return "void";
    }

    return "neutral";
}

function createWallTextureMaps(folderName, fileBaseName, options = {})
{
    const rootPath = `./assets/textures/wall/${folderName}/${fileBaseName}`;
    const maps = {
        map: `${rootPath}_${options.colorSuffix ?? "diffuse"}.${options.colorExtension ?? "jpg"}`,
        normalMap: `${rootPath}_normal.${options.normalExtension ?? "jpg"}`,
        aoMap: `${rootPath}_ao.${options.aoExtension ?? "jpg"}`
    };

    if (options.roughnessSuffix !== null)
    {
        maps.roughnessMap = `${rootPath}_${options.roughnessSuffix ?? "rough"}.${options.roughnessExtension ?? "jpg"}`;
    }

    if (options.displacementSuffix !== null)
    {
        maps.displacementMap = `${rootPath}_${options.displacementSuffix ?? "displacement"}.${options.displacementExtension ?? "jpg"}`;
    }

    if (options.metalnessSuffix)
    {
        maps.metalnessMap = `${rootPath}_${options.metalnessSuffix}.${options.metalnessExtension ?? "jpg"}`;
    }

    if (options.specularSuffix)
    {
        maps.specularMap = `${rootPath}_${options.specularSuffix}.${options.specularExtension ?? "jpg"}`;
    }

    return maps;
}

function createFloorTextureMaps(folderName, fileBaseName, options = {})
{
    const rootPath = `./assets/textures/floor/${folderName}/${fileBaseName}`;
    const maps = {
        map: `${rootPath}_${options.colorSuffix ?? "diffuse"}.${options.colorExtension ?? "jpg"}`,
        normalMap: `${rootPath}_normal.${options.normalExtension ?? "jpg"}`,
        aoMap: `${rootPath}_ao.${options.aoExtension ?? "jpg"}`
    };

    if (options.roughnessSuffix !== null)
    {
        maps.roughnessMap = `${rootPath}_${options.roughnessSuffix ?? "rough"}.${options.roughnessExtension ?? "jpg"}`;
    }

    if (options.displacementSuffix !== null)
    {
        maps.displacementMap = `${rootPath}_${options.displacementSuffix ?? "displacement"}.${options.displacementExtension ?? "jpg"}`;
    }

    if (options.metalnessSuffix)
    {
        maps.metalnessMap = `${rootPath}_${options.metalnessSuffix}.${options.metalnessExtension ?? "jpg"}`;
    }

    if (options.bumpSuffix)
    {
        maps.bumpMap = `${rootPath}_${options.bumpSuffix}.${options.bumpExtension ?? "jpg"}`;
    }

    if (options.emissiveSuffix)
    {
        maps.emissiveMap = `${rootPath}_${options.emissiveSuffix}.${options.emissiveExtension ?? "jpg"}`;
    }

    if (options.specularSuffix)
    {
        maps.specularMap = `${rootPath}_${options.specularSuffix}.${options.specularExtension ?? "jpg"}`;
    }

    return maps;
}

const WALL_TEXTURE_DESCRIPTORS = {
    castlebrickwall: {
        textureMaps: createWallTextureMaps("castleBrickWall", "castleBrickWall"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.85,
        metalness: 0.03,
        normalScale: 1.2,
        bumpScale: 0,
        aoMapIntensity: 1.2,
        displacementScale: 0.065,
        displacementBias: -0.0325,
        displacementEdgeFadeDistance: 0.11,
        displacementCornerFadePower: 1.5
    },
    castlestonewall: {
        textureMaps: createWallTextureMaps("castleStoneWall", "castleStoneWall"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.9,
        metalness: 0.02,
        normalScale: 1.15,
        bumpScale: 0,
        aoMapIntensity: 1.25,
        displacementScale: 0.055,
        displacementBias: -0.0275
    },
    industrialdarkmetalwall: {
        textureMaps: createWallTextureMaps("industrialDarkMetalWall", "industrialDarkMetalWall", {
            metalnessSuffix: "metal",
            specularSuffix: "spec"
        }),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.96,
        metalness: 0.04,
        normalScale: 1.1,
        bumpScale: 0,
        aoMapIntensity: 1.15,
        displacementScale: 0.025,
        displacementBias: -0.0125
    },
    industrialpanelwall: {
        textureMaps: createWallTextureMaps("industrialPanelWall", "industrialPanelWall"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.94,
        metalness: 0.04,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.15,
        displacementScale: 0.035,
        displacementBias: -0.0175,
        // lower brightness
        color: "#313334"
    },
    industrialconcretewall: {
        textureMaps: createWallTextureMaps("industrialConcreteWall", "industrialConcreteWall"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.92,
        metalness: 0.04,
        normalScale: 1.1,
        bumpScale: 0,
        aoMapIntensity: 1.2,
        displacementScale: 0.045,
        displacementBias: -0.0225
    },
    foresttemplemosswall: {
        textureMaps: createWallTextureMaps("forestTempleMossWall", "forestTempleMossWall"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.95,
        metalness: 0.01,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.25,
        displacementScale: 0.045,
        displacementBias: -0.0225
    },
    foresttemplerootwall: {
        textureMaps: createWallTextureMaps("forestTempleRootWall", "forestTempleRootWall", {
            colorSuffix: "baseColor",
            displacementSuffix: "height",
            displacementExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.9,
        metalness: 0.01,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.2,
        displacementScale: 0.06,
        displacementBias: -0.03
    },
    firecavebasaltwall: {
        textureMaps: createWallTextureMaps("fireCaveBasaltWall", "fireCaveBasaltWall", {
            colorExtension: "png",
            normalExtension: "png",
            aoExtension: "png",
            roughnessSuffix: null,
            displacementExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#3f3935",
        // Dry basalt should read matte/rocky, not wet or glossy.
        roughness: 0.85,
        metalness: 0.2,
        envMapIntensity: 0,
        normalScale: 0.95,
        bumpScale: 0,
        aoMapIntensity: 1.25,
        displacementScale: 0.048,
        displacementBias: -0.024
    },
    firecaveobsidianwall: {
        textureMaps: createWallTextureMaps("fireCaveObsidianWall", "fireCaveObsidianWall", {
            colorSuffix: "baseColor",
            colorExtension: "png",
            normalExtension: "png",
            aoExtension: "png",
            roughnessExtension: "png",
            displacementSuffix: "height",
            displacementExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,

        // more shiny
        roughness: 0.94,
        metalness: 0.01,

        // surface detail
        normalScale: 1.3,
        bumpScale: 0,
        aoMapIntensity: 0.02,
        displacementScale: 0.035,
        displacementBias: -0.0175,

        // lighter base color to contrast with emissive lava details
        color: "#ffffff"
    },
    icecaveblueicewall: {
        textureMaps: createWallTextureMaps("iceCaveBlueIceWall", "iceCaveBlueIceWall", {
            colorSuffix: "baseColor",
            displacementExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#e7fbff",
        roughness: 0.28,
        metalness: 0.08,
        normalScale: 1.22,
        bumpScale: 0,
        aoMapIntensity: 1.05,
        displacementScale: 0.035,
        displacementBias: -0.0175
    },
    icecavecrystalwall: {
        textureMaps: createWallTextureMaps("iceCaveCrystalWall", "iceCaveCrystalWall", {
            colorSuffix: "baseColor",
            roughnessSuffix: null,
            displacementExtension: "png",
            specularSuffix: "spec"
        }),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.22,
        metalness: 0.1,
        normalScale: 1.18,
        bumpScale: 0,
        aoMapIntensity: 1.05,
        displacementScale: 0.04,
        displacementBias: -0.02
    }
};

const FLOOR_TEXTURE_DESCRIPTORS = {
    castlecrackedtile: {
        textureMaps: createFloorTextureMaps("castleCrackedTile", "castleCrackedTile"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.88,
        metalness: 0.02,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.22,
        displacementScale: 0.035,
        displacementBias: -0.0175
    },
    castlestonefloor: {
        textureMaps: createFloorTextureMaps("castleStoneFloor", "castleStoneFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.9,
        metalness: 0.02,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.2,
        displacementScale: 0.032,
        displacementBias: -0.016
    },
    castletilefloor: {
        textureMaps: createFloorTextureMaps("castleTileFloor", "castleTileFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.84,
        metalness: 0.03,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.18,
        displacementScale: 0.03,
        displacementBias: -0.015
    },
    industrialmetalfloor: {
        textureMaps: createFloorTextureMaps("industrialMetalFloor", "industrialMetalFloor", {
            metalnessSuffix: "metal"
        }),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.94,
        metalness: 0.04,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.12,
        displacementScale: 0.02,
        displacementBias: -0.01
    },
    industrialgratefloor: {
        textureMaps: createFloorTextureMaps("industrialGrateFloor", "industrialGrateFloor", {
            metalnessSuffix: "metal"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#3b2d2b",
        roughness: 0.96,
        metalness: 0.03,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.15,
        displacementScale: 0.025,
        displacementBias: -0.0125
    },
    industrialconcretefloor: {
        textureMaps: createFloorTextureMaps("industrialConcreteFloor", "industrialConcreteFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.92,
        metalness: 0.04,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.2,
        displacementScale: 0.028,
        displacementBias: -0.014
    },
    industrialdarktilefloor: {
        textureMaps: createFloorTextureMaps("industrialDarkTileFloor", "industrialDarkTileFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.94,
        metalness: 0.04,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.16,
        displacementScale: 0.022,
        displacementBias: -0.011
    },
    foresttemplemossfloor: {
        textureMaps: createFloorTextureMaps("forestTempleMossFloor", "forestTempleMossFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.96,
        metalness: 0.01,
        normalScale: 1,
        bumpScale: 0,
        aoMapIntensity: 1.26,
        displacementScale: 0.035,
        displacementBias: -0.0175
    },
    foresttemplerockfloor: {
        textureMaps: createFloorTextureMaps("forestTempleRockFloor", "forestTempleRockFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.93,
        metalness: 0.02,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.22,
        displacementScale: 0.04,
        displacementBias: -0.02
    },
    foresttemplestonefloor: {
        textureMaps: createFloorTextureMaps("forestTempleStoneFloor", "forestTempleStoneFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.9,
        metalness: 0.02,
        normalScale: 1.05,
        bumpScale: 0,
        aoMapIntensity: 1.22,
        displacementScale: 0.032,
        displacementBias: -0.016
    },
    firecavestonefloor: {
        textureMaps: createFloorTextureMaps("fireCaveStoneFloor", "fireCaveStoneFloor"),
        repeatX: 1,
        repeatY: 1,
        roughness: 0.88,
        metalness: 0.04,
        normalScale: 1.15,
        bumpScale: 0,
        aoMapIntensity: 1.18,
        displacementScale: 0.042,
        displacementBias: -0.021
    },
    firecavescorchfloor: {
        textureMaps: createFloorTextureMaps("fireCaveScorchFloor", "fireCaveScorchFloor", {
            colorSuffix: "baseColor",
            colorExtension: "png",
            normalExtension: "png",
            aoExtension: "png",
            roughnessSuffix: null,
            displacementExtension: "png",
            specularSuffix: "spec",
            specularExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#ffffff",
        roughness: 0.82,
        metalness: 0.03,
        normalScale: 1.15,
        bumpScale: 0,
        aoMapIntensity: 1.16,
        displacementScale: 0.038,
        displacementBias: -0.019
    },
    firecavelavafloor: {
        textureMaps: createFloorTextureMaps("fireCaveLavaFloor", "fireCaveLavaFloor", {
            colorSuffix: "baseColor",
            displacementSuffix: "height",
            displacementExtension: "png",
            emissiveSuffix: "emissive"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#ffffff",
        roughness: 0.92,
        metalness: 0,
        normalScale: 1.1,
        bumpScale: 0,
        aoMapIntensity: 1,
        displacementScale: 0.05,
        displacementBias: -0.025,
        emissive: "#ff6a1e",
        emissiveIntensity: 1.05
    },
    icecavefrostfloor: {
        textureMaps: createFloorTextureMaps("iceCaveFrostFloor", "iceCaveFrostFloor", {
            colorSuffix: "baseColor",
            displacementExtension: "png"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#f5fdff",
        roughness: 0.3,
        metalness: 0.06,
        normalScale: 1.18,
        bumpScale: 0,
        aoMapIntensity: 1.08,
        displacementScale: 0.025,
        displacementBias: -0.0125
    },
    icecavesnowfloor: {
        textureMaps: createFloorTextureMaps("iceCaveSnowFloor", "iceCaveSnowFloor", {
            bumpSuffix: "bump",
            specularSuffix: "spec"
        }),
        repeatX: 1,
        repeatY: 1,
        color: "#ffffff",
        roughness: 0.36,
        metalness: 0.03,
        normalScale: 1.08,
        bumpScale: 0.055,
        aoMapIntensity: 1.08,
        displacementScale: 0.024,
        displacementBias: -0.012
    }
};

function applyWallTextureDescriptor(descriptor, normalizedKey)
{
    const textureDescriptor = WALL_TEXTURE_DESCRIPTORS[normalizedKey];

    if (!textureDescriptor)
    {
        return;
    }

    Object.assign(descriptor, textureDescriptor);

    descriptor.displacementEdgeFadeDistance ??= 0.11;
    descriptor.displacementCornerFadePower ??= 1.45;
}

function applyFloorTextureDescriptor(descriptor, normalizedKey)
{
    const textureDescriptor = FLOOR_TEXTURE_DESCRIPTORS[normalizedKey];

    if (!textureDescriptor)
    {
        return;
    }

    Object.assign(descriptor, textureDescriptor);

    descriptor.displacementEdgeFadeDistance ??= 0.10;
    descriptor.displacementCornerFadePower ??= 1.25;
}

// Creates the recipe that describes how one surface should look and feel.
function createSurfaceDescriptor(surfaceKind, key)
{
    const normalizedKey = String(key ?? "").toLowerCase();
    const family = inferSurfaceFamily(normalizedKey);
    const descriptor = {
        key: String(key ?? "neutral"),
        family,
        surfaceKind,
        pattern: surfaceKind === "wall" ? "stone" : "tile",
        baseColor: "#7c7f82",
        secondaryColor: "#93979b",
        lineColor: "#45484d",
        accentColor: "#d9c47b",
        repeatX: surfaceKind === "wall" ? 1.15 : 2.4,
        repeatY: surfaceKind === "wall" ? 1.8 : 2.4,
        roughness: 0.88,
        metalness: 0.08,
        bumpScale: surfaceKind === "wall" ? 0.18 : 0.1,
        emissive: "#000000",
        emissiveIntensity: 1,
        effects: []
    };

    if (normalizedKey === "startpad")
    {
        descriptor.pattern = "pad";
        descriptor.baseColor = "#1d7a24";
        descriptor.secondaryColor = "#52d566";
        descriptor.lineColor = "#0b3911";
        descriptor.accentColor = "#b8ffd5";
        descriptor.repeatX = 1;
        descriptor.repeatY = 1;
        descriptor.roughness = 0.52;
        descriptor.metalness = 0.1;
        descriptor.bumpScale = 0.08;
        descriptor.emissive = "#3fe864";
        descriptor.emissiveIntensity = 0.16;
        descriptor.effects.push("runes");
        return descriptor;
    }

    if (normalizedKey === "goalpad")
    {
        descriptor.pattern = "pad";
        descriptor.baseColor = "#7f1f1f";
        descriptor.secondaryColor = "#eb6767";
        descriptor.lineColor = "#300707";
        descriptor.accentColor = "#ffd1d1";
        descriptor.repeatX = 1;
        descriptor.repeatY = 1;
        descriptor.roughness = 0.48;
        descriptor.metalness = 0.12;
        descriptor.bumpScale = 0.08;
        descriptor.emissive = "#ff5858";
        descriptor.emissiveIntensity = 0.18;
        descriptor.effects.push("runes");
        return descriptor;
    }

    if (normalizedKey === "teleportpad")
    {
        descriptor.pattern = "pad";
        descriptor.baseColor = "#3b2359";
        descriptor.secondaryColor = "#8d58ff";
        descriptor.lineColor = "#120620";
        descriptor.accentColor = "#e8dcff";
        descriptor.repeatX = 1;
        descriptor.repeatY = 1;
        descriptor.roughness = 0.38;
        descriptor.metalness = 0.22;
        descriptor.bumpScale = 0.08;
        descriptor.emissive = "#8f58ff";
        descriptor.emissiveIntensity = 0.22;
        descriptor.effects.push("runes");
        return descriptor;
    }

    switch (family)
    {
        case "castle":
            descriptor.baseColor = "#a69584";
            descriptor.secondaryColor = "#c3b09b";
            descriptor.lineColor = "#5b4a3c";
            descriptor.accentColor = "#edd88e";
            descriptor.roughness = 0.84;
            descriptor.metalness = 0.03;
            break;

        case "industrial":
            descriptor.baseColor = "#8a959c";
            descriptor.secondaryColor = "#c8d1d8";
            descriptor.lineColor = "#394048";
            descriptor.accentColor = "#f0e18e";
            descriptor.roughness = 0.54;
            descriptor.metalness = 0.55;
            break;

        case "forestTemple":
            descriptor.baseColor = "#96a176";
            descriptor.secondaryColor = "#c7b38e";
            descriptor.lineColor = "#465339";
            descriptor.accentColor = "#eef2a6";
            descriptor.roughness = 0.86;
            descriptor.metalness = 0.02;
            break;

        case "fireCave":
            descriptor.baseColor = "#7d5d51";
            descriptor.secondaryColor = "#a67966";
            descriptor.lineColor = "#39221c";
            descriptor.accentColor = "#ffc37a";
            descriptor.roughness = 0.82;
            descriptor.metalness = 0.04;
            break;

        case "iceCave":
            descriptor.baseColor = "#b7d8ea";
            descriptor.secondaryColor = "#e9f8ff";
            descriptor.lineColor = "#4a7995";
            descriptor.accentColor = "#f7ffff";
            descriptor.roughness = 0.42;
            descriptor.metalness = 0.08;
            break;

        case "void":
            descriptor.baseColor = "#171717";
            descriptor.secondaryColor = "#2b2b2b";
            descriptor.lineColor = "#050505";
            descriptor.accentColor = "#7c7c7c";
            descriptor.pattern = "rock";
            descriptor.roughness = 0.94;
            descriptor.metalness = 0.01;
            break;

        default:
            break;
    }

    if (surfaceKind === "ceiling")
    {
        switch (family)
        {
            case "castle":
                descriptor.pattern = "stone";
                break;

            case "industrial":
                descriptor.pattern = "panel";
                descriptor.baseColor = "#7f8990";
                descriptor.secondaryColor = "#b8c2ca";
                descriptor.lineColor = "#31373d";
                descriptor.roughness = 0.52;
                descriptor.metalness = 0.62;
                break;

            case "forestTemple":
                descriptor.pattern = "organic";
                descriptor.effects.push("moss", "roots");
                break;

            case "fireCave":
                descriptor.pattern = "rock";
                descriptor.effects.push("embers");
                break;

            case "iceCave":
                descriptor.pattern = "crystal";
                descriptor.effects.push("frost");
                break;

            default:
                descriptor.pattern = "rock";
                break;
        }

        applyFloorTextureDescriptor(descriptor, normalizedKey);
        return descriptor;
    }

    if (surfaceKind === "wall")
    {
        if (normalizedKey.includes("brick"))
        {
            descriptor.pattern = "brick";
        }
        else if (normalizedKey.includes("panel") || normalizedKey.includes("metal"))
        {
            descriptor.pattern = "panel";
        }
        else if (normalizedKey.includes("root"))
        {
            descriptor.pattern = "organic";
            descriptor.effects.push("roots");
        }
        else if (normalizedKey.includes("moss"))
        {
            descriptor.pattern = "stone";
            descriptor.effects.push("moss");
        }
        else if (normalizedKey.includes("basalt") || normalizedKey.includes("obsidian") || normalizedKey.includes("rock"))
        {
            descriptor.pattern = "rock";
        }
        else if (normalizedKey.includes("ice") || normalizedKey.includes("crystal"))
        {
            descriptor.pattern = "crystal";
        }

        if (normalizedKey.includes("concrete"))
        {
            descriptor.pattern = "stone";
            descriptor.metalness = 0.08;
            descriptor.roughness = 0.94;
        }

        if (normalizedKey.includes("darkmetal"))
        {
            descriptor.baseColor = "#454b52";
            descriptor.secondaryColor = "#8b969f";
            descriptor.lineColor = "#181c21";
            descriptor.metalness = 0.72;
            descriptor.roughness = 0.48;
        }

        if (normalizedKey.includes("obsidian"))
        {
            descriptor.baseColor = "#281b2f";
            descriptor.secondaryColor = "#49374d";
            descriptor.lineColor = "#120a15";
            descriptor.accentColor = "#ff8c56";
            descriptor.effects.push("lava");
            descriptor.bumpScale = 0.16;
        }

        if (normalizedKey.includes("crystal"))
        {
            descriptor.baseColor = "#7bc9ff";
            descriptor.secondaryColor = "#dff8ff";
            descriptor.lineColor = "#2b6f9d";
            descriptor.roughness = 0.28;
            descriptor.bumpScale = 0.08;
            descriptor.effects.push("frost");
        }

        if (false && normalizedKey === "castlebrickwall")
        {
            descriptor.repeatX = 1;
            descriptor.repeatY = 1;

            descriptor.roughness = 0.85;

            // let displacement do the work → reduce normal a bit
            descriptor.normalScale = 1.2;
            descriptor.bumpScale = 0.0; // remove, it's redundant

            descriptor.aoMapIntensity = 1.2;

            // 👇 stronger but controlled displacement
            descriptor.displacementScale = 0.065;
            descriptor.displacementBias = -0.0325;
            descriptor.displacementEdgeFadeDistance = 0.11;
            descriptor.displacementCornerFadePower = 1.5;
            descriptor.textureMaps = {
                map: "./assets/textures/wall/castleBrickWall/castleBrickWall_diffuse.jpg",
                normalMap: "./assets/textures/wall/castleBrickWall/castleBrickWall_normal.jpg",
                roughnessMap: "./assets/textures/wall/castleBrickWall/castleBrickWall_rough.jpg",
                aoMap: "./assets/textures/wall/castleBrickWall/castleBrickWall_ao.jpg",
                displacementMap: "./assets/textures/wall/castleBrickWall/castleBrickWall_displacement.jpg"
            };
        }

        applyWallTextureDescriptor(descriptor, normalizedKey);
        return descriptor;
    }

    if (normalizedKey.includes("tile"))
    {
        descriptor.pattern = "tile";
    }
    else if (normalizedKey.includes("grate"))
    {
        descriptor.pattern = "panel";
        descriptor.effects.push("grate");
        descriptor.roughness = 0.55;
        descriptor.metalness = 0.62;
    }
    else if (normalizedKey.includes("snow"))
    {
        descriptor.pattern = "tile";
        descriptor.effects.push("snow");
    }
    else if (normalizedKey.includes("ice"))
    {
        descriptor.pattern = "crystal";
    }
    else if (family === "fireCave" || normalizedKey.includes("lava") || normalizedKey.includes("ash"))
    {
        descriptor.pattern = "rock";
    }
    else if (family === "forestTemple")
    {
        descriptor.pattern = "tile";
    }
    else
    {
        descriptor.pattern = "stone";
    }

    if (normalizedKey.includes("cracked") || normalizedKey.includes("broken"))
    {
        descriptor.effects.push("cracks");
    }

    if (normalizedKey.includes("moss"))
    {
        descriptor.effects.push("moss");
    }

    if (normalizedKey.includes("root"))
    {
        descriptor.effects.push("roots");
    }

    if (normalizedKey.includes("vine"))
    {
        descriptor.effects.push("vine");
    }

    if (normalizedKey.includes("rune"))
    {
        descriptor.effects.push("runes");
        descriptor.emissive = descriptor.accentColor;
        descriptor.emissiveIntensity = 0.08;
    }

    if (normalizedKey.includes("banner"))
    {
        descriptor.effects.push("banner");
    }

    if (normalizedKey.includes("oil"))
    {
        descriptor.effects.push("oil");
        descriptor.roughness = 0.26;
        descriptor.metalness = 0.18;
    }

    if (normalizedKey.includes("patch"))
    {
        descriptor.effects.push("patch");
    }

    if (normalizedKey.includes("lava"))
    {
        descriptor.effects.push("lava");
        descriptor.roughness = 0.52;
        descriptor.emissive = "#ff8740";
        descriptor.emissiveIntensity = 0.12;
    }

    if (normalizedKey.includes("ember"))
    {
        descriptor.effects.push("embers");
        descriptor.emissive = "#ffab4a";
        descriptor.emissiveIntensity = 0.08;
    }

    if (normalizedKey.includes("scorch"))
    {
        descriptor.effects.push("scorch");
    }

    if (normalizedKey.includes("frost"))
    {
        descriptor.effects.push("frost");
    }

    if (normalizedKey.includes("slippery"))
    {
        descriptor.effects.push("frost");
        descriptor.roughness = 0.16;
        descriptor.metalness = 0.05;
    }

    if (normalizedKey.includes("packedsnow"))
    {
        descriptor.baseColor = "#edf4fa";
        descriptor.secondaryColor = "#f8fcff";
        descriptor.lineColor = "#b9cad8";
        descriptor.roughness = 0.92;
        descriptor.metalness = 0;
    }

    if (family === "industrial" && !descriptor.effects.includes("grate"))
    {
        descriptor.pattern = normalizedKey.includes("concrete") ? "stone" : "panel";
        descriptor.metalness = normalizedKey.includes("concrete") ? 0.05 : 0.5;
        descriptor.roughness = normalizedKey.includes("concrete") ? 0.9 : descriptor.roughness;
    }

    if (family === "forestTemple")
    {
        descriptor.effects.push("moss");
    }

    if (family === "fireCave")
    {
        descriptor.baseColor = normalizedKey.includes("darkbasalt") ? "#554744" : descriptor.baseColor;
    }

    if (family === "iceCave")
    {
        descriptor.roughness = Math.min(descriptor.roughness, 0.38);
        descriptor.bumpScale = 0.07;
    }

    applyFloorTextureDescriptor(descriptor, normalizedKey);
    return descriptor;
}
