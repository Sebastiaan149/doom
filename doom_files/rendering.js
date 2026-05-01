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

// Theme presets define the shared sky rig that still flows into the maze's indoor lighting subtly.
// Certain maps sometimes felt too dark or too bright with the same sky rig.
const THEME_LIGHT_PRESETS = {
    castle: {
        skyTop: 0x080f1c,
        skyBottom: 0x18243a,
        hemiSky: 0x9fb0d0,
        hemiGround: 0x221b28,
        hemiIntensity: 0.22,
        ambientIntensity: 0.035,
        sunColor: 0xe2ebff,
        sunIntensity: 2.25,
        sphereColor: 0xe6edff,
        sphereScale: 1.45,
        sphereName: "moonSphere",
        position: new THREE.Vector3(-82, 128, -92)
    },
    industrial: {
        skyTop: 0x112318,
        skyBottom: 0x203326,
        hemiSky: 0x90a78d,
        hemiGround: 0x182019,
        hemiIntensity: 0.22,
        ambientIntensity: 0.035,
        sunColor: 0xdcf8c8,
        sunIntensity: 2.1,
        sphereColor: 0xdff8ce,
        sphereScale: 1.45,
        sphereName: "moonSphere",
        position: new THREE.Vector3(82, 128, -92)
    },
    oldForestTemple: {
        skyTop: 0x1f3b22,
        skyBottom: 0x31532f,
        hemiSky: 0xb5d49d,
        hemiGround: 0x222f1c,
        hemiIntensity: 0.28,
        ambientIntensity: 0.045,
        sunColor: 0xfff3ba,
        sunIntensity: 2.8,
        sphereColor: 0xfff4c4,
        sphereScale: 1.5,
        sphereName: "sunSphere",
        position: new THREE.Vector3(0, 142, -105)
    },
    fireCave: {
        skyTop: 0x5a1515,
        skyBottom: 0x8e221c,
        hemiSky: 0xe28357,
        hemiGround: 0x32110d,
        hemiIntensity: 0.28,
        ambientIntensity: 0.045,
        sunColor: 0xffd17a,
        sunIntensity: 2.65,
        sphereColor: 0xffc85c,
        sphereScale: 1.5,
        sphereName: "sunSphere",
        position: new THREE.Vector3(45, 138, -98)
    },
    iceCave: {
        skyTop: 0xd3f0ff,
        skyBottom: 0xa6cfeb,
        hemiSky: 0xf8feff,
        hemiGround: 0x8eaec2,
        hemiIntensity: 0.32,
        ambientIntensity: 0.055,
        sunColor: 0xf8ffff,
        sunIntensity: 2.65,
        sphereColor: 0xf8ffff,
        sphereScale: 1.45,
        sphereName: "sunSphere",
        position: new THREE.Vector3(-45, 132, -96)
    },
    random: {
        skyTop: 0x9fd8f2,
        skyBottom: 0xd7f0fb,
        hemiSky: 0xeef9ff,
        hemiGround: 0x8daca6,
        hemiIntensity: 0.32,
        ambientIntensity: 0.06,
        sunColor: 0xfff2c7,
        sunIntensity: 2.45,
        sphereColor: 0xfff6da,
        sphereScale: 1.4,
        sphereName: "sunSphere",
        position: new THREE.Vector3(0, 136, -100)
    }
};

// Builds the shared base light rig that supports the local in-maze light sources.
function createLights(theme = "random", environment = null)
{
    const group = new THREE.Group();
    group.name = "mazeBaseLights";

    const preset = {
        ...(THEME_LIGHT_PRESETS[theme] ?? THEME_LIGHT_PRESETS.random),
        ...(environment ?? {})
    };

    // General settings for the sky rig:
    const hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
    const ambient = new THREE.AmbientLight(0xffffff, preset.ambientIntensity);
    const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
    const sunTarget = new THREE.Object3D();
    const sunDirection = (preset.position ?? THEME_LIGHT_PRESETS.random.position).clone().normalize();
    const sunDistance = preset.sunDistance ?? 170;
    const skySphereDistance = preset.skySphereDistance ?? 155;
    const shadowFocus = new THREE.Vector3(0, preset.shadowFocusY ?? -3, 0);
    const trackedCameraPosition = new THREE.Vector3();
    const sunSphere = new THREE.Mesh(
        new THREE.SphereGeometry(13, 32, 32),
        new THREE.MeshBasicMaterial({
            color: preset.sphereColor,
            toneMapped: false
        })
    );

    // Although the current implementation does not use actual shadows from the sun (ceilings and walls are mostly lit by the hemisphere light), we left this in if we would later want to remove the ceilings and add general shadowing from the sun.
    sun.name = "globalShadowLight";
    sun.position.copy(preset.position);
    sun.target = sunTarget;
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    sun.shadow.camera.left = -78;
    sun.shadow.camera.right = 78;
    sun.shadow.camera.top = 78;
    sun.shadow.camera.bottom = -78;
    sun.shadow.bias = -0.00002;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 4.0;
    sunSphere.name = preset.sphereName ?? "skyLightSphere";
    sunSphere.scale.setScalar(preset.sphereScale ?? 1);

    function updateSunRig()
    {
        if (group.userData.trackedCamera)
        {
            trackedCameraPosition.copy(group.userData.trackedCamera.position);
            shadowFocus.x = trackedCameraPosition.x;
            shadowFocus.z = trackedCameraPosition.z;
        }

        sunTarget.position.copy(shadowFocus);
        sun.position.copy(shadowFocus).addScaledVector(sunDirection, sunDistance);
        sunSphere.position.copy(shadowFocus).addScaledVector(sunDirection, skySphereDistance);
        sun.shadow.camera.updateProjectionMatrix();
    }

    group.trackCamera = (camera) =>
    {
        group.userData.trackedCamera = camera ?? null;
        updateSunRig();
    };

    group.tick = () =>
    {
        updateSunRig();
    };

    updateSunRig();

    group.add(hemi, ambient, sun, sunTarget, sunSphere);
    return group;
}

