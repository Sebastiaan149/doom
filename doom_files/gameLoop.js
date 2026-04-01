// This file provides the shared animation loop for the game that updates gameplay objects every frame.
// The loop is as follows: any object with a `tick(delta)` method can be registered.

// Handles the shared animation loop and the list of tickable objects.
class Loop
{
    // Stores the render objects and the list of animated updatables.
    constructor(camera, scene, renderer)
    {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
        this.updatables = [];
        this.clock = new THREE.Clock();
    }

    // Starts the browser animation loop.
    start()
    {
        this.renderer.setAnimationLoop(() =>
        {
            this.tick();
            this.renderer.render(this.scene, this.camera);
        });
    }

    // Stops the browser animation loop.
    stop()
    {
        this.renderer.setAnimationLoop(null);
    }

    // Advances every registered updatable by the frame delta.
    tick()
    {
        // Capping the delta at a maximum value prevented large jumps in movement when the tab is inactive or the framerate drops.
        const delta = Math.min(this.clock.getDelta(), 0.05);

        for (const object of this.updatables)
        {
            if (object.tick)
            {
                object.tick(delta);
            }
        }
    }
}
