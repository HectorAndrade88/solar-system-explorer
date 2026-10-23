/**
 * @file launch-trajectory.js
 * Modelo aproximado de la trayectoria de un lanzamiento Starlink.
 *
 * Las trayectorias reales de ascenso no son públicas como datos; este modelo
 * educativo reproduce su forma y su cronología típicas:
 *  1. Ascenso (T+0 → SECO): el cohete sigue un círculo máximo desde la
 *     plataforma con el acimut que produce la inclinación orbital objetivo:
 *        sin(Az_inercial) = cos(i) / cos(φ)
 *     corregido por la velocidad de rotación terrestre:
 *        tan(Az_rotante) = (V·sin Az − v_ecuador·cos φ) / (V·cos Az)
 *     La altitud y el alcance siguen perfiles suaves calibrados con los
 *     valores habituales de Falcon 9 (MECO ≈ 65 km, SECO ≈ 280 km a ≈ 1.750 km).
 *  2. Órbita de transferencia (SECO → despliegue): órbita circular inercial
 *     definida por la posición y la velocidad en SECO (incluida la rotación terrestre).
 *  3. Satélites desplegados: el paquete continúa en esa órbita.
 * Las posiciones se devuelven en el marco local de la escena (TEME: x, z, −y) en km.
 */
import { greenwichMeanSiderealTimeDeg, DEG, RAD } from './astronomy.js';
import { EARTH_RADIUS_KM, EARTH_MU } from './satellites.js';

const MS_PER_DAY = 86400000;
const UNIX_EPOCH_JD = 2440587.5;
const EARTH_ROTATION_RAD_S = 7.2921159e-5;
const EQUATORIAL_SPEED_KM_S = 0.4651;
const ORBITAL_SPEED_KM_S = 7.8;

/** Parámetros típicos de un lanzamiento Starlink con Falcon 9 (segundos y km). */
const FALCON_PROFILE = Object.freeze({
    secoSeconds: 515,
    secoAltitudeKm: 280,
    secoDownrangeKm: 1750,
    relativeSpeedAtSecoKmS: 7.35,
    deploySeconds: 3720,
    events: [
        { seconds: 0, label: 'Despegue' },
        { seconds: 72, label: 'Max-Q (máxima presión aerodinámica)' },
        { seconds: 147, label: 'MECO y separación de etapas' },
        { seconds: 175, label: 'Separación de la cofia' },
        { seconds: 515, label: 'SECO: inserción en órbita' },
        { seconds: 3720, label: 'Despliegue de los satélites' }
    ]
});

/** Starship despliega antes y en una trayectoria más baja. */
const STARSHIP_PROFILE = Object.freeze({
    ...FALCON_PROFILE,
    secoAltitudeKm: 190,
    secoDownrangeKm: 2100,
    deploySeconds: 1200,
    events: [
        { seconds: 0, label: 'Despegue' },
        { seconds: 62, label: 'Max-Q (máxima presión aerodinámica)' },
        { seconds: 160, label: 'Separación en caliente de etapas' },
        { seconds: 515, label: 'SECO: apagado de la nave' },
        { seconds: 1200, label: 'Despliegue de los satélites' }
    ]
});

/** Tiempo tras el despliegue durante el que se sigue mostrando el paquete de satélites. */
const POST_DEPLOY_SECONDS = 3 * 3600;
/** Tiempo previo al despegue en que el cohete aparece en la plataforma. */
const PRE_LAUNCH_SECONDS = 600;

/**
 * Acimut de lanzamiento (grados desde el norte, sentido horario) en el marco
 * terrestre giratorio.
 * @param {number} latitudeDeg Latitud de la plataforma.
 * @param {number} inclinationDeg Inclinación orbital objetivo.
 * @param {boolean} southbound true para la solución hacia el sur.
 */
export function launchAzimuthDeg(latitudeDeg, inclinationDeg, southbound) {
    const phi = latitudeDeg * DEG;
    const sinAz = Math.cos(inclinationDeg * DEG) / Math.cos(phi);
    const inertial = Math.abs(sinAz) >= 1 ? Math.PI / 2 * Math.sign(sinAz) : Math.asin(sinAz);
    const azimuth = southbound ? Math.PI - inertial : inertial;
    const rotating = Math.atan2(
        ORBITAL_SPEED_KM_S * Math.sin(azimuth) - EQUATORIAL_SPEED_KM_S * Math.cos(phi),
        ORBITAL_SPEED_KM_S * Math.cos(azimuth)
    );
    return ((rotating * RAD) % 360 + 360) % 360;
}

