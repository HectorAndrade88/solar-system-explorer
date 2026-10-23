/**
 * @file scene.js
 * Infraestructura Three.js / WebGL: renderizador, cámaras, luces, fondo
 * estelar, posprocesado (bloom) y selección de objetos por rayo.
 *
 * Orden de dibujo en la vista espacial:
 *  1. Pase de fondo: esfera celeste con una cámara que copia la rotación de la
 *     cámara principal pero no su posición → estrellas a distancia infinita.
 *  2. Pase principal: Sistema Solar (limpia solo el búfer de profundidad).
 *  3. Bloom (UnrealBloomPass) sobre los valores HDR del Sol.
 *  4. OutputPass: mapeo tonal ACES y conversión a sRGB.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CelestialSphere } from './starfield.js';
import { EQUATORIAL_TO_SCENE } from './scale.js';
import { LIGHTING } from './planets.js';
import { projectToScreen } from './labels.js';
import { PERFORMANCE } from './config.js';

const BACKGROUND_RADIUS = 1000;
const PICK_RADIUS_PX = 22;

export class SceneManager {
    /** @param {HTMLElement} container Elemento que alojará el lienzo. */
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERFORMANCE.maxPixelRatio));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.setClearColor(0x000000, 1);
        container.appendChild(this.renderer.domElement);
        this.canvas = this.renderer.domElement;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200000);
        this.scene.add(new THREE.AmbientLight(0xb8c4ff, LIGHTING.ambientIntensity));

        this.backgroundScene = new THREE.Scene();
        this.backgroundCamera = new THREE.PerspectiveCamera(45, 1, 1, BACKGROUND_RADIUS * 3);
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.createComposer();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /** Crea la cadena de posprocesado con un búfer HDR multimuestreado (antialiasing). */
    createComposer() {
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(this.renderer, target);

        this.backgroundPass = new RenderPass(this.backgroundScene, this.backgroundCamera);
        this.mainPass = new RenderPass(this.scene, this.camera);
        this.mainPass.clear = false;
        this.mainPass.clearDepth = true;
        this.skyPass = new RenderPass(new THREE.Scene(), this.camera);
        this.skyPass.enabled = false;
        // Umbral > 1: solo florecen las fuentes HDR (Sol, estrellas brillantes), no los planetas iluminados.
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.8, 0.5, 1.1);

        this.composer.addPass(this.backgroundPass);
        this.composer.addPass(this.mainPass);
        this.composer.addPass(this.skyPass);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(new OutputPass());
    }

    /** Crea el fondo de estrellas y Vía Láctea de la vista espacial. */
    createBackground(textures) {
        this.celestialSphere = new CelestialSphere({ textures, radius: BACKGROUND_RADIUS, milkyWayIntensity: 1.25 });
        this.celestialSphere.setFrame(EQUATORIAL_TO_SCENE);
        this.celestialSphere.setPixelRatio(this.renderer.getPixelRatio());
        this.backgroundScene.add(this.celestialSphere.group);
    }

    /**
     * Alterna entre la vista espacial y la vista desde la Tierra.
     * @param {{scene: THREE.Scene, camera: THREE.Camera}|null} skyView Vista celeste o null.
     */
    setSkyView(skyView) {
        const sky = skyView !== null;
        this.backgroundPass.enabled = !sky;
        this.mainPass.enabled = !sky;
        this.skyPass.enabled = sky;
        if (sky) {
            this.skyPass.scene = skyView.scene;
            this.skyPass.camera = skyView.camera;
        }
    }

    setBloomEnabled(enabled) {
        this.bloomPass.enabled = enabled;
    }

    /** Tamaño del área de dibujo en píxeles CSS. */
    get size() {
        return { width: this.container.clientWidth, height: this.container.clientHeight };
    }

    resize() {
        const { width, height } = this.size;
        if (width === 0 || height === 0) return;
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
        for (const camera of [this.camera, this.backgroundCamera, this.skyPass.camera]) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
    }

    /**
     * Ajusta los planos de recorte a la superficie más cercana para conservar
     * precisión de profundidad tanto en primeros planos como en vistas lejanas.
     */
    updateClipping(nearestSurfaceDistance) {
        const near = THREE.MathUtils.clamp(nearestSurfaceDistance * 0.2, 1e-4, 5);
        if (Math.abs(near - this.camera.near) / this.camera.near > 0.05) {
            this.camera.near = near;
            this.camera.updateProjectionMatrix();
        }
    }

    /** Copia la orientación de la cámara principal a la cámara del fondo. */
    syncBackgroundCamera() {
        this.backgroundCamera.quaternion.copy(this.camera.quaternion);
        if (this.backgroundCamera.fov !== this.camera.fov) {
            this.backgroundCamera.fov = this.camera.fov;
            this.backgroundCamera.updateProjectionMatrix();
        }
    }

    render() {
        this.syncBackgroundCamera();
        this.composer.render();
    }

    /**
     * Selección de un cuerpo bajo el puntero: primero por rayo contra las
     * superficies; si no hay impacto (cuerpos de pocos píxeles), el cuerpo
     * cuyo centro proyectado esté más cerca del puntero.
     * @param {number} clientX Coordenada X del puntero.
     * @param {number} clientY Coordenada Y del puntero.
     * @param {Map<string, object>} bodies Cuerpos seleccionables.
     * @param {THREE.Camera} camera Cámara activa.
     * @returns {string|null} Identificador del cuerpo.
     */
    pick(clientX, clientY, bodies, camera) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(this.pointer, camera);

        const targets = [...bodies.values()].flatMap((body) => body.pickTargets);
        const hit = this.raycaster.intersectObjects(targets, false).find((intersection) => intersection.object.visible);
        if (hit) return hit.object.userData.bodyId;

        let best = null;
        let bestDistance = PICK_RADIUS_PX;
        for (const [id, body] of bodies) {
            const point = projectToScreen(body.position, camera, rect.width, rect.height);
            if (!point) continue;
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < bestDistance) {
                best = id;
                bestDistance = distance;
            }
        }
        return best;
    }
}
