// This file builds reusable procedural textures and cached materials for the 3D maze world.
// It lets the maze use proper textured surfaces even before external image assets are added.

// Creates the shared material library used by the world builder.
// This was used as some static example before we added the actual textures.
// The starting and endpoint materials still remain used
function createMazeWorldMaterialLibrary(options = {})
{
    const renderer = options.renderer ?? null;
    const textureSize = options.textureSize ?? 128;
    const tileWorldSize = options.tileSize ?? 1;
    const wallWorldHeight = options.wallHeight ?? 1;
    const worldFloorY = options.floorY ?? 0;
    let textureDisplacementEnabled = options.textureDisplacementEnabled ?? false;
    const maxAnisotropy =
        renderer?.capabilities?.getMaxAnisotropy
            ? renderer.capabilities.getMaxAnisotropy()
            : 1;
    const imageTextureLoader = new THREE.TextureLoader();

    // These caches let rebuilt mazes reuse textures/materials instead of recreating everything per tile.
    const baseTextureCache = new Map();
    const sharedMaterialCache = new Map();
    const wallMaterialSetCache = new Map();
    const teleportMaterialCache = new Map();
    const ownedGeometrySet = new Set();
    const ownedTextureSet = new Set();
    const ownedMaterialSet = new Set();
    const textureLoadPromises = [];

    // Keeps generated values inside an expected range.
    function clamp(value, min, max)
    {
        return Math.min(max, Math.max(min, value));
    }

    // Produces a deterministic integer from a string so each material gets stable texture noise.
    function hashString(input)
    {
        let hash = 2166136261;

        for (let index = 0; index < input.length; index++)
        {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }

    // Small deterministic pseudo-random generator used by the procedural texture drawing code.
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

    // Shifts a color's lightness and saturation by a given offset, used for texture noise and effects to keep them in the same color family.
    function shiftColor(hexColor, lightnessOffset = 0, saturationOffset = 0)
    {
        const color = new THREE.Color(hexColor);
        const hsl = {};

        color.getHSL(hsl);
        color.setHSL(
            hsl.h,
            clamp(hsl.s + saturationOffset, 0, 1),
            clamp(hsl.l + lightnessOffset, 0, 1)
        );

        return color;
    }

    // Converts a color into a CSS string, optionally turning it into grayscale for bump maps.
    function colorToCss(hexColor, options = {})
    {
        const grayscale = options.grayscale ?? false;
        const lightnessOffset = options.lightnessOffset ?? 0;
        const saturationOffset = options.saturationOffset ?? 0;
        const alpha = options.alpha ?? 1;
        const shiftedColor = shiftColor(hexColor, lightnessOffset, saturationOffset);

        if (grayscale)
        {
            const luminance = clamp(
                shiftedColor.r * 0.299 + shiftedColor.g * 0.587 + shiftedColor.b * 0.114,
                0,
                1
            );

            const channel = Math.round(luminance * 255);
            return `rgba(${channel}, ${channel}, ${channel}, ${alpha})`;
        }

        return `rgba(${Math.round(shiftedColor.r * 255)}, ${Math.round(shiftedColor.g * 255)}, ${Math.round(shiftedColor.b * 255)}, ${alpha})`;
    }

    // Draws gentle texture noise so large surfaces do not look perfectly flat.
    function addNoise(ctx, random, descriptor, grayscale)
    {
        const dotCount = descriptor.surfaceKind === "wall" ? 150 : 110;

        for (let index = 0; index < dotCount; index++)
        {
            const size = 1 + random() * 4;
            const x = random() * textureSize;
            const y = random() * textureSize;
            const alpha = 0.05 + random() * 0.08;
            const lightnessOffset = random() > 0.5 ? 0.1 : -0.1;

            ctx.fillStyle = colorToCss(descriptor.secondaryColor, {
                grayscale,
                lightnessOffset,
                alpha
            });
            ctx.fillRect(x, y, size, size);
        }
    }

    // Utility for drawing a single jagged crack line.
    function drawJaggedPath(ctx, random, strokeStyle, lineWidth)
    {
        let x = random() * textureSize;
        let y = random() * textureSize;
        const segments = 5 + Math.floor(random() * 5);

        ctx.beginPath();
        ctx.moveTo(x, y);

        for (let index = 0; index < segments; index++)
        {
            x += (random() - 0.5) * textureSize * 0.3;
            y += (random() - 0.5) * textureSize * 0.3;
            ctx.lineTo(clamp(x, 0, textureSize), clamp(y, 0, textureSize));
        }

        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    // Brick patterns use a regular offset grid to create a classic masonry look for castle walls and similar surfaces.
    function drawBrickPattern(ctx, random, descriptor, grayscale)
    {
        const brickHeight = textureSize / 4;
        const brickWidth = textureSize / 3;

        ctx.strokeStyle = colorToCss(descriptor.lineColor, {
            grayscale,
            alpha: 0.95
        });
        ctx.lineWidth = 3;

        for (let row = 0; row < 4; row++)
        {
            const offset = row % 2 === 0 ? 0 : brickWidth / 2;

            for (let column = -1; column < 4; column++)
            {
                const x = column * brickWidth + offset;
                const y = row * brickHeight;

                ctx.fillStyle = colorToCss(
                    random() > 0.5 ? descriptor.baseColor : descriptor.secondaryColor,
                    {
                        grayscale,
                        lightnessOffset: (random() - 0.5) * 0.1
                    }
                );
                ctx.fillRect(x, y, brickWidth, brickHeight);
                ctx.strokeRect(x, y, brickWidth, brickHeight);
            }
        }
    }

    // Stone block patterns break the surface into irregular slabs.
    function drawStonePattern(ctx, random, descriptor, grayscale)
    {
        const rowCount = 3;
        let currentY = 0;

        ctx.strokeStyle = colorToCss(descriptor.lineColor, {
            grayscale,
            alpha: 0.9
        });
        ctx.lineWidth = 3;

        for (let row = 0; row < rowCount; row++)
        {
            const remainingHeight = textureSize - currentY;
            const blockHeight =
                row === rowCount - 1
                    ? remainingHeight
                    : textureSize * (0.24 + random() * 0.12);

            let currentX = 0;

            while (currentX < textureSize)
            {
                const remainingWidth = textureSize - currentX;
                const blockWidth =
                    remainingWidth < textureSize * 0.3
                        ? remainingWidth
                        : textureSize * (0.22 + random() * 0.18);

                ctx.fillStyle = colorToCss(
                    random() > 0.5 ? descriptor.baseColor : descriptor.secondaryColor,
                    {
                        grayscale,
                        lightnessOffset: (random() - 0.5) * 0.08
                    }
                );
                ctx.fillRect(currentX, currentY, blockWidth, blockHeight);
                ctx.strokeRect(currentX, currentY, blockWidth, blockHeight);

                currentX += blockWidth;
            }

            currentY += blockHeight;
        }
    }

    // Metal and industrial surfaces are drawn as framed panels with bolts.
    function drawPanelPattern(ctx, random, descriptor, grayscale)
    {
        const columns = 3;
        const rows = 3;
        const panelWidth = textureSize / columns;
        const panelHeight = textureSize / rows;

        for (let row = 0; row < rows; row++)
        {
            for (let column = 0; column < columns; column++)
            {
                const x = column * panelWidth;
                const y = row * panelHeight;

                ctx.fillStyle = colorToCss(descriptor.baseColor, {
                    grayscale,
                    lightnessOffset: (random() - 0.5) * 0.08
                });
                ctx.fillRect(x, y, panelWidth, panelHeight);

                ctx.strokeStyle = colorToCss(descriptor.lineColor, {
                    grayscale,
                    alpha: 0.95
                });
                ctx.lineWidth = 4;
                ctx.strokeRect(x + 2, y + 2, panelWidth - 4, panelHeight - 4);

                ctx.strokeStyle = colorToCss(descriptor.secondaryColor, {
                    grayscale,
                    lightnessOffset: 0.08,
                    alpha: 0.45
                });
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 7, y + 7, panelWidth - 14, panelHeight - 14);

                const boltColor = colorToCss(descriptor.accentColor, {
                    grayscale,
                    alpha: 0.7
                });

                ctx.fillStyle = boltColor;

                for (const bolt of [
                    [x + 9, y + 9],
                    [x + panelWidth - 9, y + 9],
                    [x + 9, y + panelHeight - 9],
                    [x + panelWidth - 9, y + panelHeight - 9]
                ])
                {
                    ctx.beginPath();
                    ctx.arc(bolt[0], bolt[1], 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // Organic temple surfaces blend stone blocks with softer flowing details.
    function drawOrganicPattern(ctx, random, descriptor, grayscale)
    {
        drawStonePattern(ctx, random, descriptor, grayscale);

        for (let index = 0; index < 7; index++)
        {
            const startX = random() * textureSize;
            const startY = random() * textureSize;
            const amplitude = 6 + random() * 10;
            const stepCount = 8;

            ctx.beginPath();
            ctx.moveTo(startX, startY);

            for (let step = 1; step <= stepCount; step++)
            {
                const x = startX + step * (textureSize / stepCount) * 0.2;
                const y = startY + step * (textureSize / stepCount) + Math.sin(step + startX) * amplitude;
                ctx.lineTo(clamp(x, 0, textureSize), clamp(y, 0, textureSize));
            }

            ctx.strokeStyle = colorToCss(descriptor.lineColor, {
                grayscale,
                lightnessOffset: -0.04,
                alpha: 0.45
            });
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    // Rock patterns are deliberately more chaotic to suit caves and outer maze walls.
    function drawRockPattern(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 18; index++)
        {
            const x = random() * textureSize;
            const y = random() * textureSize;
            const radius = 8 + random() * 18;

            ctx.fillStyle = colorToCss(
                random() > 0.5 ? descriptor.secondaryColor : descriptor.baseColor,
                {
                    grayscale,
                    lightnessOffset: (random() - 0.5) * 0.12,
                    alpha: 0.2 + random() * 0.22
                }
            );
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let index = 0; index < 4; index++)
        {
            drawJaggedPath(
                ctx,
                random,
                colorToCss(descriptor.lineColor, {
                    grayscale,
                    alpha: 0.32
                }),
                2
            );
        }
    }

    // Crystalline surfaces use diagonal facets and high-contrast highlights.
    function drawCrystalPattern(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 12; index++)
        {
            const x = random() * textureSize;
            const y = random() * textureSize;
            const width = 18 + random() * 24;
            const height = 10 + random() * 20;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(clamp(x + width * 0.5, 0, textureSize), clamp(y - height * 0.4, 0, textureSize));
            ctx.lineTo(clamp(x + width, 0, textureSize), y);
            ctx.lineTo(clamp(x + width * 0.6, 0, textureSize), clamp(y + height, 0, textureSize));
            ctx.lineTo(clamp(x - width * 0.2, 0, textureSize), clamp(y + height * 0.8, 0, textureSize));
            ctx.closePath();

            ctx.fillStyle = colorToCss(
                random() > 0.55 ? descriptor.secondaryColor : descriptor.baseColor,
                {
                    grayscale,
                    lightnessOffset: (random() - 0.5) * 0.12,
                    alpha: 0.3 + random() * 0.24
                }
            );
            ctx.fill();

            ctx.strokeStyle = colorToCss(descriptor.lineColor, {
                grayscale,
                alpha: 0.35
            });
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // Floor tiles use a regular square grid that reads clearly on the maze floor.
    function drawTilePattern(ctx, random, descriptor, grayscale)
    {
        const tileCount = 4;
        const cellSize = textureSize / tileCount;

        ctx.lineWidth = 3;
        ctx.strokeStyle = colorToCss(descriptor.lineColor, {
            grayscale,
            alpha: 0.82
        });

        for (let y = 0; y < tileCount; y++)
        {
            for (let x = 0; x < tileCount; x++)
            {
                const cellX = x * cellSize;
                const cellY = y * cellSize;

                ctx.fillStyle = colorToCss(
                    random() > 0.5 ? descriptor.baseColor : descriptor.secondaryColor,
                    {
                        grayscale,
                        lightnessOffset: (random() - 0.5) * 0.09
                    }
                );
                ctx.fillRect(cellX, cellY, cellSize, cellSize);
                ctx.strokeRect(cellX, cellY, cellSize, cellSize);
            }
        }
    }

    // Special pads use circles and axis lines so they feel distinct from regular floor tiles.
    function drawPadPattern(ctx, random, descriptor, grayscale)
    {
        const center = textureSize / 2;

        ctx.fillStyle = colorToCss(descriptor.baseColor, { grayscale });
        ctx.fillRect(0, 0, textureSize, textureSize);

        ctx.strokeStyle = colorToCss(descriptor.lineColor, {
            grayscale,
            alpha: 0.95
        });
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, textureSize - 6, textureSize - 6);

        for (const radius of [center * 0.72, center * 0.42, center * 0.16])
        {
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.strokeStyle = colorToCss(
                radius === center * 0.16 ? descriptor.accentColor : descriptor.secondaryColor,
                {
                    grayscale,
                    alpha: radius === center * 0.16 ? 0.95 : 0.75
                }
            );
            ctx.lineWidth = radius === center * 0.16 ? 7 : 4;
            ctx.stroke();
        }

        ctx.strokeStyle = colorToCss(descriptor.accentColor, {
            grayscale,
            alpha: 0.9
        });
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(center, 10);
        ctx.lineTo(center, textureSize - 10);
        ctx.moveTo(10, center);
        ctx.lineTo(textureSize - 10, center);
        ctx.stroke();

        for (let index = 0; index < 8; index++)
        {
            const angle = (Math.PI * 2 * index) / 8;
            const x = center + Math.cos(angle) * center * 0.53;
            const y = center + Math.sin(angle) * center * 0.53;

            ctx.beginPath();
            ctx.arc(x, y, 3 + random() * 2, 0, Math.PI * 2);
            ctx.fillStyle = colorToCss(descriptor.accentColor, {
                grayscale,
                alpha: 0.82
            });
            ctx.fill();
        }
    }

    // Overlay cracks add roughness to worn tiles and stone.
    function drawCrackEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 5; index++)
        {
            drawJaggedPath(
                ctx,
                random,
                colorToCss(descriptor.lineColor, {
                    grayscale,
                    lightnessOffset: -0.08,
                    alpha: 0.58
                }),
                2 + random()
            );
        }
    }

    // Moss clusters soften stone and temple surfaces.
    function drawMossEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 18; index++)
        {
            ctx.fillStyle = colorToCss("#6d9a45", {
                grayscale,
                lightnessOffset: (random() - 0.5) * 0.1,
                alpha: 0.14 + random() * 0.2
            });
            ctx.beginPath();
            ctx.ellipse(
                random() * textureSize,
                random() * textureSize,
                8 + random() * 14,
                6 + random() * 12,
                random() * Math.PI,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    // Thick curving lines hint at roots spreading over temple floors and walls.
    function drawRootEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 5; index++)
        {
            const startX = random() * textureSize;
            const startY = random() * textureSize;

            ctx.beginPath();
            ctx.moveTo(startX, startY);

            for (let step = 1; step <= 6; step++)
            {
                const x = startX + (random() - 0.5) * 18 + step * 8;
                const y = startY + step * 12 + Math.sin(step + startX) * 6;
                ctx.lineTo(clamp(x, 0, textureSize), clamp(y, 0, textureSize));
            }

            ctx.strokeStyle = colorToCss("#5d3d20", {
                grayscale,
                alpha: 0.48
            });
            ctx.lineWidth = 3 + random() * 2;
            ctx.stroke();
        }
    }

    // Thin vine trails provide a light overlay for outdoor stone surfaces and make them feel more alive.
    function drawVineEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 7; index++)
        {
            const startX = random() * textureSize;

            ctx.beginPath();
            ctx.moveTo(startX, 0);

            for (let step = 1; step <= 8; step++)
            {
                const y = (textureSize / 8) * step;
                const x = startX + Math.sin(step + startX * 0.1) * 8;
                ctx.lineTo(clamp(x, 0, textureSize), y);
            }

            ctx.strokeStyle = colorToCss("#8fc95f", {
                grayscale,
                alpha: 0.45
            });
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // Rune marks help teleport, start, and goal pads read as special gameplay surfaces.
    function drawRuneEffect(ctx, random, descriptor, grayscale)
    {
        const center = textureSize / 2;
        const radius = textureSize * 0.32;

        ctx.strokeStyle = colorToCss(descriptor.accentColor, {
            grayscale,
            alpha: 0.72
        });
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.stroke();

        for (let index = 0; index < 6; index++)
        {
            const angle = (Math.PI * 2 * index) / 6;
            const x = center + Math.cos(angle) * radius;
            const y = center + Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(center + Math.cos(angle) * radius * 0.45, center + Math.sin(angle) * radius * 0.45);
            ctx.lineTo(x, y);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x, y, 2 + random() * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = colorToCss(descriptor.accentColor, {
                grayscale,
                alpha: 0.82
            });
            ctx.fill();
        }
    }

    // Industrial grates are drawn as repeated slits over the base panel texture.
    function drawGrateEffect(ctx, random, descriptor, grayscale)
    {
        ctx.fillStyle = colorToCss(descriptor.lineColor, {
            grayscale,
            alpha: 0.6
        });

        for (let index = 0; index < 9; index++)
        {
            const x = 6 + index * 13;
            ctx.fillRect(x, 0, 6, textureSize);
        }

        ctx.strokeStyle = colorToCss(descriptor.secondaryColor, {
            grayscale,
            lightnessOffset: 0.1,
            alpha: 0.35
        });
        ctx.lineWidth = 1.5;

        for (let index = 0; index < 7; index++)
        {
            const y = 8 + index * 16;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(textureSize, y);
            ctx.stroke();
        }
    }

    // Oil pools darken industrial floors and make them read as less rough.
    function drawOilEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 4; index++)
        {
            ctx.fillStyle = colorToCss("#121418", {
                grayscale,
                alpha: 0.28 + random() * 0.18
            });
            ctx.beginPath();
            ctx.ellipse(
                random() * textureSize,
                random() * textureSize,
                18 + random() * 14,
                9 + random() * 8,
                random() * Math.PI,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    // Patch overlays add irregular rectangles that can read as worn areas, stains, or surface variations depending on the color and pattern of the base texture.
    function drawPatchEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 4; index++)
        {
            const width = 18 + random() * 24;
            const height = 12 + random() * 18;
            const x = random() * (textureSize - width);
            const y = random() * (textureSize - height);

            ctx.fillStyle = colorToCss(descriptor.secondaryColor, {
                grayscale,
                lightnessOffset: 0.05,
                alpha: 0.5
            });
            ctx.fillRect(x, y, width, height);

            ctx.strokeStyle = colorToCss(descriptor.lineColor, {
                grayscale,
                alpha: 0.55
            });
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
        }
    }

    // Glowing cracks and fissures for lava floors
    function drawLavaEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 4; index++)
        {
            drawJaggedPath(
                ctx,
                random,
                colorToCss(descriptor.accentColor, {
                    grayscale,
                    lightnessOffset: 0.12,
                    alpha: 0.78
                }),
                3
            );
        }
    }

    // Ember speckles give fire-cave floors a faint glow.
    function drawEmberEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 28; index++)
        {
            ctx.fillStyle = colorToCss("#ffb254", {
                grayscale,
                alpha: 0.35 + random() * 0.25
            });
            ctx.beginPath();
            ctx.arc(random() * textureSize, random() * textureSize, 1 + random() * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Scorch marks darken parts of burnt volcanic floors.
    function drawScorchEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 7; index++)
        {
            ctx.fillStyle = colorToCss("#2c1d18", {
                grayscale,
                alpha: 0.18 + random() * 0.12
            });
            ctx.beginPath();
            ctx.ellipse(
                random() * textureSize,
                random() * textureSize,
                10 + random() * 12,
                10 + random() * 14,
                random() * Math.PI,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
    }

    // Snow adds soft bright speckles 
    function drawSnowEffect(ctx, random, descriptor, grayscale)
    {
        for (let index = 0; index < 80; index++)
        {
            const alpha = 0.18 + random() * 0.22;
            const radius = 0.8 + random() * 1.8;

            ctx.fillStyle = colorToCss("#ffffff", {
                grayscale,
                alpha
            });
            ctx.beginPath();
            ctx.arc(random() * textureSize, random() * textureSize, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Frost streaks make ice surfaces look slick and reflective.
    function drawFrostEffect(ctx, random, descriptor, grayscale)
    {
        ctx.strokeStyle = colorToCss("#ffffff", {
            grayscale,
            alpha: 0.28
        });
        ctx.lineWidth = 2;

        for (let index = 0; index < 12; index++)
        {
            ctx.beginPath();
            ctx.moveTo(random() * textureSize, random() * textureSize);
            ctx.lineTo(random() * textureSize, random() * textureSize);
            ctx.stroke();
        }
    }

    // Banner accents for castle walls and similar surfaces
    function drawBannerEffect(ctx, random, descriptor, grayscale)
    {
        const stripeWidth = textureSize * 0.18;
        const x = textureSize * 0.41;

        ctx.fillStyle = colorToCss("#8b2230", {
            grayscale,
            alpha: 0.32
        });
        ctx.fillRect(x, 0, stripeWidth, textureSize);

        ctx.strokeStyle = colorToCss(descriptor.accentColor, {
            grayscale,
            alpha: 0.45
        });
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, 0, stripeWidth - 6, textureSize);
    }

    // Renders the requested surface into a canvas that can then be wrapped as a repeating texture.
    function renderSurfaceCanvas(descriptor, grayscale = false)
    {
        const canvas = document.createElement("canvas");
        canvas.width = textureSize;
        canvas.height = textureSize;

        const ctx = canvas.getContext("2d");
        const random = createSeededRandom(
            hashString(`${descriptor.surfaceKind}:${descriptor.key}:${grayscale ? "bump" : "albedo"}`)
        );

        ctx.fillStyle = colorToCss(descriptor.baseColor, { grayscale });
        ctx.fillRect(0, 0, textureSize, textureSize);

        switch (descriptor.pattern)
        {
            case "brick":
                drawBrickPattern(ctx, random, descriptor, grayscale);
                break;

            case "panel":
                drawPanelPattern(ctx, random, descriptor, grayscale);
                break;

            case "organic":
                drawOrganicPattern(ctx, random, descriptor, grayscale);
                break;

            case "rock":
                drawRockPattern(ctx, random, descriptor, grayscale);
                break;

            case "crystal":
                drawCrystalPattern(ctx, random, descriptor, grayscale);
                break;

            case "pad":
                drawPadPattern(ctx, random, descriptor, grayscale);
                break;

            case "tile":
                drawTilePattern(ctx, random, descriptor, grayscale);
                break;

            default:
                drawStonePattern(ctx, random, descriptor, grayscale);
                break;
        }

        addNoise(ctx, random, descriptor, grayscale);

        for (const effect of descriptor.effects)
        {
            switch (effect)
            {
                case "cracks":
                    drawCrackEffect(ctx, random, descriptor, grayscale);
                    break;

                case "moss":
                    drawMossEffect(ctx, random, descriptor, grayscale);
                    break;

                case "roots":
                    drawRootEffect(ctx, random, descriptor, grayscale);
                    break;

                case "vine":
                    drawVineEffect(ctx, random, descriptor, grayscale);
                    break;

                case "runes":
                    drawRuneEffect(ctx, random, descriptor, grayscale);
                    break;

                case "grate":
                    drawGrateEffect(ctx, random, descriptor, grayscale);
                    break;

                case "oil":
                    drawOilEffect(ctx, random, descriptor, grayscale);
                    break;

                case "patch":
                    drawPatchEffect(ctx, random, descriptor, grayscale);
                    break;

                case "lava":
                    drawLavaEffect(ctx, random, descriptor, grayscale);
                    break;

                case "embers":
                    drawEmberEffect(ctx, random, descriptor, grayscale);
                    break;

                case "scorch":
                    drawScorchEffect(ctx, random, descriptor, grayscale);
                    break;

                case "snow":
                    drawSnowEffect(ctx, random, descriptor, grayscale);
                    break;

                case "frost":
                    drawFrostEffect(ctx, random, descriptor, grayscale);
                    break;

                case "banner":
                    drawBannerEffect(ctx, random, descriptor, grayscale);
                    break;

                default:
                    break;
            }
        }

        return canvas;
    }

    // Base textures are rendered once per descriptor, then reused by a small number of shared
    // materials. This keeps live theme switching stable instead of allocating one material per tile.
    function getBaseSurfaceTexture(descriptor, textureKind)
    {
        const cacheKey = `${textureKind}:${descriptor.surfaceKind}:${descriptor.key}`;

        if (!baseTextureCache.has(cacheKey))
        {
            const texture = new THREE.CanvasTexture(
                renderSurfaceCanvas(descriptor, textureKind === "bump")
            );

            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.anisotropy = Math.min(maxAnisotropy, 4);

            if (textureKind !== "bump")
            {
                texture.encoding = THREE.sRGBEncoding;
            }

            texture.needsUpdate = true;
            baseTextureCache.set(cacheKey, texture);
        }

        return baseTextureCache.get(cacheKey);
    }

    // Creates one configured texture variant that can be shared by many meshes.
    // The actual world alignment now comes from mesh UVs rather than per-material offsets.
    function createConfiguredTexture(descriptor, textureKind)
    {
        const texture = getBaseSurfaceTexture(descriptor, textureKind).clone();

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
        texture.anisotropy = Math.min(maxAnisotropy, 4);

        if (textureKind !== "bump")
        {
            texture.encoding = THREE.sRGBEncoding;
        }

        texture.needsUpdate = true;
        ownedTextureSet.add(texture);

        return texture;
    }

    function createConfiguredImageTexture(texturePath, textureKind)
    {
        let resolveTextureLoad;
        const textureLoadPromise = new Promise((resolve) =>
        {
            resolveTextureLoad = resolve;
        });
        const texture = imageTextureLoader.load(
            texturePath,
            (loadedTexture) =>
            {
                loadedTexture.needsUpdate = true;
                resolveTextureLoad(loadedTexture);
            },
            undefined,
            () =>
            {
                resolveTextureLoad(null);
            }
        );

        textureLoadPromises.push(textureLoadPromise);

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
        texture.anisotropy = Math.min(maxAnisotropy, 4);

        if (textureKind === "map" || textureKind === "emissiveMap")
        {
            texture.encoding = THREE.sRGBEncoding;
        }

        ownedTextureSet.add(texture);

        return texture;
    }

    function createMaterialTextureParameters(descriptor)
    {
        if (!descriptor.textureMaps)
        {
            return {
                map: createConfiguredTexture(descriptor, "albedo"),
                bumpMap: createConfiguredTexture(descriptor, "bump"),
                bumpScale: descriptor.bumpScale
            };
        }

        const textureParameters = {};

        for (const [textureKind, texturePath] of Object.entries(descriptor.textureMaps))
        {
            if (textureKind === "displacementMap" && !textureDisplacementEnabled)
            {
                continue;
            }

            textureParameters[textureKind] = createConfiguredImageTexture(texturePath, textureKind);
        }

        return textureParameters;
    }

    // Creates or reuses one shared material variant per descriptor. This is the material that should be assigned to meshes, while the texture parameters can be overridden by mesh UVs and material properties as needed.
    function getSharedMaterial(cacheKey, descriptor, options = {})
    {
        if (!sharedMaterialCache.has(cacheKey))
        {
            const textureParameters = createMaterialTextureParameters(descriptor);
            const {
                specularMap,
                ...materialTextureParameters
            } = textureParameters;
            const minimumRoughness =
                descriptor.surfaceKind === "wall" || descriptor.surfaceKind === "ceiling"
                    ? (descriptor.family === "iceCave" ? 0.22 : 0.86)
                    : (descriptor.family === "iceCave" ? 0.26 : 0.76);
            const maximumMetalness =
                descriptor.surfaceKind === "wall" || descriptor.surfaceKind === "ceiling"
                    ? (descriptor.family === "iceCave" ? 0.14 : 0.035)
                    : (descriptor.family === "iceCave" ? 0.12 : 0.06);
            const materialParameters = {
                color: options.color ?? descriptor.color ?? "#ffffff",
                ...materialTextureParameters,
                roughness: Math.max(options.roughness ?? descriptor.roughness, minimumRoughness),
                metalness: Math.min(options.metalness ?? descriptor.metalness, maximumMetalness),
                emissive: options.emissive ?? descriptor.emissive,
                emissiveIntensity: options.emissiveIntensity ?? descriptor.emissiveIntensity,
                envMapIntensity: options.envMapIntensity ?? descriptor.envMapIntensity ?? 0,
                side: options.side ?? THREE.FrontSide
            };

            if (specularMap && !textureParameters.roughnessMap)
            {
                materialParameters.roughnessMap = specularMap;
            }

            if (textureParameters.bumpMap)
            {
                materialParameters.bumpScale = options.bumpScale ?? textureParameters.bumpScale;
            }

            if (textureParameters.normalMap && descriptor.normalScale)
            {
                materialParameters.normalScale = new THREE.Vector2(
                    Math.min(options.normalScale ?? descriptor.normalScale, 1.55),
                    Math.min(options.normalScale ?? descriptor.normalScale, 1.55)
                );
            }

            if (textureParameters.aoMap)
            {
                materialParameters.aoMapIntensity = options.aoMapIntensity ?? descriptor.aoMapIntensity ?? 1.15;
            }

            if (textureParameters.displacementMap)
            {
                const rawDisplacementScale = options.displacementScale ?? descriptor.displacementScale ?? 0.1;
                const rawDisplacementBias = options.displacementBias ?? descriptor.displacementBias ?? 0;
                const displacementScaleBoost = options.displacementScaleBoost ?? descriptor.displacementScaleBoost ?? 2.9;
                const displacementBiasBoost = options.displacementBiasBoost ?? descriptor.displacementBiasBoost ?? 1.65;

                materialParameters.displacementScale = textureDisplacementEnabled
                    ? rawDisplacementScale * displacementScaleBoost
                    : 0;
                materialParameters.displacementBias = textureDisplacementEnabled
                    ? rawDisplacementBias * displacementBiasBoost
                    : 0;
            }

            const material = new THREE.MeshStandardMaterial(materialParameters);
            material.shadowSide = options.shadowSide ?? THREE.FrontSide;
            material.userData.displacementScale = (options.displacementScale ?? descriptor.displacementScale ?? 0.1)
                * (options.displacementScaleBoost ?? descriptor.displacementScaleBoost ?? 2.9);
            material.userData.displacementBias = (options.displacementBias ?? descriptor.displacementBias ?? 0)
                * (options.displacementBiasBoost ?? descriptor.displacementBiasBoost ?? 1.65);
            material.userData.displacementEdgeFade = options.displacementEdgeFade ?? descriptor.displacementEdgeFade ?? descriptor.displacementEdgeFadeDistance ?? 0.11;
            material.userData.displacementCornerFadePower = options.displacementCornerFadePower ?? descriptor.displacementCornerFadePower ?? 1.45;
            material.userData.displacementContrast = options.displacementContrast ?? descriptor.displacementContrast ?? 3.4;
            material.userData.displacementSharpness = options.displacementSharpness ?? descriptor.displacementSharpness ?? 2.45;

            // Fade geometry displacement only at the outer edge of each tile face. This keeps
            // neighboring tiles from separating at corners while still letting the texture relief
            // stay strong across the face interior.
            material.onBeforeCompile = (shader) =>
            {
                shader.uniforms.displacementEdgeFade = { value: material.userData.displacementEdgeFade };
                shader.uniforms.displacementCornerFadePower = { value: material.userData.displacementCornerFadePower };
                shader.uniforms.displacementContrast = { value: material.userData.displacementContrast };
                shader.uniforms.displacementSharpness = { value: material.userData.displacementSharpness };

                const stockChunk = '#include <displacementmap_vertex>';

                if (!shader.vertexShader.includes(stockChunk))
                {
                    return;
                }

                // Injects a function to calculate a fade mask based on distance to the edge of the tile, then applies that mask to the displacement effect in the vertex shader. Was found on a couple of forums to be a common approach for fixing displacement seams.
                shader.vertexShader = shader.vertexShader
                    .replace(
                        'void main() {',
                        [
                            'attribute vec2 tileEdgeMaskUv;',
                            'uniform float displacementEdgeFade;',
                            'uniform float displacementCornerFadePower;',
                            'uniform float displacementContrast;',
                            'uniform float displacementSharpness;',
                            'float mazeDisplacementEdgeMask(vec2 edgeMaskUv) {',
                            '    vec2 clampedUv = clamp(edgeMaskUv, 0.0, 1.0);',
                            '    vec2 distanceToEdge = min(clampedUv, 1.0 - clampedUv);',
                            '    float edgeDistance = min(distanceToEdge.x, distanceToEdge.y);',
                            '    float mask = smoothstep(0.0, max(displacementEdgeFade, 0.0001), edgeDistance);',
                            '    return pow(mask, max(displacementCornerFadePower, 0.0001));',
                            '}',
                            'float mazeSharpenDisplacementSample(float sampleValue) {',
                            '    float contrasted = clamp((sampleValue - 0.5) * displacementContrast + 0.5, 0.0, 1.0);',
                            '    if (contrasted < 0.5) {',
                            '        return 0.5 * pow(max(contrasted * 2.0, 0.0), displacementSharpness);',
                            '    }',
                            '    return 1.0 - 0.5 * pow(max((1.0 - contrasted) * 2.0, 0.0), displacementSharpness);',
                            '}',
                            'void main() {'
                        ].join("\n")
                    )
                    .replace(
                        stockChunk,
                        [
                            '#ifdef USE_DISPLACEMENTMAP',
                            '    float displacementEdgeMask = mazeDisplacementEdgeMask(tileEdgeMaskUv);',
                            '    float displacementSample = mazeSharpenDisplacementSample(texture2D(displacementMap, vUv).x);',
                            '    float displacementValue = displacementSample * displacementScale + displacementBias;',
                            '    transformed += normalize(objectNormal) * displacementValue * displacementEdgeMask;',
                            '#endif'
                        ].join("\n")
                    );
            };

            sharedMaterialCache.set(cacheKey, material);
            ownedMaterialSet.add(material);
        }

        return sharedMaterialCache.get(cacheKey);
    }

    // Clones a base geometry and tracks it so rebuilds can dispose the UV-mapped copies.
    function cloneTrackedGeometry(baseGeometry)
    {
        let geometry = baseGeometry.clone();

        if (geometry.index)
        {
            const nonIndexedGeometry = geometry.toNonIndexed();
            geometry.dispose();
            geometry = nonIndexedGeometry;
        }

        ownedGeometrySet.add(geometry);
        return geometry;
    }

    // Writes world-aligned UVs for horizontal surfaces like floors and ceilings.
    function createHorizontalUvGeometry(baseGeometry, descriptor, placement)
    {
        const geometry = cloneTrackedGeometry(baseGeometry);
        const positionAttribute = geometry.getAttribute("position");
        const uvAttribute = geometry.getAttribute("uv");
        const tileSize = placement.tileSize ?? tileWorldSize;
        const edgeMaskUv = new Float32Array(uvAttribute.count * 2);

        for (let index = 0; index < uvAttribute.count; index++)
        {
            const localX = positionAttribute.getX(index);
            const localZ = positionAttribute.getZ(index);
            const worldX = placement.worldX + localX;
            const worldZ = placement.worldZ + localZ;

            uvAttribute.setXY(
                index,
                (worldX / tileSize) * descriptor.repeatX,
                (worldZ / tileSize) * descriptor.repeatY
            );

            edgeMaskUv[(index * 2)] = THREE.MathUtils.clamp((localX / tileSize) + 0.5, 0, 1);
            edgeMaskUv[(index * 2) + 1] = THREE.MathUtils.clamp((localZ / tileSize) + 0.5, 0, 1);
        }

        uvAttribute.needsUpdate = true;
        geometry.setAttribute("uv2", new THREE.BufferAttribute(uvAttribute.array.slice(), 2));
        geometry.setAttribute("tileEdgeMaskUv", new THREE.BufferAttribute(edgeMaskUv, 2));
        return geometry;
    }

    // Writes world-aligned UVs for the six faces of a wall box.
    function createWallUvGeometry(baseGeometry, descriptor, placement)
    {
        const geometry = cloneTrackedGeometry(baseGeometry);
        const positionAttribute = geometry.getAttribute("position");
        const normalAttribute = geometry.getAttribute("normal");
        const uvAttribute = geometry.getAttribute("uv");
        const tileSize = placement.tileSize ?? tileWorldSize;
        const wallHeight = placement.wallHeight ?? wallWorldHeight;
        const floorY = placement.floorY ?? worldFloorY;
        const wallCenterY = placement.worldY ?? (floorY + wallHeight / 2);
        const edgeMaskUv = new Float32Array(uvAttribute.count * 2);

        for (let index = 0; index < uvAttribute.count; index++)
        {
            const localX = positionAttribute.getX(index);
            const localY = positionAttribute.getY(index);
            const localZ = positionAttribute.getZ(index);
            const worldX = placement.worldX + positionAttribute.getX(index);
            const worldY = wallCenterY + positionAttribute.getY(index);
            const worldZ = placement.worldZ + positionAttribute.getZ(index);
            const normalX = Math.abs(normalAttribute.getX(index));
            const normalY = Math.abs(normalAttribute.getY(index));
            let u = 0;
            let v = 0;

            if (normalY > 0.5)
            {
                u = (worldX / tileSize) * descriptor.repeatX;
                v = (worldZ / tileSize) * descriptor.repeatY;
                edgeMaskUv[(index * 2)] = THREE.MathUtils.clamp((localX / tileSize) + 0.5, 0, 1);
                edgeMaskUv[(index * 2) + 1] = THREE.MathUtils.clamp((localZ / tileSize) + 0.5, 0, 1);
            }
            else if (normalX > 0.5)
            {
                u = (worldZ / tileSize) * descriptor.repeatX;
                v = ((worldY - floorY) / wallHeight) * descriptor.repeatY;
                edgeMaskUv[(index * 2)] = THREE.MathUtils.clamp((localZ / tileSize) + 0.5, 0, 1);
                edgeMaskUv[(index * 2) + 1] = THREE.MathUtils.clamp((localY / wallHeight) + 0.5, 0, 1);
            }
            else
            {
                u = (worldX / tileSize) * descriptor.repeatX;
                v = ((worldY - floorY) / wallHeight) * descriptor.repeatY;
                edgeMaskUv[(index * 2)] = THREE.MathUtils.clamp((localX / tileSize) + 0.5, 0, 1);
                edgeMaskUv[(index * 2) + 1] = THREE.MathUtils.clamp((localY / wallHeight) + 0.5, 0, 1);
            }

            uvAttribute.setXY(index, u, v);
        }

        uvAttribute.needsUpdate = true;
        geometry.setAttribute("uv2", new THREE.BufferAttribute(uvAttribute.array.slice(), 2));
        geometry.setAttribute("tileEdgeMaskUv", new THREE.BufferAttribute(edgeMaskUv, 2));
        return geometry;
    }

    // Ceilings reuse the real floor texture pack for the tile's base surface. Special pads keep
    // their gameplay floor material, but ceilings above them still match the surrounding floor.
    function resolveCeilingKey(currentCell)
    {
        return (
            currentCell.baseFloorType ??
            currentCell.floorType ??
            currentCell.themeName ??
            "neutralCeiling"
        );
    }

    // Teleport orbs keep their per-pair color but still use a shared cache for efficiency.
    function getTeleportMaterial(colorKey)
    {
        if (!teleportMaterialCache.has(colorKey))
        {
            const color = new THREE.Color(colorKey);

            teleportMaterialCache.set(
                colorKey,
                new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color.clone().multiplyScalar(0.92),
                    emissiveIntensity: 2.9,
                    metalness: 0.02,
                    roughness: 0.78,
                    envMapIntensity: 0,
                    toneMapped: false
                })
            );
        }

        return teleportMaterialCache.get(colorKey);
    }

    return {
        createFloorMaterialInstance(currentCell, placement)
        {
            const descriptor = createSurfaceDescriptor("floor", currentCell.floorType ?? "neutralFloor");
            return getSharedMaterial(
                `floor:${descriptor.key}`,
                descriptor
            );
        },

        createFloorGeometry(baseGeometry, currentCell, placement)
        {
            const descriptor = createSurfaceDescriptor("floor", currentCell.floorType ?? "neutralFloor");
            return createHorizontalUvGeometry(baseGeometry, descriptor, placement);
        },

        createCeilingMaterialInstance(currentCell, placement)
        {
            const descriptor = createSurfaceDescriptor("ceiling", resolveCeilingKey(currentCell));
            return getSharedMaterial(
                `ceiling:${descriptor.key}`,
                descriptor,
                {
                    side: THREE.DoubleSide
                }
            );
        },

        createCeilingGeometry(baseGeometry, currentCell, placement)
        {
            const descriptor = createSurfaceDescriptor("ceiling", resolveCeilingKey(currentCell));
            return createHorizontalUvGeometry(baseGeometry, descriptor, placement);
        },

        createWallMaterialSet(wallMaterialKey, placement)
        {
            const descriptor = createSurfaceDescriptor("wall", wallMaterialKey ?? "voidRockWall");
            const cacheKey = `wallSet:${descriptor.key}`;

            if (!wallMaterialSetCache.has(cacheKey))
            {
                const sideRepeatY = descriptor.repeatY * Math.max(1, wallWorldHeight / Math.max(tileWorldSize, 0.001));
                const sideMaterial = getSharedMaterial(
                    `${cacheKey}:side`,
                    descriptor
                );
                const topMaterial = getSharedMaterial(
                    `${cacheKey}:top`,
                    descriptor
                );
                const bottomMaterial = getSharedMaterial(
                    `${cacheKey}:bottom`,
                    descriptor,
                    {
                        roughness: Math.min(1, descriptor.roughness + 0.08),
                        metalness: Math.max(0, descriptor.metalness - 0.04)
                    }
                );

                wallMaterialSetCache.set(cacheKey, [
                    sideMaterial,
                    sideMaterial,
                    topMaterial,
                    bottomMaterial,
                    sideMaterial,
                    sideMaterial
                ]);
            }

            return wallMaterialSetCache.get(cacheKey);
        },

        createWallGeometry(baseGeometry, wallMaterialKey, placement)
        {
            const descriptor = createSurfaceDescriptor("wall", wallMaterialKey ?? "voidRockWall");
            return createWallUvGeometry(baseGeometry, descriptor, placement);
        },

        getTeleportMaterial,

        whenTexturesReady()
        {
            return Promise.all(textureLoadPromises);
        },

        setTextureDisplacementEnabled(enabled)
        {
            textureDisplacementEnabled = !!enabled;

            for (const material of ownedMaterialSet)
            {
                if (!material.displacementMap)
                {
                    continue;
                }

                material.displacementScale = textureDisplacementEnabled
                    ? material.userData.displacementScale ?? 0.1
                    : 0;
                material.displacementBias = textureDisplacementEnabled
                    ? material.userData.displacementBias ?? 0
                    : 0;
                material.needsUpdate = true;
            }
        },

        // Releases the cached materials and textures when a maze world is rebuilt.
        dispose()
        {
            for (const material of ownedMaterialSet)
            {
                material.dispose();
            }

            for (const material of teleportMaterialCache.values())
            {
                material.dispose();
            }

            for (const texture of ownedTextureSet)
            {
                texture.dispose();
            }

            for (const texture of baseTextureCache.values())
            {
                texture.dispose();
            }

            for (const geometry of ownedGeometrySet)
            {
                geometry.dispose();
            }

            sharedMaterialCache.clear();
            wallMaterialSetCache.clear();
            ownedGeometrySet.clear();
            ownedMaterialSet.clear();
            teleportMaterialCache.clear();
            ownedTextureSet.clear();
            baseTextureCache.clear();
        }
    };
}