// Gives the player a reliable local fill light.
// Even if it's dark, the user can still rely on this small light
function attachCameraLight(camera)
{
    const fillLight = new THREE.PointLight(0xfff3df, 2.65, 34, 1.35);
    const forwardLight = new THREE.SpotLight(0xfff5e8, 5.15, 54, Math.PI / 5.3, 0.58, 1.25);
    const target = new THREE.Object3D();

    fillLight.name = "playerFillLight";
    fillLight.position.set(0, -0.25, 0);

    forwardLight.name = "playerForwardLight";
    forwardLight.position.set(0, -0.1, 0);
    forwardLight.castShadow = false;
    forwardLight.shadow.mapSize.width = 1024;
    forwardLight.shadow.mapSize.height = 1024;
    forwardLight.shadow.bias = -0.00008;
    forwardLight.shadow.normalBias = 0.026;
    forwardLight.shadow.radius = 1.8;
    forwardLight.shadow.camera.near = 0.5;
    forwardLight.shadow.camera.far = 40;
    forwardLight.shadow.camera.fov = 32;
    target.name = "playerForwardLightTarget";
    target.position.set(0, -0.35, -10);
    forwardLight.target = target;

    camera.add(fillLight, forwardLight, target);
}

// Creates the base Three.js scene and its enclosed-atmosphere background.
function createScene()
{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d7eefc");
    scene.environment = null;
    scene.fog = new THREE.Fog("#d7eefc", 180, 470);
    return scene;
}

// Creates the WebGL renderer and applies the global rendering options.
function createRenderer()
{
    const renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "high-performance",
        stencil: false
    });

    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.SRGBColorSpace)
    {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    else
    {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
    renderer.domElement.className = "scene-canvas";

    return renderer;
}

// We initially researched this to create some "shadow depths" in the scene, but was too buggy and expensive to be worth it. We left it in for a possible later extension where we could add some dynamic shadowing from the emissive spheres in the sky rig.
function createScreenSpaceAmbientOcclusionRenderer(renderer, scene, camera)
{
    return {
        render()
        {
            renderer.render(scene, camera);
        },
        setSize() {},
        dispose() {}
    };
}

// Resizes the camera and renderer to match the current container size.
const setSize = (container, camera, renderer) =>
{
    // Perspective cameras need their aspect ratio updated whenever the canvas size changes.
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(container.clientWidth, container.clientHeight);

    // Capping the pixel ratio avoids paying a huge fill-rate cost on very dense displays.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
};

const setRenderSize = (container, camera, renderer, renderPipeline = null) =>
{
    setSize(container, camera, renderer);

    // If the render pipeline has a setSize function, we call it to allow the pipeline to resize any internal buffers it uses. This is important for any possible post-processing effects that rely on render targets, as those need to be the same size as the main renderer to avoid blurriness or other artifacts.
    if (renderPipeline?.setSize)
    {
        renderPipeline.setSize(
            renderer.domElement.width,
            renderer.domElement.height
        );
    }
};

// Keeps the renderer responsive when the browser window changes size.
class Resizer
{
    // Watches for browser resizes and keeps the render surface aligned with the container.
    constructor(container, camera, renderer, renderPipeline = null)
    {
        this.renderPipeline = renderPipeline;
        setRenderSize(container, camera, renderer, this.renderPipeline);

        window.addEventListener("resize", () =>
        {
            setRenderSize(container, camera, renderer, this.renderPipeline);
            this.onResize();
        });
    }

    // Placeholder hook for future resize-dependent logic.
    onResize() {}
}