/**
 * Sentido de la trayectoria: desde Vandenberg (California) los lanzamientos
 * van hacia el sur; desde Florida, las órbitas de ~43° se alcanzan rumbo al
 * sureste y las de ≥ 53° rumbo al noreste.
 */
function isSouthbound(site, inclinationDeg) {
    return site.latitude > 33 || inclinationDeg < 45;
}

/** Punto a una distancia angular δ por un círculo máximo (fórmula de navegación). */
function greatCirclePoint(latRad, lonRad, azimuthRad, delta) {
    const lat = Math.asin(Math.sin(latRad) * Math.cos(delta) + Math.cos(latRad) * Math.sin(delta) * Math.cos(azimuthRad));
    const lon = lonRad + Math.atan2(
        Math.sin(azimuthRad) * Math.sin(delta) * Math.cos(latRad),
        Math.cos(delta) - Math.sin(latRad) * Math.sin(lat)
    );
    return { lat, lon };
}

/** Vector ECEF (km) a partir de latitud, longitud (rad) y radio. */
function ecef(lat, lon, radius) {
    return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat)];
}

/** Gira un vector ECEF el ángulo sidéreo θ para expresarlo en TEME. */
function ecefToTeme([x, y, z], theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [x * c - y * s, x * s + y * c, z];
}

