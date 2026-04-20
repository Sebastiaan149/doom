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
        descriptor.emissiveIntensity = 0.35;
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
        descriptor.emissiveIntensity = 0.4;
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
        descriptor.emissiveIntensity = 0.48;
        descriptor.effects.push("runes");
        return descriptor;
    }

    switch (family)
    {
        case "castle":
            descriptor.baseColor = "#837766";
            descriptor.secondaryColor = "#a59c8d";
            descriptor.lineColor = "#453a2f";
            descriptor.accentColor = "#d6c07a";
            descriptor.roughness = 0.92;
            descriptor.metalness = 0.03;
            break;

        case "industrial":
            descriptor.baseColor = "#6b7379";
            descriptor.secondaryColor = "#b6bfc6";
            descriptor.lineColor = "#2d3238";
            descriptor.accentColor = "#e3d175";
            descriptor.roughness = 0.62;
            descriptor.metalness = 0.55;
            break;

        case "forestTemple":
            descriptor.baseColor = "#798463";
            descriptor.secondaryColor = "#b3a07f";
            descriptor.lineColor = "#364027";
            descriptor.accentColor = "#dfe48c";
            descriptor.roughness = 0.93;
            descriptor.metalness = 0.02;
            break;

        case "fireCave":
            descriptor.baseColor = "#5f463d";
            descriptor.secondaryColor = "#8f6653";
            descriptor.lineColor = "#291914";
            descriptor.accentColor = "#ffb165";
            descriptor.roughness = 0.9;
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
        descriptor.repeatX = 2.1;
        descriptor.repeatY = 2.1;
        descriptor.bumpScale = 0.12;

        switch (family)
        {
            case "castle":
                descriptor.pattern = "stone";
                descriptor.effects.push("cracks");
                break;

            case "industrial":
                descriptor.pattern = "panel";
                descriptor.baseColor = "#626a70";
                descriptor.secondaryColor = "#a2adb5";
                descriptor.lineColor = "#23272c";
                descriptor.roughness = 0.58;
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

    return descriptor;
}
