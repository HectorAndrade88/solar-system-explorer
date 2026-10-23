/**
 * @file sky-view.js
 * "Vista desde la Tierra": el cielo tal como lo vería un observador situado
 * en una latitud/longitud dadas.
 *
 * Cálculo de posiciones aparentes (por fotograma, a partir del estado
 * interpolado):
 *  1. Vector geocéntrico eclíptico J2000 del cuerpo (planeta − Tierra, o el
 *     vector lunar directamente).
 *  2. Paso a ecuatoriales J2000 (rotación de la oblicuidad).
 *  3. Corrección topocéntrica: se resta la posición del observador sobre el
 *     elipsoide terrestre (paralaje; importante para la Luna, hasta ~1°).
 *  4. Proyección sobre la base horizontal (este, cénit, norte) definida por
 *     la latitud y el tiempo sidéreo local → acimut y altitud.
 * Marco de la escena: +X este, +Y cénit, −Z norte (observador en el origen).
 */
import * as THREE from 'three';
import {
    horizontalBasis, localSiderealTimeDeg, eclipticToEquatorial, observerEquatorialPosition,
    subVec, lengthVec, dotVec, normalizeVec, bodyFrame, normalizeDegrees,
    AU_KM, MOON_RADIUS_KM, RAD, DEG
} from './astronomy.js';
import { CelestialSphere } from './starfield.js';
import { createMoonMaterial, applyLunarEclipse } from './moon.js';
import { BODY_DEFINITIONS, UNIT_SPHERE } from './planets.js';
import { createRadialGlowTexture, GLOW_STOPS_SOFT, GLOW_STOPS_SUN } from './textures.js';
import { DIRECTION_VERTEX_SHADER, SKY_DOME_FRAGMENT_SHADER, GROUND_FRAGMENT_SHADER } from './shaders/sky.glsl.js';
import { OBSERVER_PRESETS } from './config.js';

const CELESTIAL_RADIUS = 1000;
const BODY_DISTANCE = 900;
const MOON_DISTANCE = 880;
const DOME_RADIUS = 1400;
const GROUND_RADIUS = 600;
const SUN_RADIUS_KM = 695700;
/** Ampliación opcional del Sol y la Luna (su diámetro real es de solo ~0,5°). */
const SKY_MAGNIFICATION = 4;
const SKY_BODY_IDS = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon'];
const MS_PER_DAY = 86400000;
const UNIX_EPOCH_JD = 2440587.5;

export const CARDINAL_POINTS = Object.freeze([
    { label: 'N', azimuth: 0 }, { label: 'NE', azimuth: 45 }, { label: 'E', azimuth: 90 }, { label: 'SE', azimuth: 135 },
    { label: 'S', azimuth: 180 }, { label: 'SO', azimuth: 225 }, { label: 'O', azimuth: 270 }, { label: 'NO', azimuth: 315 }
]);

/**
 * Observador por defecto según la zona horaria del navegador (sin
 * geolocalización, que podría depender de servicios externos).
 */
export function defaultObserver() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const preset = OBSERVER_PRESETS[zone];
    if (preset) return { ...preset };
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    return { name: 'Estimado por zona horaria', latitude: 0, longitude: offsetHours * 15 };
}

/** Vector de escena (este, cénit, −norte) a partir de un vector ecuatorial. */
function toHorizonScene(basis, eqVector, target) {
    return target.set(dotVec(basis.east, eqVector), dotVec(basis.up, eqVector), -dotVec(basis.north, eqVector));
}

/** Clasificación de la iluminación natural según la altura del Sol. */
export function describeSunAltitude(altitudeDeg) {
    if (altitudeDeg > 0) return 'Día';
    if (altitudeDeg > -6) return 'Crepúsculo civil';
    if (altitudeDeg > -12) return 'Crepúsculo náutico';
    if (altitudeDeg > -18) return 'Crepúsculo astronómico';
    return 'Noche';
}

export class SkyView {
    /**
     * @param {import('./textures.js').TextureLibrary} textures
     * @param {object} config CONFIG compartido.
     */
    constructor(textures, config) {
        this.config = config;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, 1, 1, DOME_RADIUS * 2);
        this.observer = defaultObserver();
        this.horizonMatrix = new THREE.Matrix4();
        this.sunDirection = new THREE.Vector3(0, 1, 0);
        this.sunAltitudeDeg = 0;
        this.daylight = 0;
        this.showGround = true;
        this.scratch = new THREE.Vector3();
        this.axisX = new THREE.Vector3();
        this.axisY = new THREE.Vector3();
        this.axisZ = new THREE.Vector3();
        this.moonOrientation = new THREE.Matrix4();

        this.dome = this.createDome();
        this.celestial = new CelestialSphere({ textures, radius: CELESTIAL_RADIUS, milkyWayIntensity: 1.6, starSize: 1.3 });
        this.ground = this.createGround();
        this.scene.add(this.dome, this.celestial.group, this.ground);

