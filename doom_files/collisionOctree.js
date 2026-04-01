// This file implements a first version of the collision octree
// NOTE: this is still a very basic implementation and we noticed it is not working correctly yet as it puts all the objects into the root node and never subdivides. This will be corrected in the next part.


// Represents one node in the collision octree.
class CollisionOctreeNode
{
    // Stores the node bounds, its child nodes and the collision entries assigned to it.
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

                    // Pushes a new child node with the calculated bounds and the same options as the parent.
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

    // Returns the child node that can fully contain a collision box, or null if it does not fit completely inside any child.
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

        // Once the node gets too crowded, it subdivides and redistribute any entries that fit completely
        // inside a child. This keeps the tree balanced
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
            // If the query does not touch this node, we can skip it and all its children entirely.
            return results;
        }

        // Check every entry in this node for intersection with the query box.
        for (const entry of this.items)
        {
            if (entry.box.intersectsBox(queryBox))
            {
                results.push(entry);
            }
        }

        // If there are child nodes, we need to check them as well since the query box may overlap entries stored in different branches of the tree.
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
        // The root node encloses every wall box, then expands slightly so queries that touch the edges of the world can still find collisions (if it should happen)
        const rootBounds = entries[0].box.clone();

        for (let index = 1; index < entries.length; index++)
        {
            rootBounds.union(entries[index].box);
        }

        rootBounds.expandByScalar(this.options.padding);

        // Creates the root node and inserts every entry, which will recursively subdivide the tree as needed.
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
        // Reusing the same result array avoids a lots of unnecessary allocations during player movement.
        results.length = 0;

        if (!this.root)
        {
            return results;
        }

        return this.root.query(queryBox, results);
    }
}

// Helper function for creating an octree from an array of collision entries.
function createCollisionOctree(entries, options = {})
{
    return new CollisionOctree(entries, options);
}
