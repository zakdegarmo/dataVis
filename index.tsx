import * as THREE from 'three';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let camera: THREE.PerspectiveCamera, scene: THREE.Scene, renderer: THREE.WebGLRenderer;
let controls: FlyControls;
let clock: THREE.Clock;
let instancedMesh: THREE.InstancedMesh | null = null;
let dataString: string = '';
let initialText: THREE.Mesh | null = null;
let customTime = 0;
const dummy = new THREE.Object3D(); // Reusable object for matrix calculation
const color = new THREE.Color(); // Reusable color object

// UI Elements
const statusElement = document.getElementById('status') as HTMLElement;
const fileInputElement = document.getElementById('file-input') as HTMLInputElement;
const objectTypeSelectElement = document.getElementById('object-type-select') as HTMLSelectElement;
const shapeSelectElement = document.getElementById('shape-select') as HTMLSelectElement;
const spacingSliderElement = document.getElementById('spacing-slider') as HTMLInputElement;
const spacingValueElement = document.getElementById('spacing-value') as HTMLSpanElement;
const speedSliderElement = document.getElementById('speed-slider') as HTMLInputElement;
const speedValueElement = document.getElementById('speed-value') as HTMLSpanElement;
const knotControlsElement = document.getElementById('knot-controls') as HTMLElement;
const pSliderElement = document.getElementById('p-slider') as HTMLInputElement;
const pValueElement = document.getElementById('p-value') as HTMLSpanElement;
const qSliderElement = document.getElementById('q-slider') as HTMLInputElement;
const qValueElement = document.getElementById('q-value') as HTMLSpanElement;

function init() {
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 50, 600);

    controls = new FlyControls(camera, renderer.domElement);
    controls.movementSpeed = 200;
    controls.rollSpeed = Math.PI / 12;
    controls.autoForward = false;
    controls.dragToLook = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);
    
    // Initial Message
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
        const geometry = new TextGeometry('Upload any text file to begin', {
            font: font, size: 16, height: 2, curveSegments: 4,
        });
        geometry.center();
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        initialText = new THREE.Mesh(geometry, material);
        scene.add(initialText);
    });

    // Event Listeners
    fileInputElement.addEventListener('change', handleFileUpload, false);
    objectTypeSelectElement.addEventListener('change', renderData, false);
    shapeSelectElement.addEventListener('change', updateArrangement, false);

    const sliderUpdate = (valueEl: HTMLElement, suffix: string) => (event: Event) => {
        const target = event.target as HTMLInputElement;
        valueEl.textContent = `${parseFloat(target.value).toFixed(1)}${suffix}`;
        updateArrangement();
    };

    spacingSliderElement.addEventListener('input', sliderUpdate(spacingValueElement, 'x'));
    speedSliderElement.addEventListener('input', () => {
        const speedValue = parseFloat(speedSliderElement.value).toFixed(1);
        speedValueElement.textContent = `${speedValue}x`;
    });

    const knotParamUpdate = () => {
        pValueElement.textContent = pSliderElement.value;
        qValueElement.textContent = qSliderElement.value;
        const animationSpeed = parseFloat(speedSliderElement.value);
        if (shapeSelectElement.value === 'torus-klein-knot' && animationSpeed === 0) {
            updateAnimatedArrangement(customTime);
        }
    };
    pSliderElement.addEventListener('input', knotParamUpdate);
    qSliderElement.addEventListener('input', knotParamUpdate);

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    statusElement.textContent = `Loading ${file.name}...`;
    const reader = new FileReader();

    reader.onload = (e) => {
        if (typeof e.target?.result !== 'string') {
            statusElement.textContent = 'Error reading file.';
            return;
        }
        dataString = e.target.result;
        renderData();
    };
    reader.onerror = () => { statusElement.textContent = 'Error reading file.'; };
    reader.readAsText(file);
}

function createRecursiveKnotGeometry(): THREE.BufferGeometry {
    const points = [];
    const p = 2, q = 3, radius = 1, tubeRadius = 0.4;
    const numPoints = 128;
    for (let i = 0; i < numPoints; i++) {
        const u = (i / numPoints) * Math.PI * 2;
        points.push(getTorusKnotPos(u, p, q, radius, tubeRadius));
    }
    const curve = new THREE.CatmullRomCurve3(points, true);
    return new THREE.TubeGeometry(curve, 64, 0.1, 8, true);
}

