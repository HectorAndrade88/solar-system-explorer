/**
 * @file info-rows.js
 * Contenido del panel "Objeto seleccionado": encabezados, datos de referencia
 * y filas instantáneas para cuerpos celestes, satélites y lanzamientos.
 * Solo da formato a datos ya calculados; no realiza cálculos astronómicos.
 */
import { BODY_DEFINITIONS } from './planets.js';
import { AU_KM, SPEED_OF_LIGHT_KM_S, SYNODIC_MONTH_DAYS } from './astronomy.js';
import { describeDataAge } from './satellites.js';
import {
    formatNumber, formatDistanceKm, formatAU, formatSpeed, formatRotation, formatOrbitalPeriod,
    formatDegrees, formatTemperature, formatPercent, formatMass, formatMagnitude, formatAzimuth,
    formatLightTime, formatDate, formatTime, formatUtcTime, formatMissionClock, formatElapsedDays
} from './format.js';

const row = (label, value, note = '') => ({ label, value, note });

/** Ángulo horario en formato 12h 34m 56s. */
function formatHours(degrees) {
    const totalSeconds = Math.round((((degrees % 360) + 360) % 360) / 15 * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/** Estación astronómica según la longitud eclíptica aparente del Sol. */
function describeSeason(sunLongitudeDeg) {
    const seasons = [
        'Primavera boreal · otoño austral', 'Verano boreal · invierno austral',
        'Otoño boreal · primavera austral', 'Invierno boreal · verano austral'
    ];
    return seasons[Math.floor(sunLongitudeDeg / 90) % 4];
}

const formatLatitude = (degrees) => `${formatNumber(Math.abs(degrees), 2)}° ${degrees >= 0 ? 'N' : 'S'}`;
const formatLongitude = (degrees) => `${formatNumber(Math.abs(degrees), 2)}° ${degrees >= 0 ? 'E' : 'O'}`;

/* ------------------------------------------------------------------------ */
/* Cuerpos celestes                                                          */
/* ------------------------------------------------------------------------ */

function distanceRows(body) {
    const rows = [row('Distancia al Sol', formatDistanceKm(body.distanceAU * AU_KM), formatAU(body.distanceAU))];
    if (body.distanceToEarthAU !== undefined) {
        const km = body.distanceToEarthAU * AU_KM;
        rows.push(row('Distancia a la Tierra', formatDistanceKm(km), `luz: ${formatLightTime(km / SPEED_OF_LIGHT_KM_S)}`));
    }
    return rows;
}

function orbitRows(body) {
    const { elements } = body;
    return [
        row('Velocidad orbital', formatSpeed(body.orbitalSpeedKmS)),
        row('Periodo orbital', formatOrbitalPeriod(body.orbitalPeriodDays), 'tercera ley de Kepler'),
        row('Inclinación orbital', formatDegrees(elements.inclination, 3), 'respecto a la eclíptica'),
        row('Excentricidad', formatNumber(elements.e, 4)),
        row('Anomalía verdadera', formatDegrees(body.trueAnomalyDeg, 1), 'posición desde el perihelio'),
        row('Inclinación axial', formatDegrees(body.axialTiltDeg, 2), 'calculada (polo IAU)')
    ];
}

/** Datos físicos de referencia de un cuerpo (no dependen de la fecha). */
function bodyStaticRows(definition) {
    const rows = [
        row('Periodo de rotación', formatRotation(definition.rotationHours)),
        row('Radio medio', `${formatNumber(definition.radiusKm, 0)} km`),
        row('Masa', formatMass(definition.massKg)),
        row(definition.temperatureLabel ?? 'Temperatura media', formatTemperature(definition.meanTemperatureC))
    ];
    if (definition.id === 'sun' || definition.id === 'moon') {
        rows.push(row('Inclinación axial', formatDegrees(definition.axialTiltDeg, 2)));
    }
    if (definition.moons !== undefined) rows.push(row('Lunas conocidas', formatNumber(definition.moons, 0)));
    return rows;
}

/** Encabezado y datos de referencia de un cuerpo celeste. */
export function describeBody(id) {
    const definition = BODY_DEFINITIONS[id];
    return {
        bodyId: id,
        symbol: definition.symbol,
        name: definition.name,
        type: definition.type,
        color: definition.color,
        description: definition.description,
        staticRows: bodyStaticRows(definition),
        showMoonPhase: id === 'moon',
        actions: [{ id: 'focus', label: 'Centrar cámara (F)' }]
    };
}

/** Datos instantáneos de un cuerpo calculados para la fecha simulada. */
export function bodyLiveRows(id, snapshot) {
    const body = snapshot.bodies[id];
    if (id === 'sun') {
        const sun = snapshot.sun;
        const km = sun.distanceAU * AU_KM;
        return [
            row('Distancia a la Tierra', formatDistanceKm(km), formatAU(sun.distanceAU)),
            row('Luz tarda en llegar', formatLightTime(km / SPEED_OF_LIGHT_KM_S)),
            row('Longitud eclíptica aparente', formatDegrees(sun.longitudeDeg, 3)),
            row('Ascensión recta', formatHours(sun.rightAscensionDeg)),
            row('Declinación', formatDegrees(sun.declinationDeg, 2)),
            row('Magnitud aparente', formatMagnitude(body.magnitude))
        ];
    }
    if (id === 'moon') {
        const phase = snapshot.moonPhase;
        const eclipse = snapshot.lunarEclipse;
        const rows = [
            row('Fase', phase.name, phase.waxing ? 'creciendo' : 'menguando'),
            row('Iluminación', formatPercent(phase.illumination)),
            row('Edad lunar', `${formatNumber(phase.ageDays, 1)} días`, `mes sinódico: ${formatNumber(SYNODIC_MONTH_DAYS, 2)} días`),
            row('Distancia a la Tierra', `${formatNumber(body.distanceKm, 0)} km`),
            row('Elongación', formatDegrees(phase.elongationDeg, 1)),
            row('Periodo orbital', `${formatNumber(body.orbitalPeriodDays, 2)} días`, 'sidéreo'),
            row('Magnitud aparente', formatMagnitude(body.magnitude))
        ];
        if (eclipse.penumbral > 0) {
            const kind = eclipse.umbral >= 1 ? 'Total' : eclipse.umbral > 0 ? 'Parcial' : 'Penumbral';
            rows.unshift(row('Eclipse lunar', kind, `umbra ${formatPercent(eclipse.umbral)}`));
        }
        return rows;
    }
    if (id === 'earth') {
        return [
            ...distanceRows(body),
            ...orbitRows(body),
            row('Tiempo sidéreo de Greenwich', formatHours(snapshot.gmstDeg)),
            row('Estación', describeSeason(snapshot.sun.longitudeDeg))
        ];
    }
    return [...distanceRows(body), ...orbitRows(body), row('Magnitud aparente', formatMagnitude(body.magnitude))];
}

/** Coordenadas horizontales de un cuerpo visto desde el observador. */
export function bodyObservationRows(observation) {
    const km = observation.distanceAU * AU_KM;
    const altitudeNote = observation.altitudeDeg < 0 ? 'bajo el horizonte' : 'sobre el horizonte';
    return [
        row('Acimut', formatAzimuth(observation.azimuthDeg)),
        row('Altitud', formatDegrees(observation.altitudeDeg, 1), altitudeNote),
        row('Distancia', observation.id === 'moon' ? `${formatNumber(km, 0)} km` : formatDistanceKm(km)),
        row('Magnitud aprox.', formatMagnitude(observation.magnitude))
    ];
}

/* ------------------------------------------------------------------------ */
/* Lanzamientos                                                              */
/* ------------------------------------------------------------------------ */

/** Fecha y hora local de un lanzamiento, respetando la precisión del dato. */
export function formatLaunchDate(launch) {
    const date = new Date(launch.net);
    return launch.precision === 'day' ? formatDate(date) : `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Encabezado y datos de referencia de un lanzamiento.
 * @param {object} launch Entrada del historial.
 * @param {object} site Plataforma.
 * @param {number} trackedCount Satélites del lanzamiento con elementos orbitales.
 */
export function describeLaunch(launch, site, trackedCount) {
    const date = new Date(launch.net);
    const actions = [{ id: 'simulate-launch', label: '▶ Simular lanzamiento' }];
    if (trackedCount > 0) actions.push({ id: 'launch-now', label: 'Ver sus satélites ahora' });
    actions.push({ id: 'open-history', label: 'Historial de lanzamientos' });
    const orbitNote = launch.perigee !== null ? `${formatNumber(launch.perigee, 0)}–${formatNumber(launch.apogee, 0)} km` : '—';
    return {
        bodyId: null,
        symbol: '🚀',
        name: launch.name,
        type: `${launch.rocket} · ${launch.id}`,
        color: '#ffb347',
        description: 'Las órbitas resaltadas son las posiciones reales actuales (SGP4) de los satélites de esta misión. '
            + 'El ascenso del cohete es un modelo educativo: sigue el acimut que produce la inclinación orbital '
            + 'desde la plataforma y la cronología típica de la misión.',
        staticRows: [
            row('Fecha y hora local', formatLaunchDate(launch), launch.precision === 'day' ? 'hora no disponible' : ''),
            row('UTC', launch.precision === 'day' ? formatDate(date) : formatUtcTime(date)),
            row('Plataforma', site?.name ?? launch.site),
            row('Resultado', launch.status === 'success' ? 'Éxito' : 'Fallo'),
            row('Satélites lanzados', formatNumber(launch.satellites, 0)),
            row('Siguen en órbita', formatNumber(launch.inOrbit, 0), `${formatNumber(launch.satellites - launch.inOrbit, 0)} reingresados`),
            row('Con elementos orbitales', formatNumber(trackedCount, 0), trackedCount ? 'visibles en tiempo real' : 'sin TLE públicos en los datos'),
            row('Inclinación orbital', launch.inclination !== null ? formatDegrees(launch.inclination, 1) : '—'),
            row(launch.inOrbit > 0 ? 'Altitud actual (perigeo–apogeo)' : 'Última órbita conocida', orbitNote)
        ],
        showMoonPhase: false,
        actions
    };
}

const SPEED_NOTES = { 'En la plataforma': '', Ascenso: 'respecto al suelo' };

/** Filas instantáneas de un lanzamiento: fase simulada o tiempo transcurrido. */
export function launchLiveRows(launch, timeMs, launchState) {
    if (launchState) {
        return [
            row('Fase', launchState.phase, 'trayectoria modelada'),
            row('Reloj de misión', formatMissionClock(launchState.seconds)),
            row('Último evento', launchState.event?.label ?? '—'),
            row('Altitud (modelo)', `${formatNumber(launchState.altitudeKm, 0)} km`),
            row('Velocidad (modelo)', formatSpeed(launchState.speedKmS), SPEED_NOTES[launchState.phase] ?? 'orbital')
        ];
    }
    return [row('Tiempo desde el lanzamiento', formatElapsedDays((timeMs - Date.parse(launch.net)) / 86400000))];
}

/* ------------------------------------------------------------------------ */
/* Satélites                                                                 */
/* ------------------------------------------------------------------------ */

/** Encabezado y elementos medios de un satélite. */
export function describeSatellite(info, generated) {
    const { elements, launch } = info;
    return {
        bodyId: null,
        symbol: '🛰',
        name: info.name,
        type: `Satélite Starlink · NORAD ${elements.noradId}`,
        color: '#7dffd6',
        description: `Posición calculada con el modelo SGP4 a partir de los elementos orbitales (TLE) de CelesTrak `
            + `obtenidos el ${formatDate(new Date(generated))}. La línea verde es su órbita actual.`,
        staticRows: [
            row('Misión', launch?.name ?? 'Desconocida'),
            row('Lanzamiento', launch ? formatLaunchDate(launch) : '—', launch?.id ?? ''),
            row('Inclinación', formatDegrees(elements.inclinationDeg, 2)),
            row('Periodo orbital', `${formatNumber(elements.periodMinutes, 1)} min`),
            row('Perigeo – apogeo', `${formatNumber(elements.perigeeKm, 0)} – ${formatNumber(elements.apogeeKm, 0)} km`),
            row('Excentricidad', formatNumber(elements.eccentricity, 5))
        ],
        showMoonPhase: false,
        actions: [
            { id: 'follow-satellite', label: 'Seguir satélite (F)' },
            ...(launch ? [{ id: 'show-satellite-launch', label: 'Ver su lanzamiento' }] : [])
        ]
    };
}

/** Posición instantánea del satélite. */
export function satelliteLiveRows(info) {
    const { geodetic } = info;
    const age = describeDataAge(info.dataAgeDays);
    if (!geodetic) {
        return [
            row('Posición', 'No disponible', 'aún no lanzado o fuera del rango del modelo'),
            row('Edad de los elementos', formatElapsedDays(info.dataAgeDays), age.text)
        ];
    }
    return [
        row('Altitud', `${formatNumber(geodetic.altitudeKm, 1)} km`),
        row('Latitud', formatLatitude(geodetic.latitudeDeg)),
        row('Longitud', formatLongitude(geodetic.longitudeDeg)),
        row('Velocidad', formatSpeed(geodetic.speedKmS), `${formatNumber(geodetic.speedKmS * 3600, 0)} km/h`),
        row('Iluminación', info.sunlit ? 'Iluminado por el Sol' : 'En la sombra de la Tierra'),
        row('Edad de los elementos', formatElapsedDays(info.dataAgeDays), age.text)
    ];
}

/** Coordenadas del satélite vistas desde el observador. */
export function satelliteObservationRows(info) {
    const { observation } = info;
    return [
        row('Acimut', formatAzimuth(observation.azimuthDeg)),
        row('Altitud', formatDegrees(observation.altitudeDeg, 1), observation.altitudeDeg < 0 ? 'bajo el horizonte' : 'sobre el horizonte'),
        row('Distancia', `${formatNumber(observation.rangeKm, 0)} km`),
        row('Visible', observation.altitudeDeg > 0 && info.sunlit ? 'Sí, si el cielo está oscuro' : 'No')
    ];
}
