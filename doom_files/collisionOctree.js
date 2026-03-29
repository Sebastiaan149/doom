// This file implements a lightweight octree for broad-phase collision queries against wall boxes.
// The key idea is to partition space once when the maze is built, then reuse that structure
// every frame so collision checks only visit nearby wall boxes.

// Represents one node in the collision octree.
class CollisionOctreeNode
{
    // Stores the node bounds, its child nodes, and the collision entries assigned to it.
    constructor(bounds, options = {}, depth = 0)
    {
        this.bounds = bounds.clone();
        this.depth = depth;
        this.maxDepth = options.maxDepth ?? 6;
        this.maxItems = options.maxItems ?? 12;
        this.items = [];
        this.children = null;
    }

    // Splits the node into eight equally sized child boxes.
    subdivide()
    {
        const min = this.bounds.min;
        const max = this.bounds.max;
        const center = this.bounds.getCenter(new THREE.Vector3());

        this.children = [];

        for (let xIndex = 0; xIndex < 2; xIndex++)
        {
            for (let yIndex = 0; yIndex < 2; yIndex++)
            {
                for (let zIndex = 0; zIndex < 2; zIndex++)
                {
                    const childMin = new THREE.Vector3(
                        xIndex === 0 ? min.x : center.x,
                        yIndex === 0 ? min.y : center.y,
                        zIndex === 0 ? min.z : center.z
                    );

                    const childMax = new THREE.Vector3(
                        xIndex === 0 ? center.x : max.x,
                        yIndex === 0 ? center.y : max.y,
                        zIndex === 0 ? center.z : max.z
                    );

                    this.children.push(
                        new CollisionOctreeNode(
                            new THREE.Box3(childMin, childMax),
                            {
                                maxDepth: this.maxDepth,
                                maxItems: this.maxItems
                            },
                            this.depth + 1
                        )
                    );
                }
            }
        }
    }

    // Returns the child node that can fully contain a collision box, if any.
    getContainingChild(entryBox)
    {
        // Entries are only pushed deeper when one child fully contains them. If a box touches the
        // split plane, it stays in the current node so queries cannot accidentally miss it.
        if (!this.children)
        {
            return null;
        }

        for (const child of this.children)
        {
            if (child.bounds.containsBox(entryBox))
            {
                return child;
            }
        }

        return null;
    }

    // Inserts one collision entry into this node or one of its children.
    insert(entry)
    {
        if (this.children)
        {
            const containingChild = this.getContainingChild(entry.box);

            if (containingChild)
            {
                containingChild.insert(entry);
                return;
            }
        }

        this.items.push(entry);

        // Once the node gets crowded, subdivide and redistribute any entries that fit completely
        // inside a child. This keeps the tree shallow in empty areas and detailed in dense areas.
        if (!this.children && this.items.length > this.maxItems && this.depth < this.maxDepth)
        {
            this.subdivide();

            const retainedItems = [];

            for (const currentEntry of this.items)
            {
                const containingChild = this.getContainingChild(currentEntry.box);

                if (containingChild)
                {
                    containingChild.insert(currentEntry);
                }
                else
                {
                    retainedItems.push(currentEntry);
                }
            }

            this.items = retainedItems;
        }
    }

    // Collects every entry whose box overlaps the query box.
    query(queryBox, results)
    {
        if (!this.bounds.intersectsBox(queryBox))
        {
            // If the query does not touch this node, none of its children can possibly matter.
            return results;
        }

        for (const entry of this.items)
        {
            if (entry.box.intersectsBox(queryBox))
            {
                results.push(entry);
            }
        }

        if (this.children)
        {
            for (const child of this.children)
            {
                if (child.bounds.intersectsBox(queryBox))
                {
                    child.query(queryBox, results);
                }
            }
        }

        return results;
    }
}

// Builds and queries the root node for all wall collision boxes in the maze.
class CollisionOctree
{
    // Creates the root node and optionally inserts the provided collision entries.
    constructor(entries = [], options = {})
    {
        this.options = {
            maxDepth: options.maxDepth ?? 6,
            maxItems: options.maxItems ?? 12,
            padding: options.padding ?? 0.01
        };

        this.root = null;

        if (entries.length > 0)
        {
            this.build(entries);
        }
    }

    // Rebuilds the octree from a fresh set of collision entries.
    build(entries)
    {
        // The root node encloses every wall box, then expands slightly so edge-touching queries
        // still fall inside the tree bounds.
        const rootBounds = entries[0].box.clone();

        for (let index = 1; index < entries.length; index++)
        {
            rootBounds.union(entries[index].box);
        }

        rootBounds.expandByScalar(this.options.padding);

        this.root = new CollisionOctreeNode(rootBounds, this.options);

        for (const entry of entries)
        {
            // Entries keep their own copied Box3 so tree internals cannot accidentally mutate
            // any Box3 objects reused elsewhere in the code.
            this.root.insert({
                ...entry,
                box: entry.box.clone()
            });
        }

        return this;
    }

    // Returns every collision entry that overlaps the provided query box.
    query(queryBox, results = [])
    {
        // Reusing the same result array avoids a small allocation every frame during movement.
        results.length = 0;

        if (!this.root)
        {
            return results;
        }

        return this.root.query(queryBox, results);
    }
}

// Convenience helper for creating an octree from an array of collision entries.
function createCollisionOctree(entries, options = {})
{
    return new CollisionOctree(entries, options);
}
