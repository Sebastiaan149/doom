// Lightweight octree build benchmark helper
// Usage (in browser console):
//   await window.benchmarkOctreeSizes();
(function()
{
    function now()
    {
        return (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
    }

    function createEntries(count, options = {})
    {
        const tileSize = options.tileSize ?? 1;
        const wallHeight = options.wallHeight ?? 1;
        const wallY = options.wallY ?? 0.5;

        const entries = new Array(count);

        // Arrange boxes on a loose grid so they don't collapse into a tiny bounding box
        const cols = Math.ceil(Math.sqrt(count));
        const spacing = tileSize * 1.1;

        for (let i = 0; i < count; i++)
        {
            const x = (i % cols) * spacing;
            const z = Math.floor(i / cols) * spacing;
            const center = new THREE.Vector3(x, wallY, z);
            const box = new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(tileSize, wallHeight, tileSize));
            entries[i] = { box, type: "wall", cell: { idx: i } };
        }

        return entries;
    }

    function statsFromArray(arr)
    {
        const n = arr.length;
        if (n === 0) return null;
        const sorted = arr.slice().sort((a,b) => a-b);
        const sum = arr.reduce((s,v) => s+v, 0);
        const mean = sum / n;
        const sq = arr.reduce((s,v) => s + (v-mean)*(v-mean), 0);
        const std = Math.sqrt(sq / n);
        return {
            mean,
            std,
            min: sorted[0],
            max: sorted[n-1],
            median: (n%2===1) ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2
        };
    }

    async function benchmarkOctreeSizes(options = {})
    {
        const sizes = options.sizes ?? [10, 100, 1000, 10000, 100000];
        const results = [];

        for (const size of sizes)
        {
            console.info(`Benchmarking octree build for ${size} entries...`);

            const entries = createEntries(size, options);

            // Use a fixed number of runs per size by default for consistent comparison.
            // Can be overridden by providing `runsPerSize` in options.
            let runs = options.runsPerSize ?? 100;

            // Warm up once
            createCollisionOctree(entries);

            // Small delay so the browser can update and not block UI entirely
            await new Promise(r => setTimeout(r, 20));

            const times = [];
            for (let i = 0; i < runs; i++)
            {
                const t0 = now();
                const oct = createCollisionOctree(entries);
                const t1 = now();
                // Prefer octree's internal measurement when present
                const measured = (typeof oct.buildTimeMs === 'number' && Number.isFinite(oct.buildTimeMs))
                    ? oct.buildTimeMs
                    : (t1 - t0);
                times.push(measured);

                // Yield occasionally to avoid locking the UI for large runs
                if (i % 16 === 15) await new Promise(r => setTimeout(r, 0));
            }

            const s = statsFromArray(times);
            const meanMs = s.mean;
            const meanUs = meanMs * 1000;

            const result = {
                size,
                runs,
                meanMs,
                meanUs,
                stdMs: s.std,
                minMs: s.min,
                maxMs: s.max,
                medianMs: s.median
            };

            console.info(`Result for ${size} entries: mean ${meanMs.toFixed(6)} ms (${Math.round(meanUs)} µs), std ${s.std.toFixed(6)} ms`);
            results.push(result);

            // Let the browser breathe before the next size.
            await new Promise(r => setTimeout(r, 50));
        }

        console.table(results.map(r => ({
            size: r.size,
            runs: r.runs,
            mean_ms: r.meanMs.toFixed(6),
            mean_us: Math.round(r.meanUs),
            std_ms: r.stdMs.toFixed(6),
            min_ms: r.minMs.toFixed(6),
            max_ms: r.maxMs.toFixed(6)
        })));

        return results;
    }

    // Expose to the global scope for interactive use (seboeboe / browser console)
    window.benchmarkOctreeSizes = benchmarkOctreeSizes;

    // Also provide a short alias that uses defaults
    window.benchOctree = benchmarkOctreeSizes;

    console.info('Octree benchmark helper installed: call `await benchmarkOctreeSizes()`');
})();