function createRecursiveHelixGeometry(): THREE.BufferGeometry {
    const points = [];
    const numPoints = 64;
    const radius = 1, turns = 3, length = 5;
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2 * turns;
        points.push(new THREE.Vector3(
            radius * Math.cos(angle),
            (i / numPoints - 0.5) * length,
            radius * Math.sin(angle)
        ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, 32, 0.1, 5, false);
}


function renderData() {
    if (!dataString) return;

    if (initialText) {
        scene.remove(initialText);
        initialText.geometry.dispose();
        (initialText.material as THREE.Material).dispose();
        initialText = null;
    }

    if (instancedMesh) {
        scene.remove(instancedMesh);
        instancedMesh.geometry.dispose();
        (instancedMesh.material as THREE.Material).dispose();
        instancedMesh = null;
    }

    statusElement.textContent = `Rendering ${dataString.length} data points...`;
    
    const objectType = objectTypeSelectElement.value;
    let geometry;
    const objectSize = 5;

    switch(objectType) {
        case 'sphere':
            geometry = new THREE.SphereGeometry(objectSize * 0.7, 8, 8);
            break;
        case 'tetrahedron':
            geometry = new THREE.TetrahedronGeometry(objectSize);
            break;
        case 'octahedron':
            geometry = new THREE.OctahedronGeometry(objectSize);
            break;
        case 'dodecahedron':
            geometry = new THREE.DodecahedronGeometry(objectSize);
            break;
        case 'icosahedron':
            geometry = new THREE.IcosahedronGeometry(objectSize);
            break;
        case 'recursive-knot':
            geometry = createRecursiveKnotGeometry();
            break;
        case 'recursive-helix':
            geometry = createRecursiveHelixGeometry();
            break;
        case 'cube':
        default:
            geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
            break;
    }


    const material = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.5 });

    instancedMesh = new THREE.InstancedMesh(geometry, material, dataString.length);
    scene.add(instancedMesh);
    
    updateArrangement();
    statusElement.textContent = `${dataString.length} data points rendered.`;
}

function updateArrangement() {
    if (!instancedMesh) return;

    const shape = shapeSelectElement.value;
    knotControlsElement.style.display = (shape === 'torus-klein-knot') ? 'flex' : 'none';

    instancedMesh.rotation.set(0, 0, 0);

    const isAnimated = shape === 'mobius' || shape === 'klein' || shape === 'torus-klein-knot';
    if (isAnimated) {
        updateAnimatedArrangement(customTime);
        return;
    }
    
    const spacing = parseFloat(spacingSliderElement.value);
    const count = instancedMesh.count;

    for (let i = 0; i < count; i++) {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);

        switch (shape) {
            case 'circle':
                const radius = Math.max(200, count * 0.6) * spacing;
                const angle = (i / count) * Math.PI * 2;
                dummy.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
                dummy.lookAt(scene.position);
                break;
            case 'grid':
                const itemSize = 20 * spacing;
                const cols = Math.ceil(Math.sqrt(count));
                const gridX = (i % cols - (cols - 1) / 2) * itemSize;
                const gridY = (Math.floor(i / cols) - (Math.floor(count / cols) - 1) / 2) * -itemSize;
                dummy.position.set(gridX, gridY, 0);
                dummy.lookAt(camera.position);
                break;
            case 'sphere':
                const sphereRadius = Math.max(150, count * 0.25) * spacing;
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                dummy.position.set(
                    sphereRadius * Math.cos(theta) * Math.sin(phi),
                    sphereRadius * Math.sin(theta) * Math.sin(phi),
                    sphereRadius * Math.cos(phi)
                );
                dummy.lookAt(scene.position);
                break;
            case 'helix':
                const helixRadius = 100 * spacing;
                const verticalSpacing = 15 * spacing;
                const turns = 10;
                const helixAngle = (i / count) * Math.PI * 2 * turns;
                dummy.position.set(
                    helixRadius * Math.cos(helixAngle),
                    (i - count/2) * verticalSpacing * 0.2,
                    helixRadius * Math.sin(helixAngle)
                );
                dummy.lookAt(new THREE.Vector3(0, dummy.position.y, 0));
                break;
        }
        
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
        
        // Color based on character code
        const hue = (dataString.charCodeAt(i) % 256) / 256;
        instancedMesh.setColorAt(i, color.setHSL(hue, 0.8, 0.6));
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor!.needsUpdate = true;
}

