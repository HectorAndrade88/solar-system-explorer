/**
 * @file scale.js
 * Conversión entre coordenadas astronómicas y coordenadas de escena, y modelo
 * de escalado visual (distancias orbitales y tamaños independientes).
 *
 * Convención de la escena (Three.js usa Y hacia arriba):
 *   escena.x =  eclíptica.x   (hacia el equinoccio vernal)
 *   escena.y =  eclíptica.z   (polo norte de la eclíptica)
 *   escena.z = −eclíptica.y
 * Es una rotación propia (determinante +1), por lo que conserva la quiralidad.
 */
import * as THREE from 'three';
import { AU_KM, OBLIQUITY_J2000_DEG, DEG } from './astronomy.js';
import { SCENE_UNITS_PER_AU, COMPRESSED_DISTANCE_EXPONENT } from './config.js';

/** Escribe en `target` la posición de escena de un vector eclíptico {x, y, z}. */
export function eclipticToScene(v, target = new THREE.Vector3()) {
    return target.set(v.x, v.z, -v.y);
}

/** Matriz constante eclíptica J2000 → escena. */
export const ECLIPTIC_TO_SCENE = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1
);

/** Matriz constante ecuatorial J2000 → escena (rotación −ε sobre X y cambio de ejes). */
export const EQUATORIAL_TO_SCENE = (() => {
    const c = Math.cos(OBLIQUITY_J2000_DEG * DEG);
    const s = Math.sin(OBLIQUITY_J2000_DEG * DEG);
    const equatorialToEcliptic = new THREE.Matrix4().set(
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1
    );
    return new THREE.Matrix4().multiplyMatrices(ECLIPTIC_TO_SCENE, equatorialToEcliptic);
})();

const scratchX = new THREE.Vector3();
const scratchY = new THREE.Vector3();
const scratchZ = new THREE.Vector3();

/**
 * Construye la matriz de orientación de un cuerpo a partir de su base
 * astronómica (ver astronomy.bodyFrame). Las esferas de Three.js tienen el
 * meridiano 0° de la textura en +X local, el polo norte en +Y y la longitud
 * 90° E en −Z, por lo que:  X ← meridiano,  Y ← polo,  Z ← −este.
 */
export function frameToMatrix(frame, target = new THREE.Matrix4()) {
    eclipticToScene(frame.primeMeridian, scratchX);
    eclipticToScene(frame.pole, scratchY);
    eclipticToScene(frame.east, scratchZ).negate();
    return target.makeBasis(scratchX, scratchY, scratchZ);
}

/**
 * Modelo de escala visual. Lee los valores vivos de CONFIG, de modo que los
 * cambios hechos desde la interfaz se aplican de inmediato.
 */
export class ScaleModel {
    /** @param {object} config Objeto CONFIG compartido. */
    constructor(config) {
        this.config = config;
    }

    /** Unidades de escena por UA para las órbitas. */
    get unitsPerAU() {
        return SCENE_UNITS_PER_AU * this.config.orbitScale;
    }

    /** Distancia de escena correspondiente a una distancia heliocéntrica real. */
    radialDistance(distanceAU) {
        const r = this.config.distanceMode === 'compressed'
            ? distanceAU ** COMPRESSED_DISTANCE_EXPONENT
            : distanceAU;
        return r * this.unitsPerAU;
    }

    /**
     * Posición de escena de un vector heliocéntrico (UA). Solo se escala la
     * distancia radial: la dirección calculada por el motor se conserva.
     */
    heliocentricToScene(v, target = new THREE.Vector3()) {
        const r = Math.hypot(v.x, v.y, v.z);
        eclipticToScene(v, target);
        return r > 0 ? target.multiplyScalar(this.radialDistance(r) / r) : target;
    }

    /** Radio visual (unidades de escena) de un cuerpo de radio real dado. */
    bodyRadius(radiusKm, isSun = false) {
        const exaggeration = isSun ? this.config.sunScale : this.config.planetScale;
        return (radiusKm / AU_KM) * SCENE_UNITS_PER_AU * exaggeration;
    }

    /**
     * Desplazamiento Tierra→Luna en la escena. Se exagera con moonScale y se
     * garantiza una separación mínima para que la Luna nunca quede dentro de
     * la Tierra cuando los cuerpos están muy ampliados.
     */
    moonOffset(geocentric, earthRadius, moonRadius, target = new THREE.Vector3()) {
        const realDistance = Math.hypot(geocentric.x, geocentric.y, geocentric.z);
        const scaled = realDistance * SCENE_UNITS_PER_AU * this.config.moonScale;
        const minimum = (earthRadius + moonRadius) * 1.8;
        eclipticToScene(geocentric, target);
        return target.multiplyScalar(Math.max(scaled, minimum) / realDistance);
    }
}
