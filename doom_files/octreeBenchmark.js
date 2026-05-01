// Lightweight octree build benchmark helper.
(function()
{
    // Uses the most precise timer available in the current browser.
    function now()
    {
        return (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
    }

    // Creates a predictable spread of boxes so benchmark runs do not depend on maze generation.
    function createEntries(count, options = {})
    {
        const tileSize = options.tileSize ?? 1;
        const wallHeight = options.wallHeight ?? 1;
        const wallY = options.wallY ?? 0.5;
        const entries = new Array(count);

        // Arrange boxes on a loose grid so they do not collapse into one tiny bounding box.
        const columns = Math.ceil(Math.sqrt(count));
        const spacing = tileSize * 1.1;

        for (let index = 0; index < count; index++)
        {
            const x = (index % columns) * spacing;
            const z = Math.floor(index / columns) * spacing;
            const center = new THREE.Vector3(x, wallY, z);
            const box = new THREE.Box3().setFromCenterAndSize(
                center,
                new THREE.Vector3(tileSize, wallHeight, tileSize)
            );

            entries[index] = {
                box,
                type: "wall",
                cell: { idx: index }
            };
        }

        return entries;
    }

    // Summarizes a timing series so different octree sizes are easier to compare.
    function statsFromArray(values)
    {
        const count = values.length;

        if (count === 0)
        {
            return null;
        }

        const sorted = values.slice().sort((first, second) => first - second);
        const sum = values.reduce((accumulator, value) => accumulator + value, 0);
        const mean = sum / count;
        const squaredDistanceSum = values.reduce(
            (accumulator, value) => accumulator + (value - mean) * (value - mean),
            0
        );

        return {
            mean,
            std: Math.sqrt(squaredDistanceSum / count),
            min: sorted[0],
            max: sorted[count - 1],
            median: count % 2 === 1
                ? sorted[(count - 1) / 2]
                : (sorted[(count / 2) - 1] + sorted[count / 2]) / 2
        };
    }

    // Measures octree build time across several entry counts.
    async function benchmarkOctreeSizes(options = {})
    {
        const sizes = options.sizes ?? [10, 100, 1000, 10000, 100000];
        const results = [];

        for (const size of sizes)
        {
            console.info(`Benchmarking octree build for ${size} entries...`);

            const entries = createEntries(size, options);
            const runs = options.runsPerSize ?? 100;

            // Warm up once so the first measured run does not include obvious setup noise.
            createCollisionOctree(entries);
            await new Promise((resolve) => setTimeout(resolve, 20));

            const times = [];

            for (let runIndex = 0; runIndex < runs; runIndex++)
            {
                const startTime = now();
                const octree = createCollisionOctree(entries);
                const endTime = now();
                const measuredTime = (typeof octree.buildTimeMs === "number" && Number.isFinite(octree.buildTimeMs))
                    ? octree.buildTimeMs
                    : (endTime - startTime);

                times.push(measuredTime);

                // Yield occasionally so large runs do not lock the whole browser tab.
                if (runIndex % 16 === 15)
                {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }

            const stats = statsFromArray(times);
            const meanUs = stats.mean * 1000;
            const result = {
                size,
                runs,
                meanMs: stats.mean,
                meanUs,
                stdMs: stats.std,
                minMs: stats.min,
                maxMs: stats.max,
                medianMs: stats.median
            };

            console.info(
                `Result for ${size} entries: mean ${result.meanMs.toFixed(6)} ms (${Math.round(meanUs)} us), std ${result.stdMs.toFixed(6)} ms`
            );
            results.push(result);

            // Let the browser breathe before the next size.
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        console.table(results.map((result) =>
        {
            return {
                size: result.size,
                runs: result.runs,
                mean_ms: result.meanMs.toFixed(6),
                mean_us: Math.round(result.meanUs),
                std_ms: result.stdMs.toFixed(6),
                min_ms: result.minMs.toFixed(6),
                max_ms: result.maxMs.toFixed(6)
            };
        }));

        return results;
    }

    // Expose the helper globally so it can be called directly from the browser console.
    window.benchmarkOctreeSizes = benchmarkOctreeSizes;

    // Also provide a short alias that uses the default benchmark settings.
    window.benchOctree = benchmarkOctreeSizes;

    // Convenience wrapper that can be awaited directly from the browser console.
    window.runOctreeBench = async (options) =>
    {
        try
        {
            const results = await benchmarkOctreeSizes(options);
            console.table(results);
            return results;
        }
        catch (err)
        {
            console.error(err);
            throw err;
        }
    };

    console.info("Octree benchmark helper usable: call `await benchmarkOctreeSizes()` or `await runOctreeBench()`");
})();
