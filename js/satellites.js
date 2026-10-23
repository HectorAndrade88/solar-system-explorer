/**
 * @file satellites.js
 * Catálogo y propagación de satélites artificiales (Starlink).
 *
 * Módulo sin Three.js ni DOM. Usa el modelo SGP4/SDP4 (Spacetrack Report #3,
 * revisión de Vallado et al. 2006) implementado por satellite.js, que es el
 * modelo para el que se generan los TLE: cualquier otro propagador daría
 * errores mayores con los mismos elementos.
 *
 * Marco de referencia: SGP4 entrega posición y velocidad en TEME (ecuador
 * verdadero, equinoccio medio de la fecha), en km y km/s. Para pasar a
 * coordenadas terrestres basta girar el tiempo sidéreo de Greenwich (GMST)
 * alrededor del eje Z, el mismo ángulo con que se orienta la Tierra en la escena.
 */
import { twoline2satrec } from '../vendor/satellite.js/io.js';
import { sgp4, gstime } from '../vendor/satellite.js/propagation.js';
import { eciToGeodetic } from '../vendor/satellite.js/transforms.js';
import { STARLINK_TLE, STARLINK_TLE_INFO } from './data/starlink-tle.js';
import { STARLINK_LAUNCHES, LAUNCH_SITES, STARLINK_DATA_GENERATED } from './data/starlink-launches.js';

/** Radio terrestre medio (km): coincide con el radio usado para dibujar la Tierra. */
export const EARTH_RADIUS_KM = 6371;
/** Parámetro gravitacional terrestre GM (km³/s²). */
export const EARTH_MU = 398600.4418;

const MS_PER_MINUTE = 60000;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;
/** Altitud por debajo de la cual se considera que el objeto ya reingresó (km). */
const DECAY_ALTITUDE_KM = 80;

const julianFromMs = (timeMs) => timeMs / MS_PER_DAY + UNIX_EPOCH_JD;

/**
 * Designador internacional COSPAR del lanzamiento a partir de la línea 1 del TLE:
 * columnas 10–14 ('19074') → '2019-074'.
 */
export function launchDesignator(line1) {
    const year = Number(line1.slice(9, 11));
    return `${year >= 57 ? 1900 + year : 2000 + year}-${line1.slice(11, 14)}`;
}

/** Edad de los elementos orbitales y precisión esperada de la posición. */
export function describeDataAge(days) {
    const age = Math.abs(days);
    if (age < 3) return { level: 'good', text: 'precisión de ~1 km' };
    if (age < 30) return { level: 'fair', text: 'precisión decreciente (decenas de km)' };
    return { level: 'poor', text: 'posiciones solo ilustrativas' };
}

export class SatelliteCatalog {
    /**
     * @param {string} tleText Bloques de 3 líneas (nombre, línea 1, línea 2).
     * @param {Array<object>} launches Historial de lanzamientos (ver data/starlink-launches.js).
     */
    constructor(tleText = STARLINK_TLE, launches = STARLINK_LAUNCHES) {
        this.launches = launches;
        this.sites = LAUNCH_SITES;
        this.generated = STARLINK_DATA_GENERATED;
        this.launchIndexById = new Map(launches.map((launch, index) => [launch.id, index]));

        const lines = tleText.split('\n').map((line) => line.trimEnd()).filter(Boolean);
        this.satrecs = [];
        this.names = [];
        const launchOf = [];
        for (let k = 0; k + 2 < lines.length; k += 3) {
            const satrec = twoline2satrec(lines[k + 1], lines[k + 2]);
            if (satrec.error) continue;
            this.satrecs.push(satrec);
            this.names.push(lines[k]);
            launchOf.push(this.launchIndexById.get(launchDesignator(lines[k + 1])) ?? -1);
        }
        this.count = this.satrecs.length;
        this.launchOf = Int16Array.from(launchOf);
        this.launchTimeMs = Float64Array.from(launchOf, (index) => (index >= 0 ? Date.parse(launches[index].net) : -Infinity));
        this.epochMs = Float64Array.from(this.satrecs, (satrec) => (satrec.jdsatepoch - UNIX_EPOCH_JD) * MS_PER_DAY);

        this.satellitesByLaunch = new Map();
        this.launchOf.forEach((launchIndex, satellite) => {
            if (launchIndex < 0) return;
            if (!this.satellitesByLaunch.has(launchIndex)) this.satellitesByLaunch.set(launchIndex, []);
            this.satellitesByLaunch.get(launchIndex).push(satellite);
        });
        const sortedEpochs = [...this.epochMs].sort((a, b) => a - b);
        /** Época mediana de los TLE: referencia de la "edad" de los datos. */
        this.dataEpochMs = sortedEpochs[Math.floor(sortedEpochs.length / 2)] ?? Date.parse(STARLINK_TLE_INFO.generated);
    }

