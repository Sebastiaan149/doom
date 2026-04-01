// This file contains the shared scene, camera, renderer, lighting and resize helpers.

// Creates the perspective camera used by the first-person controller.
function createCamera(options = {})
{
    const camera = new THREE.PerspectiveCamera(
        options.fov ?? 75,
        1,
        options.near ?? 0.1,
        options.far ?? 300
    );

    // `YXZ` is important for first-person controls:
    // yaw is applied around Y first
    // pitch is applied around X second
    camera.rotation.order = "YXZ";
    camera.position.set(0, 0, 0);

    return camera;
}

// Builds the light rig that illuminates the maze.
// TODO: still needs to be fixed with shadows and such
function createLights()
{
    const group = new THREE.Group();

    // A directional light acts like the "sun" and gives strong readable shadows.
    const sun = new THREE.DirectionalLight("white", 3.5);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;

    // The hemisphere and ambient lights fill in the dark areas so the maze remains readable
    // even without detailed local light sources.
    // These will still be changed in a later stage
    const hemi = new THREE.HemisphereLight(0xddeeff, 0x444444, 1.3);
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);

    group.add(sun, hemi, ambient);
    //group.add(sun, ambient);
    return group;
}

// Creates the base Three.js scene and its background color.
function createScene()
{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#6fb5e9");
    return scene;
}

// Creates the WebGL renderer and applies the global rendering options.
function createRenderer()
{
    const renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "scene-canvas";

    return renderer;
}

// Resizes the camera and renderer to match the current container size.
const setSize = (container, camera, renderer) =>
{
    // Perspective cameras need their aspect ratio updated whenever the canvas size changes.
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(container.clientWidth, container.clientHeight);

    // Capping the pixel ratio avoids paying a huge fill-rate cost on very dense displays.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

// Keeps the renderer responsive when the browser window changes size.
class Resizer
{
    // Watches for browser resizes and keeps the render surface aligned with the container.
    constructor(container, camera, renderer)
    {
        setSize(container, camera, renderer);

        window.addEventListener("resize", () =>
        {
            setSize(container, camera, renderer);
            this.onResize();
        });
    }

    // Placeholder hook for future resize-dependent logic.
    onResize() {}
}