const getTorusKnotPos = (u: number, p: number, q: number, radius: number, tubeRadius: number) => {
    const p_u = p * u;
    const q_u = q * u;
    const x = (radius + tubeRadius * Math.cos(q_u)) * Math.cos(p_u);
    const y = (radius + tubeRadius * Math.cos(q_u)) * Math.sin(p_u);
    const z = tubeRadius * Math.sin(q_u);
    return new THREE.Vector3(x, y, z);
}

function updateAnimatedArrangement(time: number) {
    if (!instancedMesh) return;

    const shape = shapeSelectElement.value;
    const spacing = parseFloat(spacingSliderElement.value);
    const count = instancedMesh.count;

    for (let i = 0; i < count; i++) {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        
        if (shape === 'mobius') {
            const R = 150 * spacing;
            const u = (i / count + time * 0.05) * Math.PI * 2;
            const v = 2 * u;
            const t = (i/count) * 2 - 1;

            const x = Math.cos(u) * (R + (t/2) * Math.cos(u/2));
            const y = Math.sin(u) * (R + (t/2) * Math.cos(u/2));
            const z = (t/2) * Math.sin(u/2);
            dummy.position.set(x,y,z);
            dummy.lookAt(scene.position);

        } else if (shape === 'klein') {
            const u = ((i / count) * 2 - 1) * Math.PI;
            const v = time * 0.5;
            const scale = 25 * spacing;
            const r = 4 * (1 - Math.cos(u) / 2);
            let x, y, z;
            if (u < Math.PI) {
                x = scale * (6 * Math.cos(u) * (1 + Math.sin(u)) + r * Math.cos(u) * Math.cos(v));
                z = scale * (16 * Math.sin(u) + r * Math.sin(u) * Math.cos(v));
            } else {
                x = scale * (6 * Math.cos(u) * (1 + Math.sin(u)) - r * Math.cos(v + Math.PI));
                z = scale * 16 * Math.sin(u);
            }
            y = scale * r * Math.sin(v);
            dummy.position.set(x, y, z);
            dummy.lookAt(scene.position);

        } else if (shape === 'torus-klein-knot') {
            const p = parseInt(pSliderElement.value, 10);
            const q = parseInt(qSliderElement.value, 10);
            const radius = 100 * spacing;
            const tubeRadius = 40 * spacing;
            
            const u = (((i / count)) + time * 0.05) * Math.PI * 2;
            const P = getTorusKnotPos(u, p, q, radius, tubeRadius);

            const epsilon = 0.001;
            const P_plus_eps = getTorusKnotPos(u + epsilon, p, q, radius, tubeRadius);
            const T = P_plus_eps.clone().sub(P).normalize();
            const N = new THREE.Vector3().subVectors(getTorusKnotPos(u, p, q, radius, tubeRadius + epsilon), P).normalize();
            const B = new THREE.Vector3().crossVectors(T, N);

            const helixRadius = 15 * spacing;
            const helixAngle = time * 5 + (i / count) * Math.PI * 8;
            const helixOffset = N.multiplyScalar(Math.cos(helixAngle) * helixRadius)
                                .add(B.multiplyScalar(Math.sin(helixAngle) * helixRadius));

            dummy.position.copy(P).add(helixOffset);
            dummy.lookAt(P);
            
            const hue = (u / (Math.PI * 2)) % 1;
            instancedMesh.setColorAt(i, color.setHSL(hue, 0.8, 0.6));
        }

        if (shape !== 'torus-klein-knot') {
             const hue = (dataString.charCodeAt(i) % 256) / 256;
             instancedMesh.setColorAt(i, color.setHSL(hue, 0.8, 0.6));
        }

        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor!.needsUpdate = true;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const animationSpeed = parseFloat(speedSliderElement.value);

    customTime += delta * animationSpeed;
    controls.update(delta);

    const shape = shapeSelectElement.value;
    const isAnimated = shape === 'mobius' || shape === 'klein' || shape === 'torus-klein-knot';

    if (instancedMesh) {
        if (isAnimated) {
            updateAnimatedArrangement(customTime);
        } else {
            instancedMesh.rotation.y += delta * 0.05 * animationSpeed;
        }
    }
    
    renderer.render(scene, camera);
}

init();