    /**
     * Estado SGP4 de un satélite.
     * @returns {{position:{x,y,z}, velocity:{x,y,z}}|null} TEME en km y km/s, o null si
     *   aún no se lanzó, el modelo falla o el objeto ya habría reingresado.
     */
    propagate(index, timeMs) {
        if (timeMs < this.launchTimeMs[index]) return null;
        const state = sgp4(this.satrecs[index], (timeMs - this.epochMs[index]) / MS_PER_MINUTE);
        if (!state || !state.position) return null;
        const { x, y, z } = state.position;
        return Math.hypot(x, y, z) - EARTH_RADIUS_KM < DECAY_ALTITUDE_KM ? null : state;
    }

    /**
     * Propaga todo el catálogo (≈ 5 ms para 10.000 satélites) y escribe los
     * resultados en arreglos planos. Las coordenadas se guardan en el marco
     * local de la escena (x, z, −y) para subirlas directamente a la GPU.
     * @returns {number} Satélites válidos.
     */
    propagateAll(timeMs, positions, velocities, visible) {
        let valid = 0;
        for (let i = 0; i < this.count; i++) {
            const state = this.propagate(i, timeMs);
            if (state) {
                const p = state.position;
                const v = state.velocity;
                positions[i * 3] = p.x; positions[i * 3 + 1] = p.z; positions[i * 3 + 2] = -p.y;
                velocities[i * 3] = v.x; velocities[i * 3 + 1] = v.z; velocities[i * 3 + 2] = -v.y;
                visible[i] = 1;
                valid++;
            } else {
                visible[i] = 0;
            }
        }
        return valid;
    }

    /** Posición geodésica, altitud y velocidad (WGS72/84 elipsoidal). */
    geodetic(index, timeMs) {
        const state = this.propagate(index, timeMs);
        if (!state) return null;
        const gmst = gstime(julianFromMs(timeMs));
        const { latitude, longitude, height } = eciToGeodetic(state.position, gmst);
        const { x, y, z } = state.velocity;
        return {
            state,
            latitudeDeg: latitude * 180 / Math.PI,
            longitudeDeg: longitude * 180 / Math.PI,
            altitudeKm: height,
            speedKmS: Math.hypot(x, y, z)
        };
    }

    /** Elementos medios del TLE (inclinación, excentricidad, periodo, apogeo/perigeo). */
    meanElements(index) {
        const satrec = this.satrecs[index];
        const meanMotion = satrec.no; // rad/min
        const semiMajorAxis = Math.cbrt(EARTH_MU / (meanMotion / 60) ** 2);
        return {
            inclinationDeg: satrec.inclo * 180 / Math.PI,
            eccentricity: satrec.ecco,
            periodMinutes: (2 * Math.PI) / meanMotion,
            apogeeKm: semiMajorAxis * (1 + satrec.ecco) - EARTH_RADIUS_KM,
            perigeeKm: semiMajorAxis * (1 - satrec.ecco) - EARTH_RADIUS_KM,
            noradId: satrec.satnum
        };
    }

    /**
     * Trayectoria de una revolución completa centrada en el instante dado,
     * en el marco local de la escena (km).
     */
    orbitPoints(index, timeMs, segments = 120) {
        const periodMs = this.meanElements(index).periodMinutes * MS_PER_MINUTE;
        const points = [];
        for (let k = 0; k <= segments; k++) {
            const state = this.propagate(index, timeMs + (k / segments - 0.5) * periodMs);
            if (state) points.push([state.position.x, state.position.z, -state.position.y]);
        }
        return points;
    }

    launchOfSatellite(index) {
        const launchIndex = this.launchOf[index];
        return launchIndex >= 0 ? this.launches[launchIndex] : null;
    }

    /** Índices de los satélites con TLE de un lanzamiento. */
    satellitesOfLaunch(launchId) {
        return this.satellitesByLaunch.get(this.launchIndexById.get(launchId)) ?? [];
    }

    launchById(launchId) {
        return this.launches[this.launchIndexById.get(launchId)] ?? null;
    }
}
