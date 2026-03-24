
function createCube() {
    const geometry = new THREE.BoxBufferGeometry(2, 2, 2);
    
    // if you want to color mesh with a single color, use this code below
    const material = new THREE.MeshStandardMaterial({
        color: 'red'
    });
    
    const cube = new THREE.Mesh(geometry, material);

    cube.rotation.set(-0.5, -0.1, 0.8);

    //const radiansPerSecond = 0.52;// corresponds to 30 degrees
    const radiansPerSecond = THREE.MathUtils.degToRad(30);

    // this method will be called once per frame
    cube.tick = (delta) => {
        // increase the cube's rotation each frame
        cube.rotation.z += radiansPerSecond * delta;
        cube.rotation.x += radiansPerSecond * delta;
        cube.rotation.y += radiansPerSecond * delta;
    };

    return cube;
}



function createCamera() {
    const camera = new THREE.PerspectiveCamera(
        35, // fov = Field Of View
        1, // dummy value for aspect ratio
        0.1, // near clipping plane
        100, // far clipping plane
    );
    camera.position.set(0, 0, 10);
    return camera;
}


function createLights() {
    const light = new THREE.DirectionalLight('white', 8);
    light.position.set(10, 10, 10);
    return light;
}


function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('skyblue');
    return scene;
}


function createRenderer() {
    const renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.physicallyCorrectLights = true;
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
            // tell every animated object to tick forward one frame
            this.tick();

            // render a frame
            this.renderer.render(this.scene, this.camera);
        });
    }

    stop() {
        this.renderer.setAnimationLoop(null);
    }

    tick() {
        // only call the getDelta function once per frame!
        const delta = clock.getDelta();

        // console.log(
        //   `The last frame rendered in ${delta * 1000} milliseconds`,
        // );

        for (const object of this.updatables) {
            object.tick(delta);
        }
    }
}


const setSize = (container, camera, renderer) => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
};


class Resizer {
    constructor(container, camera, renderer) {
        // set initial size
        setSize(container, camera, renderer);

        window.addEventListener('resize', () => {
            // set the size again if a resize occurs
            setSize(container, camera, renderer);
            // perform any custom actions
            this.onResize();
        });
    }

    onResize() {}
}





class World {
    constructor(container) {
        this.camera = createCamera();
        this.renderer = createRenderer();
        this.scene = createScene();
        this.loop = new Loop(this.camera, this.scene, this.renderer);
        container.append(this.renderer.domElement);

        const cube = createCube();
        const light = createLights();

        this.loop.updatables.push(cube);

        this.scene.add(cube, light);

        const resizer = new Resizer(container, this.camera, this.renderer);
    }

    render() {
        // draw a single frame
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

    // Get a reference to the container element
    const container = document.querySelector('#sceneContainer');

    // create a new world
    const world = new World(container);

    // start the animation loop
    world.start();
}

main();