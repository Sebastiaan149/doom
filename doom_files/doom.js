function createCube() {
    const geometry = new THREE.BoxBufferGeometry(3, 3, 3);

    const material = new THREE.MeshStandardMaterial({
        color: "red"
    });

    const cube = new THREE.Mesh(geometry, material);

    cube.castShadow = true;
    cube.rotation.set(-0.5, -0.1, 0.8);

    cube.tick = (delta) => {
        cube.rotation.z += delta * 0.5;
        cube.rotation.x += delta * 0.5;
        cube.rotation.y += delta * 0.5;
    };

    return cube;
}

function createPlane() {
    const geometry = new THREE.PlaneBufferGeometry(10, 10);
    const material = new THREE.MeshStandardMaterial({
        color: "white"
    });

    const plane = new THREE.Mesh(geometry, material);

    plane.receiveShadow = true;
    plane.rotation.x = Math.PI * -0.5;
    plane.position.y = -3;

    return plane;
}

function createCamera() {
    const camera = new THREE.PerspectiveCamera(
        45,
        1,
        0.1,
        300
    );

    camera.position.set(0, 100, 40);
    return camera;
}

function createLights() {
    const group = new THREE.Group();

    const sun = new THREE.DirectionalLight("white", 3.5);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;

    const hemi = new THREE.HemisphereLight(0xddeeff, 0x444444, 1.3);
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);

    group.add(sun, hemi, ambient);
    return group;
}

function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("skyblue");
    return scene;
}

function createRenderer() {
    const renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;

    return renderer;
}

const clock = new THREE.Clock();

class Loop {
    constructor(camera, scene, renderer) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
        this.updatables = [];
    }

    start() {
        this.renderer.setAnimationLoop(() => {
            this.tick();
            this.renderer.render(this.scene, this.camera);
        });
    }

    stop() {
        this.renderer.setAnimationLoop(null);
    }

    tick() {
        const delta = clock.getDelta();

        for (const object of this.updatables) {
            if (object.tick) {
                object.tick(delta);
            }
        }
    }
}

// Temporary controls for camera movement
class PlayerControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.moveSpeed = 8;
        this.mouseSensitivity = 0.002;

        this.pitch = 0;
        this.yaw = 0;

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };

        this.initEvents();
    }

    initEvents() {
        document.addEventListener("keydown", (e) => this.onKeyDown(e));
        document.addEventListener("keyup", (e) => this.onKeyUp(e));

        this.domElement.addEventListener("click", () => {
            this.domElement.requestPointerLock();
        });

        document.addEventListener("mousemove", (e) => this.onMouseMove(e));
    }

    onKeyDown(event) {
        switch (event.code) {
            case "KeyW": this.keys.forward = true; break;
            case "KeyS": this.keys.backward = true; break;
            case "KeyA": this.keys.left = true; break;
            case "KeyD": this.keys.right = true; break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case "KeyW": this.keys.forward = false; break;
            case "KeyS": this.keys.backward = false; break;
            case "KeyA": this.keys.left = false; break;
            case "KeyD": this.keys.right = false; break;
        }
    }

    onMouseMove(event) {
        if (document.pointerLockElement !== this.domElement) return;

        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;

        // Vertical look
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

        this.camera.rotation.set(this.pitch, this.yaw, 0);
    }

    update(delta) {
        this.direction.set(0, 0, 0);

        if (this.keys.forward) this.direction.z -= 1;
        if (this.keys.backward) this.direction.z += 1;
        if (this.keys.left) this.direction.x -= 1;
        if (this.keys.right) this.direction.x += 1;

        this.direction.normalize();

        const speed = this.moveSpeed * delta;

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        this.camera.position.addScaledVector(forward, this.direction.z * speed);
        this.camera.position.addScaledVector(right, this.direction.x * speed);
    }
}

const setSize = (container, camera, renderer) => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
};