const toLocal = ([x, y, z]) => [x, z, -y];
const siderealAngle = (timeMs) => greenwichMeanSiderealTimeDeg(timeMs / MS_PER_DAY + UNIX_EPOCH_JD) * DEG;
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class LaunchTrajectory {
    /**
     * @param {object} launch Entrada del historial (net, inclination, rocket...).
     * @param {object} site Plataforma { name, latitude, longitude }.
     */
    constructor(launch, site) {
        this.launch = launch;
        this.site = site;
        this.profile = /starship/i.test(launch.rocket) ? STARSHIP_PROFILE : FALCON_PROFILE;
        this.launchTimeMs = Date.parse(launch.net);
        this.inclinationDeg = launch.inclination ?? 53;
        this.azimuthDeg = launchAzimuthDeg(site.latitude, this.inclinationDeg, isSouthbound(site, this.inclinationDeg));
        this.coast = this.computeCoastOrbit();
    }

    get events() {
        return this.profile.events;
    }

    get endSeconds() {
        return this.profile.deploySeconds + POST_DEPLOY_SECONDS;
    }

    /** ¿El instante cae dentro de la ventana que se representa (plataforma → paquete desplegado)? */
    isActive(timeMs) {
        const seconds = (timeMs - this.launchTimeMs) / 1000;
        return seconds >= -PRE_LAUNCH_SECONDS && seconds <= this.endSeconds;
    }

    /** Posición terrestre (lat, lon, altitud) del ascenso en el segundo t. */
    ascentGeodetic(seconds) {
        const { secoSeconds, secoAltitudeKm, secoDownrangeKm } = this.profile;
        const s = Math.min(Math.max(seconds / secoSeconds, 0), 1);
        const altitudeKm = secoAltitudeKm * Math.sin((Math.PI / 2) * s) ** 1.6;
        const downrangeKm = secoDownrangeKm * s ** 2.2;
        const point = greatCirclePoint(this.site.latitude * DEG, this.site.longitude * DEG,
            this.azimuthDeg * DEG, downrangeKm / EARTH_RADIUS_KM);
        return { ...point, altitudeKm, downrangeKm };
    }

    /** Posición TEME (km) del ascenso. */
    ascentPosition(seconds) {
        const { lat, lon, altitudeKm } = this.ascentGeodetic(seconds);
        return ecefToTeme(ecef(lat, lon, EARTH_RADIUS_KM + altitudeKm), siderealAngle(this.launchTimeMs + seconds * 1000));
    }

    /**
     * Órbita de transferencia: plano definido por la posición en SECO y la
     * velocidad inercial = velocidad relativa (rotada a TEME) + ω × r.
     */
    computeCoastOrbit() {
        const { secoSeconds, relativeSpeedAtSecoKmS } = this.profile;
        const theta = siderealAngle(this.launchTimeMs + secoSeconds * 1000);
        const here = this.ascentGeodetic(secoSeconds);
        const ahead = greatCirclePoint(here.lat, here.lon, this.finalHeading(here), 1 / EARTH_RADIUS_KM);
        const radius = EARTH_RADIUS_KM + here.altitudeKm;
        const position = ecefToTeme(ecef(here.lat, here.lon, radius), theta);
        const aheadPosition = ecefToTeme(ecef(ahead.lat, ahead.lon, radius), theta);
        const direction = add(aheadPosition, scale(position, -1));
        const relativeVelocity = scale(direction, relativeSpeedAtSecoKmS / norm(direction));
        const inertialVelocity = add(relativeVelocity, [-EARTH_ROTATION_RAD_S * position[1], EARTH_ROTATION_RAD_S * position[0], 0]);

        const radial = scale(position, 1 / radius);
        const transverse = add(inertialVelocity, scale(radial, -dot(inertialVelocity, radial)));
        const tangent = scale(transverse, 1 / norm(transverse));
        const normal = [
            radial[1] * tangent[2] - radial[2] * tangent[1],
            radial[2] * tangent[0] - radial[0] * tangent[2],
            radial[0] * tangent[1] - radial[1] * tangent[0]
        ];
        return {
            radius,
            radial,
            tangent,
            meanMotion: Math.sqrt(EARTH_MU / radius ** 3),
            // Inclinación del plano: ángulo entre la normal orbital y el eje polar.
            inclinationDeg: Math.acos(Math.max(-1, Math.min(1, normal[2]))) * RAD
        };
    }

    /** Rumbo final del círculo máximo en el punto alcanzado. */
    finalHeading(point) {
        const lat1 = this.site.latitude * DEG;
        const lon1 = this.site.longitude * DEG;
        const dLon = lon1 - point.lon;
        const back = Math.atan2(
            Math.sin(dLon) * Math.cos(lat1),
            Math.cos(point.lat) * Math.sin(lat1) - Math.sin(point.lat) * Math.cos(lat1) * Math.cos(dLon)
        );
        return back + Math.PI;
    }

    /** Posición TEME (km) sobre la órbita de transferencia. */
    coastPosition(seconds) {
        const { radius, radial, tangent, meanMotion } = this.coast;
        const angle = meanMotion * (seconds - this.profile.secoSeconds);
        return add(scale(radial, radius * Math.cos(angle)), scale(tangent, radius * Math.sin(angle)));
    }

    /** Posición TEME (km) en cualquier fase. */
    positionAt(seconds) {
        return seconds <= this.profile.secoSeconds ? this.ascentPosition(Math.max(seconds, 0)) : this.coastPosition(seconds);
    }

    /**
     * Estado del lanzamiento en un instante, o null fuera de la ventana.
     * @returns {{seconds, phase, event, positionLocal, altitudeKm, speedKmS, deployed}|null}
     */
    stateAt(timeMs) {
        if (!this.isActive(timeMs)) return null;
        const seconds = (timeMs - this.launchTimeMs) / 1000;
        const { secoSeconds, deploySeconds } = this.profile;
        const position = this.positionAt(seconds);
        let speedKmS;
        let phase;
        if (seconds < 0) {
            phase = 'En la plataforma';
            speedKmS = 0;
        } else if (seconds <= secoSeconds) {
            phase = 'Ascenso';
            // Velocidad respecto al suelo: derivada numérica del recorrido terrestre.
            const a = this.ascentGeodetic(seconds - 0.5);
            const b = this.ascentGeodetic(seconds + 0.5);
            speedKmS = Math.hypot(b.downrangeKm - a.downrangeKm, b.altitudeKm - a.altitudeKm);
        } else {
            phase = seconds < deploySeconds ? 'Órbita de transferencia' : 'Satélites desplegados';
            speedKmS = Math.sqrt(EARTH_MU / this.coast.radius);
        }
        const event = [...this.profile.events].reverse().find((item) => item.seconds <= seconds) ?? null;
        return {
            seconds,
            phase,
            event,
            positionLocal: toLocal(position),
            altitudeKm: norm(position) - EARTH_RADIUS_KM,
            speedKmS,
            deployed: seconds >= deploySeconds
        };
    }

    /** Recorrido completo (ascenso + transferencia + una revolución tras el despliegue). */
    samplePath(segments = 360) {
        const ascentPoints = 90;
        const points = [];
        const { secoSeconds } = this.profile;
        for (let k = 0; k <= ascentPoints; k++) points.push(toLocal(this.positionAt((k / ascentPoints) * secoSeconds)));
        const coastEnd = this.profile.deploySeconds + (2 * Math.PI) / this.coast.meanMotion;
        for (let k = 1; k <= segments; k++) {
            points.push(toLocal(this.positionAt(secoSeconds + (k / segments) * (coastEnd - secoSeconds))));
        }
        return { points, ascentCount: ascentPoints + 1 };
    }
}
