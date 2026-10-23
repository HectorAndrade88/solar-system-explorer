/**
 * @file solar-system.js
 * Capa de actualización de posiciones: traduce el estado astronómico
 * (interpolado por EphemerisService) a posiciones, orientaciones y órbitas de
 * la escena 3D, aplicando el modelo de escala visual.
 */
import * as THREE from 'three';
import { bodyFrame, DAYS_PER_CENTURY } from './astronomy.js';
import { BODY_DEFINITIONS, BODY_ORDER, Planet } from './planets.js';
import { Earth } from './earth.js';
import { Moon } from './moon.js';
import { Sun } from './sun.js';
import { ScaleModel, frameToMatrix } from './scale.js';
import { OrbitLines } from './orbits.js';
import { PERFORMANCE } from './config.js';

/** Clase visual especializada por cuerpo; el resto usa Planet. */
const BODY_CLASSES = { sun: Sun, earth: Earth, moon: Moon };

export class SolarSystem {
    /**
     * @param {import('./textures.js').TextureLibrary} textures
     * @param {object} config CONFIG compartido (escalas vivas).
     */
    constructor(textures, config) {
        this.config = config;
        this.scale = new ScaleModel(config);
        this.group = new THREE.Group();
        this.group.name = 'Sistema Solar';
        this.bodies = new Map(BODY_ORDER.map((id) => {
            const BodyClass = BODY_CLASSES[id] ?? Planet;
            return [id, new BodyClass(BODY_DEFINITIONS[id], textures)];
        }));
        for (const body of this.bodies.values()) this.group.add(body.root);

        this.orbits = new OrbitLines();
        this.group.add(this.orbits.group);

        this.sunPosition = new THREE.Vector3();
        this.orientation = new THREE.Matrix4();
        this.scratch = new THREE.Vector3();
        this.applyScale();
    }

    get(id) {
        return this.bodies.get(id);
    }

    /** Aplica las escalas de CONFIG a los radios y fuerza el recálculo de órbitas. */
    applyScale() {
        for (const [id, body] of this.bodies) {
            body.setVisualRadius(this.scale.bodyRadius(body.definition.radiusKm, id === 'sun'));
        }
        this.orbits.planetOrbitsT = NaN;
        this.orbits.moonOrbitT = NaN;
    }

    /** Desplazamiento de escena Tierra→Luna para un vector geocéntrico (UA). */
    moonSceneOffset(geocentric, target = new THREE.Vector3()) {
        return this.scale.moonOffset(geocentric, this.get('earth').visualRadius, this.get('moon').visualRadius, target);
    }

    /**
     * Actualiza posiciones, orientaciones y órbitas (antes de mover la cámara,
     * que sigue al cuerpo enfocado).
     * @param {object} state Estado de EphemerisService.update().
     */
    update(state) {
        this.updatePositions(state);
        this.updateOrientations(state);
        this.updateOrbits(state);
    }

    /**
     * Actualiza materiales y efectos dependientes de la cámara (después de
     * moverla): dirección del Sol, anillos, corona, nubes, eclipses.
     * @param {object} state Estado interpolado.
     * @param {THREE.Camera} camera Cámara ya actualizada.
     * @param {number} elapsedSeconds Tiempo real transcurrido (animaciones).
     */
    animate(state, camera, elapsedSeconds) {
        const context = { sunPosition: this.sunPosition, camera, elapsedSeconds, state };
        for (const body of this.bodies.values()) body.update(context);
    }

    /** Distancia de la cámara a la superficie más cercana (planos de recorte). */
    nearestSurfaceDistance(camera) {
        let nearest = Infinity;
        for (const body of this.bodies.values()) nearest = Math.min(nearest, body.distanceToSurface(camera));
        return nearest;
    }

    updatePositions(state) {
        for (const [id, body] of this.bodies) {
            if (id === 'moon') continue;
            body.setPosition(this.scale.heliocentricToScene(state.positions[id], this.scratch));
        }
        const earthPosition = this.get('earth').position;
        this.get('moon').setPosition(this.moonSceneOffset(state.moonGeocentric, this.scratch).add(earthPosition));
    }

    /**
     * Rotación de cada cuerpo: el ángulo del meridiano principal avanza
     * linealmente  W(t) = W0 + Ẇ·(d − d0)  entre instantáneas, por lo que la
     * rotación es fluida aunque las efemérides se calculen ~10 veces/s.
     */
    updateOrientations(state) {
        for (const [id, body] of this.bodies) {
            const rotation = state.snapshot.bodies[id].rotation;
            const meridian = rotation.meridianDeg + rotation.rateDegPerDay * (state.day - rotation.referenceDay);
            const frame = bodyFrame(rotation.poleRaDeg, rotation.poleDecDeg, meridian);
            body.setOrientation(frameToMatrix(frame, this.orientation));
        }
    }

    /** Recalcula las órbitas solo cuando el tiempo simulado se ha desplazado lo suficiente. */
    updateOrbits(state) {
        const snapshotTime = state.snapshot.time;
        const T = snapshotTime.T + (state.day - snapshotTime.d) / DAYS_PER_CENTURY;
        const orbits = this.orbits;
        if (!(Math.abs(T - orbits.planetOrbitsT) * DAYS_PER_CENTURY < PERFORMANCE.planetOrbitRefreshDays)) {
            orbits.rebuildPlanetOrbits(T, this.scale);
        }
        if (!(Math.abs(T - orbits.moonOrbitT) * DAYS_PER_CENTURY < PERFORMANCE.moonOrbitRefreshDays)) {
            orbits.rebuildMoonOrbit(T, (point) => this.moonSceneOffset(point));
        }
        orbits.followEarth(this.get('earth').position);
    }

    setOrbitsVisible(visible) {
        this.orbits.setVisible(visible);
    }

    setAxesVisible(visible) {
        for (const body of this.bodies.values()) body.setAxisVisible(visible);
    }
}
