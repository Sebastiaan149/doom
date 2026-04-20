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

// Builds the shared base light rig that supports the local in-maze light sources.
// The maze should feel like an enclosed space, so this rig stays intentionally subtle.
function createLights()
{
    const group = new THREE.Group();
    group.name = "mazeBaseLights";

    // A low hemisphere light prevents the unlit side of the maze from going fully black,
    // while still leaving enough contrast for the decorative point lights to shape the space.
    const hemi = new THREE.HemisphereLight(0x4d739c, 0x17120f, 0.62);

    // A faint ambient lift keeps surfaces readable between local light pools.
    const ambient = new THREE.AmbientLight(0xdce7f7, 0.34);

    group.add(hemi, ambient);
    return group;
}

// Creates the base Three.js scene and its enclosed-atmosphere background.
function createScene()
{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101923");
    scene.fog = new THREE.Fog("#101923", 120, 320);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
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