// Resizer for handling window resizing and ensuring the camera and renderer adjust accordingly.
class Resizer {
    constructor(container, camera, renderer) {
        setSize(container, camera, renderer);

        window.addEventListener("resize", () => {
            setSize(container, camera, renderer);
            this.onResize();
        });
    }

    onResize() {}
}

// Create a maze map structure based on the generated maze
function createMazeTextureFromAscii(ascii, tileSize = 8) {
    const canvas = asciiToTileMapCanvas(ascii, tileSize);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return { canvas, texture };
}

function addMazeMapOverlay(container, options = {}) {
    const mazeWidth = options.mazeWidth ?? 25;
    const mazeHeight = options.mazeHeight ?? 15;
    const tileSize = options.tileSize ?? 8;
    const mainTheme = options.mainTheme ?? "random";

    // Generates the maze based on a theme
    const maze = generateMazeMap(mazeWidth, mazeHeight, {
        mainTheme: mainTheme
    });

    // Creates the map
    const result = createMazeTextureFromAscii(maze.ascii, tileSize);


    // Debugging
    window.generatedMaze = maze;
    window.generatedMazeAscii = maze.ascii;
    window.generatedMazeCanvas = result.canvas;
    window.generatedMazeTexture = result.texture;

    // Map positioning
    const mapWrapper = document.createElement("div");
    mapWrapper.style.position = "absolute";
    mapWrapper.style.top = "16px";
    mapWrapper.style.right = "16px";
    mapWrapper.style.padding = "8px";
    mapWrapper.style.background = "rgba(0, 0, 0, 0.65)";
    mapWrapper.style.border = "2px solid white";
    mapWrapper.style.borderRadius = "6px";
    mapWrapper.style.zIndex = "10";
    mapWrapper.style.boxShadow = "0 0 10px rgba(0,0,0,0.4)";

    const title = document.createElement("div");
    title.textContent = `Maze Map (${mainTheme})`;
    title.style.color = "white";
    title.style.fontFamily = "Arial, sans-serif";
    title.style.fontSize = "14px";
    title.style.marginBottom = "6px";
    title.style.textAlign = "center";

    result.canvas.style.display = "block";
    result.canvas.style.imageRendering = "pixelated";
    result.canvas.style.width = (maze.width * tileSize * 2) + "px";
    result.canvas.style.height = (maze.height * tileSize * 2) + "px";

    mapWrapper.appendChild(title);
    mapWrapper.appendChild(result.canvas);
    container.appendChild(mapWrapper);

    // Some console debugging
    console.log("Generated maze ascii:");
    console.log(maze.ascii);
    console.log("Teleport pairs:");
    console.log(maze.teleportPairs);

    return maze;
}

// General function to build the 3D maze world based on the generated maze data structure.
class World {
    constructor(container) {
        this.camera = createCamera();
        this.renderer = createRenderer();
        this.scene = createScene();

        this.loop = new Loop(this.camera, this.scene, this.renderer);
        container.append(this.renderer.domElement);

        // Still to optimize
        const lights = createLights();
        this.scene.add(lights);

        const maze = addMazeMapOverlay(container, {
            mazeWidth: 25,
            mazeHeight: 15,
            tileSize: 8,
            mainTheme: "oldForestTemple"
        });

        const mazeGroup = buildMazeWorldFromData(maze, {
            scene: this.scene,
            tileSize: 8,
            wallHeight: 5,
            floorY: -3
        });

        // Add player camera controls
        this.controls = new PlayerControls(this.camera, this.renderer.domElement);

        // Updates objects (todo)
        this.loop.updatables.push({
            tick: (delta) => {
                this.controls.update(delta);
            }
        });

        for (const child of mazeGroup.children) {
            if (child.tick) {
                this.loop.updatables.push(child);
            }
        }

        // Focus the camera on the center of the maze
        this.camera.lookAt(0, 0, 0);

        new Resizer(container, this.camera, this.renderer);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    start() {
        this.loop.start();
    }

    stop() {
        this.loop.stop();
    }
}

function main() {
    const container = document.querySelector("#sceneContainer");
    const world = new World(container);
    world.start();
}

main();