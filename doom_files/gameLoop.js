// This file provides the shared animation loop that updates gameplay objects every frame.
// The loop is intentionally simple: any object with a `tick(delta)` method can be registered.

// Advances the simulation and rendering once per browser animation frame.
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
        // Clamping the delta keeps movement stable after tab switches or slow frames.
        // Without this, one large frame could create a giant movement step and break collision.
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