        const softGlow = createRadialGlowTexture(GLOW_STOPS_SOFT, 128);
        this.objects = new Map(SKY_BODY_IDS.map((id) => [id, this.createSkyObject(id, softGlow, textures)]));
    }

    createDome() {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uSunDirection: { value: this.sunDirection },
                uDaylight: { value: 0 },
                uTwilight: { value: 0 }
            },
            vertexShader: DIRECTION_VERTEX_SHADER,
            fragmentShader: SKY_DOME_FRAGMENT_SHADER,
            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false
        });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 64, 32), material);
        dome.renderOrder = 0;
        return dome;
    }

    /** Hemisferio inferior opaco: oculta lo que está bajo el horizonte. */
    createGround() {
        const material = new THREE.ShaderMaterial({
            uniforms: { uDaylight: { value: 0 }, uTwilight: { value: 0 } },
            vertexShader: DIRECTION_VERTEX_SHADER,
            fragmentShader: GROUND_FRAGMENT_SHADER,
            side: THREE.BackSide,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const geometry = new THREE.SphereGeometry(GROUND_RADIUS, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const ground = new THREE.Mesh(geometry, material);
        ground.renderOrder = 100;
        return ground;
    }

    /**
     * Representación de un cuerpo en el cielo: disco (Sol, Luna) o punto luminoso (planetas).
     * Todo el cielo se dibuja en el pase transparente sin prueba de profundidad,
     * ordenado por renderOrder: cúpula → Vía Láctea → estrellas → Sol → planetas
     * → Luna (puede ocultar al Sol: eclipses) → suelo (oculta lo que está bajo el horizonte).
     */
    createSkyObject(id, softGlow, textures) {
        const definition = BODY_DEFINITIONS[id];
        const object = {
            id,
            position: new THREE.Vector3(),
            pickTargets: [],
            azimuthDeg: 0,
            altitudeDeg: 0,
            distanceAU: 0,
            magnitude: 0,
            visible: true
        };
        if (id === 'moon') {
            const material = createMoonMaterial(textures.get('moon'));
            Object.assign(material, { transparent: true, depthTest: false, depthWrite: false });
            material.uniforms.uEarthshine.value = 0.02;
            object.mesh = new THREE.Mesh(UNIT_SPHERE, material);
            object.mesh.renderOrder = 12;
            object.mesh.userData.bodyId = id;
            object.pickTargets.push(object.mesh);
            this.scene.add(object.mesh);
        } else if (id === 'sun') {
            object.mesh = new THREE.Mesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({
                color: new THREE.Color(9, 8, 6.5),
                transparent: true,
                depthTest: false,
                depthWrite: false
            }));
            object.mesh.renderOrder = 10;
            object.glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: createRadialGlowTexture(GLOW_STOPS_SUN),
                color: new THREE.Color(2.2, 1.9, 1.5),
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false
            }));
            object.glow.renderOrder = 9;
            this.scene.add(object.mesh, object.glow);
        } else {
            object.glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: softGlow,
                color: new THREE.Color(definition.color),
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false
            }));
            object.glow.renderOrder = 11;
            this.scene.add(object.glow);
        }
        return object;
    }

    setObserver({ name, latitude, longitude }) {
        this.observer = { name, latitude, longitude };
    }

    setGroundVisible(visible) {
        this.showGround = visible;
        this.ground.visible = visible;
    }

    /**
     * Recalcula el cielo para el estado actual.
     * @param {object} state Estado interpolado de EphemerisService.
     */
    update(state) {
        const jdUT = state.timeMs / MS_PER_DAY + UNIX_EPOCH_JD;
        const { latitude, longitude } = this.observer;
        const lst = localSiderealTimeDeg(jdUT, longitude);
        const basis = horizontalBasis(latitude, lst);
        const { east, up, north } = basis;
        this.horizonMatrix.set(
            east.x, east.y, east.z, 0,
            up.x, up.y, up.z, 0,
            -north.x, -north.y, -north.z, 0,
            0, 0, 0, 1
        );
        this.celestial.setFrame(this.horizonMatrix);

        const observerPosition = observerEquatorialPosition(latitude, lst);
        for (const object of this.objects.values()) {
            this.updateObjectPosition(object, state, basis, observerPosition);
        }
        this.updateLighting();
        this.updateBodies(state, basis);
    }

    updateObjectPosition(object, state, basis, observerPosition) {
        const geocentric = object.id === 'moon'
            ? state.moonGeocentric
            : subVec(state.positions[object.id], state.positions.earth);
        const topocentric = subVec(eclipticToEquatorial(geocentric), observerPosition);
        const direction = toHorizonScene(basis, normalizeVec(topocentric), object.position);
        object.azimuthDeg = normalizeDegrees(Math.atan2(direction.x, -direction.z) * RAD);
        object.altitudeDeg = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) * RAD;
        object.distanceAU = lengthVec(topocentric);
        object.magnitude = state.snapshot.bodies[object.id].magnitude;
        object.position.multiplyScalar(object.id === 'moon' ? MOON_DISTANCE : BODY_DISTANCE);
    }

    /** Color del cielo y visibilidad de estrellas según la altura del Sol. */
    updateLighting() {
        const sun = this.objects.get('sun');
        this.sunDirection.copy(sun.position).normalize();
        this.sunAltitudeDeg = sun.altitudeDeg;
        const height = this.sunDirection.y;
        this.daylight = THREE.MathUtils.smoothstep(height, -0.12, 0.17);
        const twilight = THREE.MathUtils.smoothstep(height, -0.3, -0.02) * (1 - THREE.MathUtils.smoothstep(height, 0.02, 0.25));

        this.dome.material.uniforms.uDaylight.value = this.daylight;
        this.dome.material.uniforms.uTwilight.value = twilight;
        this.ground.material.uniforms.uDaylight.value = this.daylight;
        this.ground.material.uniforms.uTwilight.value = twilight;

        const starVisibility = 1 - THREE.MathUtils.smoothstep(height, -0.21, -0.03);
        const milkyWayVisibility = 1 - THREE.MathUtils.smoothstep(height, -0.31, -0.15);
        this.celestial.setBrightness(starVisibility, milkyWayVisibility);
        this.celestial.setMilkyWayVisible(this.config.showMilkyWay);
        this.celestial.setConstellationsVisible(this.config.showConstellations);
    }

    /** Tamaño, brillo y orientación de Sol, Luna y planetas. */
    updateBodies(state, basis) {
        const magnification = this.config.magnifySkyBodies ? SKY_MAGNIFICATION : 1;
        const pixelsToWorld = (2 * BODY_DISTANCE * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
            / Math.max(1, this.viewportHeight ?? 800);
        // Magnitud límite: ~6.5 de noche cerrada, ~−3.5 a pleno día (solo Venus y la Luna).
        const limitingMagnitude = THREE.MathUtils.lerp(6.5, -3.5, this.daylight);

        for (const object of this.objects.values()) {
            if (object.id === 'sun') {
                const radius = BODY_DISTANCE * Math.tan(Math.asin(SUN_RADIUS_KM / (object.distanceAU * AU_KM)) * magnification);
                object.mesh.position.copy(object.position);
                object.mesh.scale.setScalar(radius);
                object.glow.position.copy(object.position);
                object.glow.scale.setScalar(radius * (8 + 8 * this.daylight));
            } else if (object.id === 'moon') {
                this.updateMoon(object, state, basis, magnification);
            } else {
                const visibility = THREE.MathUtils.clamp((limitingMagnitude - object.magnitude) / 1.5, 0, 1);
                const sizePx = THREE.MathUtils.clamp(5 + (1.5 - object.magnitude) * 2.2, 4, 18);
                object.glow.position.copy(object.position);
                object.glow.scale.setScalar(sizePx * pixelsToWorld);
                object.glow.material.opacity = 0.25 + 0.75 * visibility;
                object.visible = visibility > 0.05;
                object.glow.visible = object.visible;
            }
        }
    }

    /** La Luna se orienta con su modelo de rotación IAU (fase y libración reales). */
    updateMoon(object, state, basis, magnification) {
        const radius = MOON_DISTANCE * Math.tan(Math.asin(MOON_RADIUS_KM / (object.distanceAU * AU_KM)) * magnification);
        object.mesh.position.copy(object.position);
        object.mesh.scale.setScalar(radius);

        const rotation = state.snapshot.bodies.moon.rotation;
        const meridian = rotation.meridianDeg + rotation.rateDegPerDay * (state.day - rotation.referenceDay);
        const frame = bodyFrame(rotation.poleRaDeg, rotation.poleDecDeg, meridian);
        toHorizonScene(basis, eclipticToEquatorial(frame.primeMeridian), this.axisX);
        toHorizonScene(basis, eclipticToEquatorial(frame.pole), this.axisY);
        toHorizonScene(basis, eclipticToEquatorial(frame.east), this.axisZ).negate();
        object.mesh.quaternion.setFromRotationMatrix(this.moonOrientation.makeBasis(this.axisX, this.axisY, this.axisZ));

        object.mesh.material.uniforms.uSunDirection.value.copy(this.sunDirection);
        applyLunarEclipse(object.mesh.material, state.snapshot.lunarEclipse);
    }

    /** Altura del viewport en píxeles (para dar tamaño constante en pantalla a los planetas). */
    setViewportHeight(height) {
        this.viewportHeight = height;
    }

    /** Observación del cuerpo seleccionado: acimut, altitud, distancia y magnitud. */
    getObservation(id) {
        return this.objects.get(id) ?? null;
    }

    /** ¿Es visible el punto (no oculto por el suelo)? */
    isAboveHorizon(position) {
        return !this.showGround || position.y > -1e-3;
    }

    /** Posición de escena de un punto cardinal sobre el horizonte. */
    cardinalPosition(azimuthDeg, target) {
        const azimuth = azimuthDeg * DEG;
        return target.set(Math.sin(azimuth) * BODY_DISTANCE, 0.5, -Math.cos(azimuth) * BODY_DISTANCE);
    }
}
