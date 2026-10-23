/**
 * @file astronomy.js
 * Motor astronómico de Solar System Explorer.
 *
 * Módulo puro: no depende de Three.js ni del DOM, por lo que puede probarse de
 * forma aislada (por ejemplo con Node.js). Todas las posiciones se calculan
 * matemáticamente a partir de la fecha recibida.
 *
 * Sistemas de referencia utilizados:
 *  - Eclíptica J2000: eje X hacia el equinoccio vernal J2000, eje Z hacia el
 *    polo norte de la eclíptica. Es el marco de la escena 3D.
 *  - Ecuatorial J2000 (≈ ICRF): eje Z hacia el polo norte celeste.
 *  - Horizontal local: acimut medido desde el norte hacia el este, altitud
 *    sobre el horizonte.
 *
 * Unidades: distancias en unidades astronómicas (UA) salvo que el nombre de la
 * propiedad indique otra cosa (Km, KmS); ángulos públicos en grados.
 *
 * Referencias principales:
 *  - E. M. Standish (JPL), "Keplerian Elements for Approximate Positions of
 *    the Major Planets" (tabla 1, válida 1800–2050).
 *  - J. Meeus, "Astronomical Algorithms", 2.ª ed. (capítulos 12, 22, 25, 41, 47, 48, 54).
 *  - IAU WGCCRE 2015, elementos de rotación de los cuerpos del Sistema Solar.
 *  - Espenak & Meeus, polinomios de ΔT (NASA Eclipse Web Site).
 */

/* ------------------------------------------------------------------------ */
/* Constantes                                                                */
/* ------------------------------------------------------------------------ */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const AU_KM = 149597870.7;
export const J2000_JD = 2451545.0;
export const DAYS_PER_CENTURY = 36525;
export const SYNODIC_MONTH_DAYS = 29.530588853;
export const SIDEREAL_MONTH_DAYS = 27.321661;
export const OBLIQUITY_J2000_DEG = 23.4392911;
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
export const MOON_RADIUS_KM = 1737.4;
export const SPEED_OF_LIGHT_KM_S = 299792.458;

/** Rango temporal en que los elementos keplerianos de la tabla 1 del JPL son válidos. */
export const KEPLER_VALIDITY_YEARS = Object.freeze({ from: 1800, to: 2050 });

const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;
const GM_SUN_KM3_S2 = 1.32712440018e11;
const EARTH_MOON_MASS_RATIO = 81.30056;
const SIDEREAL_YEAR_DAYS = 365.256363004;
/** Precesión general en longitud (5029.0966″ por siglo juliano). */
const PRECESSION_DEG_PER_CENTURY = 1.3969713;
/** Constante de aberración anual (Meeus, cap. 25). */
const ABERRATION_DEG = 20.4898 / 3600;
/** Paralaje horizontal ecuatorial del Sol a 1 UA. */
const SUN_PARALLAX_DEG = 8.794143 / 3600;
/** Semidiámetro aparente del Sol a 1 UA. */
const SUN_SEMIDIAMETER_DEG = 959.63 / 3600;
/** Achatamiento terrestre: b/a = 1 − f (WGS84). */
const EARTH_AXIS_RATIO = 0.99664719;

/* ------------------------------------------------------------------------ */
/* Utilidades vectoriales y angulares (objetos {x, y, z} inmutables)         */
/* ------------------------------------------------------------------------ */

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const addVec = (a, b) => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const subVec = (a, b) => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scaleVec = (a, s) => vec3(a.x * s, a.y * s, a.z * s);
export const dotVec = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const crossVec = (a, b) => vec3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
);
export const lengthVec = (a) => Math.hypot(a.x, a.y, a.z);
export const normalizeVec = (a) => scaleVec(a, 1 / (lengthVec(a) || 1));

/** Ángulo entre dos vectores, en radianes (forma numéricamente estable). */
export const angleBetween = (a, b) => Math.atan2(lengthVec(crossVec(a, b)), dotVec(a, b));

/** Reduce un ángulo al intervalo [0, 360). */
export const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

/** Reduce un ángulo al intervalo [−180, 180). */
export const normalizeDegrees180 = (deg) => normalizeDegrees(deg + 180) - 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Rotación de un vector alrededor del eje X. */
function rotateX(v, angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

/** Vector a partir de longitud/latitud (o AR/declinación) en grados. */
export function vectorFromSpherical(lonDeg, latDeg, radius = 1) {
    const lon = lonDeg * DEG;
    const lat = latDeg * DEG;
    const c = Math.cos(lat);
    return vec3(radius * c * Math.cos(lon), radius * c * Math.sin(lon), radius * Math.sin(lat));
}

/** Coordenadas esféricas (longitud [0,360), latitud, radio) de un vector. */
export function sphericalFromVector(v) {
    const r = lengthVec(v);
    return {
        lonDeg: normalizeDegrees(Math.atan2(v.y, v.x) * RAD),
        latDeg: Math.asin(clamp(v.z / (r || 1), -1, 1)) * RAD,
        r
    };
}

/* ------------------------------------------------------------------------ */
/* Escalas de tiempo                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Fecha juliana (UTC) a partir de un objeto Date.
 * El tiempo Unix cuenta milisegundos desde 1970-01-01 00:00 UTC, instante que
 * corresponde a JD 2440587.5:   JD = ms / 86 400 000 + 2 440 587.5
 */
export function julianDate(date) {
    return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/**
 * ΔT = TT − UT en segundos (polinomios de Espenak & Meeus).
 * TT es la escala uniforme de las efemérides; UT sigue la rotación terrestre.
 */
export function deltaTSeconds(decimalYear) {
    const y = decimalYear;
    if (y >= 2005 && y < 2050) {
        const t = y - 2000;
        return 62.92 + 0.32217 * t + 0.005589 * t * t;
    }
    if (y >= 1986 && y < 2005) {
        const t = y - 2000;
        return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
            + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
    }
    if (y >= 1961 && y < 1986) {
        const t = y - 1975;
        return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
    }
    if (y >= 1941 && y < 1961) {
        const t = y - 1950;
        return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
    }
    if (y >= 1920 && y < 1941) {
        const t = y - 1920;
        return 21.20 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
    }
    if (y >= 2050 && y < 2150) {
        return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
    }
    // Fuera de los tramos anteriores: parábola de largo plazo (Morrison & Stephenson).
    return -20 + 32 * ((y - 1820) / 100) ** 2;
}

/** Siglos julianos transcurridos desde J2000.0:  T = (JD − 2451545.0) / 36525 */
export function julianCenturies(jd) {
    return (jd - J2000_JD) / DAYS_PER_CENTURY;
}

/**
 * Estado temporal completo para una fecha:
 *  - jdUT: fecha juliana en UT (rotación terrestre, tiempo sidéreo).
 *  - jdTT: fecha juliana en Tiempo Terrestre (movimiento orbital).
 *  - T:    siglos julianos TT desde J2000.
 *  - d:    días TT desde J2000 (elementos de rotación IAU).
 */
export function createTimeState(date) {
    const jdUT = julianDate(date);
    const decimalYear = 2000 + (jdUT - J2000_JD) / 365.25;
    const deltaT = deltaTSeconds(decimalYear);
    const jdTT = jdUT + deltaT / 86400;
    return {
        timeMs: date.getTime(),
        jdUT,
        jdTT,
        deltaT,
        decimalYear,
        T: julianCenturies(jdTT),
        d: jdTT - J2000_JD
    };
}

/**
 * Tiempo sidéreo medio de Greenwich en grados (IAU 1982, Meeus ec. 12.4):
 * θ0 = 280.46061837 + 360.98564736629·(JD − 2451545) + 0.000387933·T² − T³/38710000
 */
export function greenwichMeanSiderealTimeDeg(jdUT) {
    const T = julianCenturies(jdUT);
    return normalizeDegrees(
        280.46061837 + 360.98564736629 * (jdUT - J2000_JD)
        + 0.000387933 * T * T - (T * T * T) / 38710000
    );
}

/** Tiempo sidéreo local (longitud geográfica positiva hacia el este). */
export function localSiderealTimeDeg(jdUT, longitudeDeg) {
    return normalizeDegrees(greenwichMeanSiderealTimeDeg(jdUT) + longitudeDeg);
}

/** Oblicuidad media de la eclíptica de la fecha (Meeus ec. 22.2). */
export function meanObliquityDeg(T) {
    return 23.439291111 - 0.013004167 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

/* ------------------------------------------------------------------------ */
/* Transformaciones de coordenadas                                           */
/* ------------------------------------------------------------------------ */

/** Eclíptica → ecuatorial: rotación de +ε alrededor del eje X (línea de equinoccios). */
export function eclipticToEquatorial(v, obliquityDeg = OBLIQUITY_J2000_DEG) {
    return rotateX(v, obliquityDeg * DEG);
}

/** Ecuatorial → eclíptica: rotación de −ε alrededor del eje X. */
export function equatorialToEcliptic(v, obliquityDeg = OBLIQUITY_J2000_DEG) {
    return rotateX(v, -obliquityDeg * DEG);
}

/**
 * Matriz de rotación ecuatorial J2000 (ICRS) → galáctica (Hipparcos, 1997).
 * Filas = ejes galácticos expresados en coordenadas ecuatoriales.
 */
export const EQUATORIAL_TO_GALACTIC = Object.freeze([
    [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
    [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
    [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]
]);

/**
 * Base de rotación ecuatorial → horizontal local.
 * Devuelve los ejes (este, arriba, norte) expresados en coordenadas
 * ecuatoriales, de modo que  este = east·v,  arriba = up·v,  norte = north·v.
 * De ahí:  acimut = atan2(este, norte)  (desde el norte hacia el este) y
 *          altitud = asin(arriba).
 *
 * Con ángulo horario H = TSL − α:
 *   este  = −cos δ · sin H
 *   norte =  sin δ · cos φ − cos δ · cos H · sin φ
 *   arriba=  sin δ · sin φ + cos δ · cos H · cos φ
 */
export function horizontalBasis(latitudeDeg, lstDeg) {
    const phi = latitudeDeg * DEG;
    const lst = lstDeg * DEG;
    const sinL = Math.sin(lst), cosL = Math.cos(lst);
    const sinP = Math.sin(phi), cosP = Math.cos(phi);
    return {
        east: vec3(-sinL, cosL, 0),
        up: vec3(cosP * cosL, cosP * sinL, sinP),
        north: vec3(-sinP * cosL, -sinP * sinL, cosP)
    };
}

/**
 * Posición geocéntrica del observador en coordenadas ecuatoriales (UA),
 * considerando el achatamiento terrestre (Meeus cap. 11):
 *   u = atan(b/a · tan φ),  ρ·sin φ′ = b/a · sin u,  ρ·cos φ′ = cos u
 */
export function observerEquatorialPosition(latitudeDeg, lstDeg) {
    const phi = latitudeDeg * DEG;
    const u = Math.atan(EARTH_AXIS_RATIO * Math.tan(phi));
    const rhoSin = EARTH_AXIS_RATIO * Math.sin(u);
    const rhoCos = Math.cos(u);
    const lst = lstDeg * DEG;
    const scale = EARTH_EQUATORIAL_RADIUS_KM / AU_KM;
    return vec3(scale * rhoCos * Math.cos(lst), scale * rhoCos * Math.sin(lst), scale * rhoSin);
}

/* ------------------------------------------------------------------------ */
/* Planetas: elementos keplerianos (JPL, tabla 1, 1800–2050)                 */
/* ------------------------------------------------------------------------ */

/**
 * Elementos orbitales medios J2000 y sus tasas por siglo juliano:
 *   a (UA), e, i (°), L longitud media (°), ϖ longitud del perihelio (°),
 *   Ω longitud del nodo ascendente (°).
 * "earth" corresponde al baricentro Tierra-Luna.
 */
export const PLANET_ELEMENTS = Object.freeze({
    mercury: {
        a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749],
        L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081]
    },
    venus: {
        a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], i: [3.39467605, -0.00078890],
        L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418]
    },
    earth: {
        a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668],
        L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0]
    },
    mars: {
        a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], i: [1.84969142, -0.00813131],
        L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343]
    },
    jupiter: {
        a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714],
        L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106]
    },
    saturn: {
        a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609],
        L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794]
    },
    uranus: {
        a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], i: [0.77263783, -0.00242939],
        L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589]
    },
    neptune: {
        a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], i: [1.77004347, 0.00035372],
        L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664]
    }
});

export const PLANET_IDS = Object.freeze(Object.keys(PLANET_ELEMENTS));

/**
 * Elementos orbitales aproximados en el instante T (siglos TT desde J2000).
 * Cada elemento evoluciona linealmente: x(T) = x0 + ẋ·T.
 * Se derivan:  ω = ϖ − Ω  (argumento del perihelio)  y  M = L − ϖ  (anomalía media).
 */
export function orbitalElementsAt(id, T) {
    const table = PLANET_ELEMENTS[id];
    const at = ([value, rate]) => value + rate * T;
    const longitudeOfPerihelion = at(table.peri);
    const longitudeOfNode = at(table.node);
    const meanLongitude = at(table.L);
    return {
        a: at(table.a),
        e: at(table.e),
        inclination: at(table.i),
        meanLongitude,
        longitudeOfPerihelion,
        longitudeOfNode,
        argumentOfPerihelion: longitudeOfPerihelion - longitudeOfNode,
        meanAnomaly: normalizeDegrees180(meanLongitude - longitudeOfPerihelion)
    };
}

/**
 * Resuelve la ecuación de Kepler  M = E − e·sin E  por Newton-Raphson:
 *   E(n+1) = E(n) − (E(n) − e·sin E(n) − M) / (1 − e·cos E(n))
 * @param {number} meanAnomaly Anomalía media en radianes.
 * @param {number} e Excentricidad (0 ≤ e < 1).
 * @returns {number} Anomalía excéntrica E en radianes.
 */
export function solveKepler(meanAnomaly, e) {
    let E = meanAnomaly + e * Math.sin(meanAnomaly);
    for (let iteration = 0; iteration < 30; iteration++) {
        const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
        E -= delta;
        if (Math.abs(delta) < 1e-12) break;
    }
    return E;
}

/**
 * Posición heliocéntrica eclíptica J2000 para una anomalía excéntrica dada.
 *  1) Coordenadas en el plano orbital (perihelio en +x′):
 *       x′ = a·(cos E − e),   y′ = a·√(1 − e²)·sin E
 *  2) Rotaciones Rz(Ω)·Rx(i)·Rz(ω) hacia la eclíptica J2000.
 */
export function positionOnOrbit(elements, eccentricAnomaly) {
    const { a, e } = elements;
    const xp = a * (Math.cos(eccentricAnomaly) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly);

    const w = elements.argumentOfPerihelion * DEG;
    const node = elements.longitudeOfNode * DEG;
    const inc = elements.inclination * DEG;
    const cw = Math.cos(w), sw = Math.sin(w);
    const cn = Math.cos(node), sn = Math.sin(node);
    const ci = Math.cos(inc), si = Math.sin(inc);

    return vec3(
        (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
        (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
        (sw * si) * xp + (cw * si) * yp
    );
}

/** Normal unitaria del plano orbital (dirección del momento angular). */
export function orbitNormal(elements) {
    const inc = elements.inclination * DEG;
    const node = elements.longitudeOfNode * DEG;
    return vec3(Math.sin(inc) * Math.sin(node), -Math.sin(inc) * Math.cos(node), Math.cos(inc));
}

/** Velocidad orbital instantánea por la ecuación vis-viva:  v² = GM☉·(2/r − 1/a). */
export function orbitalSpeedKmS(distanceAU, semiMajorAxisAU) {
    const r = distanceAU * AU_KM;
    const a = semiMajorAxisAU * AU_KM;
    return Math.sqrt(GM_SUN_KM3_S2 * (2 / r - 1 / a));
}

/** Periodo sidéreo por la tercera ley de Kepler:  P = 1 año sidéreo · a^(3/2). */
export function orbitalPeriodDays(semiMajorAxisAU) {
    return SIDEREAL_YEAR_DAYS * semiMajorAxisAU ** 1.5;
}

/** Posición heliocéntrica y datos orbitales de un planeta en el instante T. */
export function heliocentricPlanet(id, T) {
    const elements = orbitalElementsAt(id, T);
    const E = solveKepler(elements.meanAnomaly * DEG, elements.e);
    const position = positionOnOrbit(elements, E);
    const distanceAU = lengthVec(position);
    // Anomalía verdadera: tan(ν/2) = √((1+e)/(1−e)) · tan(E/2)
    const trueAnomaly = 2 * Math.atan2(
        Math.sqrt(1 + elements.e) * Math.sin(E / 2),
        Math.sqrt(1 - elements.e) * Math.cos(E / 2)
    );
    return {
        elements,
        position,
        distanceAU,
        trueAnomalyDeg: normalizeDegrees(trueAnomaly * RAD),
        orbitalSpeedKmS: orbitalSpeedKmS(distanceAU, elements.a),
        orbitalPeriodDays: orbitalPeriodDays(elements.a)
    };
}

/** Muestrea la elipse orbital completa (anomalía excéntrica uniforme). */
export function sampleOrbit(id, T, segments = 256) {
    const elements = orbitalElementsAt(id, T);
    const points = [];
    for (let k = 0; k <= segments; k++) {
        points.push(positionOnOrbit(elements, (k / segments) * 2 * Math.PI));
    }
    return points;
}

/* ------------------------------------------------------------------------ */
/* Luna: teoría ELP-2000/82 truncada (Meeus, capítulo 47)                    */
/* ------------------------------------------------------------------------ */

/**
 * Términos periódicos en longitud (Σl, 1e-6 °) y distancia (Σr, 1e-3 km).
 * Columnas: múltiplos de D, M, M′, F y los coeficientes de sin (Σl) y cos (Σr).
 */
const MOON_LONGITUDE_DISTANCE_TERMS = [
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
    [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
    [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
    [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
    [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
    [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
    [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
    [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
    [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
    [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
    [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
    [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
    [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
    [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
    [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
    [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
    [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
    [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
    [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
    [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
    [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
    [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
    [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
    [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
];

/** Términos periódicos en latitud (Σb, 1e-6 °). Columnas: D, M, M′, F, coeficiente de sin. */
const MOON_LATITUDE_TERMS = [
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
    [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
    [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
    [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
    [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
    [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
    [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
    [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607],
    [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
    [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421],
    [2, 1, -1, 1, -366], [2, 1, 0, 1, -351], [4, 0, 0, 1, 331],
    [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283],
    [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
    [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185],
    [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176],
    [4, -1, -1, -1, 166], [1, 0, 1, -1, -164], [4, 0, 1, -1, 132],
    [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]
];

/**
 * Argumentos fundamentales de la Luna en grados (Meeus ec. 47.1–47.5):
 *  L′ longitud media, D elongación media, M anomalía media del Sol,
 *  M′ anomalía media de la Luna, F argumento de latitud.
 */
export function moonFundamentalArguments(T) {
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    return {
        Lp: normalizeDegrees(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000),
        D: normalizeDegrees(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
        M: normalizeDegrees(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
        Mp: normalizeDegrees(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
        F: normalizeDegrees(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000)
    };
}

/**
 * Posición geocéntrica de la Luna.
 *   λ = L′ + Σl·10⁻⁶,   β = Σb·10⁻⁶,   Δ = 385000.56 km + Σr·10⁻³
 * Los términos que contienen M se multiplican por E = 1 − 0.002516·T − 0.0000074·T²
 * (variación secular de la excentricidad terrestre).
 * El resultado (eclíptica media de la fecha) se lleva a J2000 restando la
 * precesión general en longitud, para que sea coherente con los planetas.
 */
export function moonGeocentric(T) {
    const { Lp, D, M, Mp, F } = moonFundamentalArguments(T);
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const eccentricityFactor = (m) => (Math.abs(m) === 2 ? E * E : Math.abs(m) === 1 ? E : 1);

    let sumL = 0;
    let sumR = 0;
    for (const [d, m, mp, f, l, r] of MOON_LONGITUDE_DISTANCE_TERMS) {
        const arg = (d * D + m * M + mp * Mp + f * F) * DEG;
        const factor = eccentricityFactor(m);
        sumL += l * factor * Math.sin(arg);
        sumR += r * factor * Math.cos(arg);
    }

    let sumB = 0;
    for (const [d, m, mp, f, b] of MOON_LATITUDE_TERMS) {
        sumB += b * eccentricityFactor(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * DEG);
    }

    // Perturbaciones aditivas de Venus (A1), Júpiter (A2) y del achatamiento terrestre (L′).
    const A1 = (119.75 + 131.849 * T) * DEG;
    const A2 = (53.09 + 479264.290 * T) * DEG;
    const A3 = (313.45 + 481266.484 * T) * DEG;
    const LpRad = Lp * DEG, MpRad = Mp * DEG, FRad = F * DEG;
    sumL += 3958 * Math.sin(A1) + 1962 * Math.sin(LpRad - FRad) + 318 * Math.sin(A2);
    sumB += -2235 * Math.sin(LpRad) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - FRad)
        + 175 * Math.sin(A1 + FRad) + 127 * Math.sin(LpRad - MpRad) - 115 * Math.sin(LpRad + MpRad);

    const longitudeOfDateDeg = normalizeDegrees(Lp + sumL / 1e6);
    const latitudeDeg = sumB / 1e6;
    const distanceKm = 385000.56 + sumR / 1000;
    const longitudeDeg = normalizeDegrees(longitudeOfDateDeg - PRECESSION_DEG_PER_CENTURY * T);

    return {
        longitudeOfDateDeg,
        longitudeDeg,
        latitudeDeg,
        distanceKm,
        position: vectorFromSpherical(longitudeDeg, latitudeDeg, distanceKm / AU_KM)
    };
}

/**
 * Trayectoria geocéntrica de la Luna durante un mes sidéreo centrado en T.
 * Como la órbita lunar precesa rápidamente, se muestrea la trayectoria real
 * en lugar de dibujar una elipse fija.
 */
export function sampleMoonOrbit(T, segments = 180) {
    const halfSpan = SIDEREAL_MONTH_DAYS / 2 / DAYS_PER_CENTURY;
    const points = [];
    for (let k = 0; k <= segments; k++) {
        points.push(moonGeocentric(T - halfSpan + (2 * halfSpan * k) / segments).position);
    }
    return points;
}

/* ------------------------------------------------------------------------ */
/* Sol aparente, fases lunares y eclipses                                    */
/* ------------------------------------------------------------------------ */

/**
 * Posición geocéntrica aparente del Sol.
 * El vector Tierra→Sol es el opuesto de la posición heliocéntrica de la Tierra.
 * Se aplica la precesión (J2000 → fecha) y la aberración anual (−20.4898″/R).
 */
export function sunApparentPosition(earthHeliocentric, T) {
    const position = scaleVec(earthHeliocentric, -1);
    const { lonDeg, latDeg, r } = sphericalFromVector(position);
    const longitudeDeg = normalizeDegrees(lonDeg + PRECESSION_DEG_PER_CENTURY * T - ABERRATION_DEG / r);
    const obliquity = meanObliquityDeg(T);
    const equatorial = sphericalFromVector(
        eclipticToEquatorial(vectorFromSpherical(longitudeDeg, latDeg), obliquity)
    );
    return {
        position,
        distanceAU: r,
        longitudeDeg,
        latitudeDeg: latDeg,
        rightAscensionDeg: equatorial.lonDeg,
        declinationDeg: equatorial.latDeg,
        semidiameterDeg: SUN_SEMIDIAMETER_DEG / r
    };
}

const LUNAR_PHASE_NAMES = [
    'Luna nueva', 'Creciente', 'Cuarto creciente', 'Gibosa creciente',
    'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Menguante'
];

/**
 * Fase lunar (Meeus cap. 48).
 *  ψ: elongación geocéntrica Luna–Sol.
 *  i: ángulo de fase Sol–Luna–Tierra,  tan i = R·sin ψ / (Δ − R·cos ψ).
 *  k: fracción iluminada = (1 + cos i) / 2.
 * La edad lunar se estima con la diferencia de longitudes eclípticas
 * Luna − Sol, que crece 360° en un mes sinódico.
 */
export function lunarPhase(sunGeocentric, moonGeocentricPosition) {
    const R = lengthVec(sunGeocentric);
    const delta = lengthVec(moonGeocentricPosition);
    const psi = angleBetween(sunGeocentric, moonGeocentricPosition);
    const phaseAngle = Math.atan2(R * Math.sin(psi), delta - R * Math.cos(psi));
    const illumination = (1 + Math.cos(phaseAngle)) / 2;

    const elongationLongitude = normalizeDegrees(
        sphericalFromVector(moonGeocentricPosition).lonDeg - sphericalFromVector(sunGeocentric).lonDeg
    );
    const sector = Math.floor(normalizeDegrees(elongationLongitude + 22.5) / 45) % 8;
    return {
        phaseAngleDeg: phaseAngle * RAD,
        elongationDeg: psi * RAD,
        illumination,
        waxing: elongationLongitude < 180,
        ageDays: (elongationLongitude / 360) * SYNODIC_MONTH_DAYS,
        name: LUNAR_PHASE_NAMES[sector]
    };
}

/**
 * Grado de inmersión de la Luna en la sombra terrestre (eclipse lunar).
 * Radios angulares de la sombra (Meeus cap. 54, con ampliación atmosférica 1.02):
 *   umbra    = 1.02 · (π☾ + π☉ − s☉)
 *   penumbra = 1.02 · (π☾ + π☉ + s☉)
 * La fracción del disco lunar cubierta se aproxima linealmente.
 */
export function lunarEclipseShadow(sunGeocentric, moonGeocentricPosition) {
    const R = lengthVec(sunGeocentric);
    const moonKm = lengthVec(moonGeocentricPosition) * AU_KM;
    const moonParallax = Math.asin(EARTH_EQUATORIAL_RADIUS_KM / moonKm);
    const moonSemidiameter = Math.asin(MOON_RADIUS_KM / moonKm);
    const sunParallax = (SUN_PARALLAX_DEG / R) * DEG;
    const sunSemidiameter = (SUN_SEMIDIAMETER_DEG / R) * DEG;

    const umbraRadius = 1.02 * (moonParallax + sunParallax - sunSemidiameter);
    const penumbraRadius = 1.02 * (moonParallax + sunParallax + sunSemidiameter);
    const separation = angleBetween(scaleVec(sunGeocentric, -1), moonGeocentricPosition);
    const coverage = (radius) => clamp((radius + moonSemidiameter - separation) / (2 * moonSemidiameter), 0, 1);

    return {
        umbral: coverage(umbraRadius),
        penumbral: coverage(penumbraRadius),
        separationDeg: separation * RAD
    };
}

/* ------------------------------------------------------------------------ */
/* Rotación de los cuerpos (IAU WGCCRE 2015)                                 */
/* ------------------------------------------------------------------------ */

/**
 * Modelos de rotación: polo norte (α0, δ0) en ecuatoriales J2000 y ángulo
 * del meridiano principal W = W0 + Ẇ·d (d en días desde J2000).
 * Una tasa Ẇ negativa indica rotación retrógrada (Venus, Urano).
 */
const ROTATION_MODELS = {
    sun: () => ({ ra: 286.13, dec: 63.87, w0: 84.176, rate: 14.1844 }),
    mercury: (T) => ({ ra: 281.0103 - 0.0328 * T, dec: 61.4155 - 0.0049 * T, w0: 329.5988, rate: 6.1385108 }),
    venus: () => ({ ra: 272.76, dec: 67.16, w0: 160.20, rate: -1.4813688 }),
    mars: (T) => ({ ra: 317.68143 - 0.1061 * T, dec: 52.8865 - 0.0609 * T, w0: 176.630, rate: 350.89198226 }),
    jupiter: (T) => ({ ra: 268.056595 - 0.006499 * T, dec: 64.495303 + 0.002413 * T, w0: 284.95, rate: 870.5360000 }),
    saturn: (T) => ({ ra: 40.589 - 0.036 * T, dec: 83.537 - 0.004 * T, w0: 38.90, rate: 810.7939024 }),
    uranus: () => ({ ra: 257.311, dec: -15.175, w0: 203.81, rate: -501.1600928 }),
    neptune: (T) => {
        const N = (357.85 + 52.316 * T) * DEG;
        return {
            ra: 299.36 + 0.70 * Math.sin(N), dec: 43.46 - 0.51 * Math.cos(N),
            w0: 249.978 - 0.48 * Math.sin(N), rate: 541.1397757
        };
    },
    moon: (T, d) => {
        // Término principal de la libración física (argumento E1 ligado al nodo lunar).
        const E1 = (125.045 - 0.0529921 * d) * DEG;
        return {
            ra: 269.9949 + 0.0031 * T - 3.8787 * Math.sin(E1),
            dec: 66.5392 + 0.0130 * T + 1.5419 * Math.cos(E1),
            w0: 38.3213 + 3.5610 * Math.sin(E1), rate: 13.17635815
        };
    }
};

/**
 * Estado de rotación de un cuerpo en un instante.
 * Para la Tierra se usa el tiempo sidéreo de Greenwich (escala UT): el
 * meridiano de Greenwich está a GMST del equinoccio y el nodo del ecuador
 * a 90°, por lo que W = GMST − 90°.
 */
export function rotationState(id, time) {
    if (id === 'earth') {
        return {
            poleRaDeg: -0.641 * time.T,
            poleDecDeg: 90 - 0.557 * time.T,
            meridianDeg: normalizeDegrees(greenwichMeanSiderealTimeDeg(time.jdUT) - 90),
            rateDegPerDay: 360.98564736629,
            referenceDay: time.d
        };
    }
    const model = ROTATION_MODELS[id](time.T, time.d);
    return {
        poleRaDeg: model.ra,
        poleDecDeg: model.dec,
        meridianDeg: normalizeDegrees(model.w0 + model.rate * time.d),
        rateDegPerDay: model.rate,
        referenceDay: time.d
    };
}

/**
 * Base ortonormal del cuerpo en coordenadas eclípticas J2000:
 *  - pole: eje de rotación (polo norte IAU).
 *  - primeMeridian: dirección del meridiano 0° sobre el ecuador.
 *  - east: dirección de longitud 90° E (pole × primeMeridian).
 * Construcción: Q = nodo ascendente del ecuador del cuerpo sobre el ecuador
 * terrestre (en α0 + 90°); el meridiano está a W de Q, girando sobre el polo.
 */
export function bodyFrame(poleRaDeg, poleDecDeg, meridianDeg) {
    const pole = vectorFromSpherical(poleRaDeg, poleDecDeg);
    const node = vec3(-Math.sin(poleRaDeg * DEG), Math.cos(poleRaDeg * DEG), 0);
    const nodeEast = crossVec(pole, node);
    const w = meridianDeg * DEG;
    const meridian = addVec(scaleVec(node, Math.cos(w)), scaleVec(nodeEast, Math.sin(w)));
    const east = crossVec(pole, meridian);
    return {
        pole: equatorialToEcliptic(pole),
        primeMeridian: equatorialToEcliptic(meridian),
        east: equatorialToEcliptic(east)
    };
}

/**
 * Inclinación axial (oblicuidad): ángulo entre el eje de rotación y la normal
 * orbital. El polo IAU es el del lado norte del plano invariable; en los
 * rotadores retrógrados (Ẇ < 0) el polo de la regla de la mano derecha es el
 * opuesto, por lo que la oblicuidad convencional es 180° − ángulo.
 */
export function axialTiltDeg(poleEcliptic, orbitNormalVector, rotationRate) {
    const angle = angleBetween(poleEcliptic, orbitNormalVector) * RAD;
    return rotationRate < 0 ? 180 - angle : angle;
}

/* ------------------------------------------------------------------------ */
/* Magnitudes aparentes (Meeus cap. 41)                                      */
/* ------------------------------------------------------------------------ */

/**
 * Magnitud visual aproximada:  m = H + 5·log10(r·Δ) + f(i)
 * @param {string} id Cuerpo.
 * @param {number} r Distancia al Sol (UA).
 * @param {number} delta Distancia a la Tierra (UA).
 * @param {number} i Ángulo de fase en grados.
 * @param {object} [rings] Para Saturno: { tiltDeg, deltaUDeg } geometría de los anillos.
 */
export function apparentMagnitude(id, r, delta, i, rings) {
    const distanceTerm = 5 * Math.log10(r * delta);
    switch (id) {
        case 'sun': return -26.74 + 5 * Math.log10(delta);
        case 'mercury': return -0.42 + distanceTerm + 0.0380 * i - 0.000273 * i ** 2 + 0.000002 * i ** 3;
        case 'venus': return -4.40 + distanceTerm + 0.0009 * i + 0.000239 * i ** 2 - 0.00000065 * i ** 3;
        case 'mars': return -1.52 + distanceTerm + 0.016 * i;
        case 'jupiter': return -9.40 + distanceTerm + 0.005 * i;
        case 'saturn': {
            const B = Math.abs(rings?.tiltDeg ?? 0) * DEG;
            return -8.88 + distanceTerm + 0.044 * Math.abs(rings?.deltaUDeg ?? 0)
                - 2.60 * Math.sin(B) + 1.25 * Math.sin(B) ** 2;
        }
        case 'uranus': return -7.19 + distanceTerm;
        case 'neptune': return -6.87 + distanceTerm;
        case 'moon': {
            // Fórmula definida a distancia media; se corrige por las distancias reales.
            const meanDistanceAU = 384400 / AU_KM;
            return -12.73 + 0.026 * Math.abs(i) + 4e-9 * i ** 4 + 5 * Math.log10((delta / meanDistanceAU) * r);
        }
        default: return NaN;
    }
}

/**
 * Geometría de los anillos de Saturno vista desde la Tierra:
 *  B: inclinación del plano de los anillos respecto a la visual.
 *  ΔU: diferencia de longitudes saturnicéntricas del Sol y la Tierra.
 */
export function saturnRingGeometry(poleEcliptic, saturnHelio, earthHelio) {
    const toEarth = normalizeVec(subVec(earthHelio, saturnHelio));
    const toSun = normalizeVec(scaleVec(saturnHelio, -1));
    const project = (v) => normalizeVec(subVec(v, scaleVec(poleEcliptic, dotVec(v, poleEcliptic))));
    return {
        tiltDeg: Math.asin(clamp(dotVec(poleEcliptic, toEarth), -1, 1)) * RAD,
        deltaUDeg: angleBetween(project(toEarth), project(toSun)) * RAD
    };
}

/* ------------------------------------------------------------------------ */
/* Efemérides completas                                                      */
/* ------------------------------------------------------------------------ */

/** Cuerpos con modelo de rotación, en el orden en que se calculan. */
export const ROTATING_BODY_IDS = Object.freeze(['sun', ...PLANET_IDS, 'moon']);

/** Completa los datos geocéntricos (distancia, fase, magnitud) de un cuerpo. */
function addGeocentricData(body, earthPosition) {
    const geocentric = body.geocentric ?? subVec(body.position, earthPosition);
    body.geocentric = geocentric;
    body.distanceToEarthAU = lengthVec(geocentric);
    if (body.id === 'sun') {
        body.phaseAngleDeg = 0;
    } else {
        // Ángulo de fase: entre las direcciones cuerpo→Sol y cuerpo→Tierra.
        body.phaseAngleDeg = angleBetween(scaleVec(body.position, -1), scaleVec(geocentric, -1)) * RAD;
    }
    const rings = body.id === 'saturn'
        ? saturnRingGeometry(body.frame.pole, body.position, earthPosition)
        : undefined;
    body.magnitude = apparentMagnitude(body.id, body.distanceAU, body.distanceToEarthAU, body.phaseAngleDeg, rings);
}

/**
 * Calcula una instantánea astronómica completa para una fecha.
 * Es la única función "pesada" del motor (≈ 10 ecuaciones de Kepler y
 * 120 términos lunares) y se invoca de forma limitada desde EphemerisService.
 *
 * @param {Date} date Instante a calcular.
 * @returns {object} Posiciones heliocéntricas, datos geocéntricos, fase
 *   lunar, eclipse, rotaciones y magnitudes.
 */
export function computeEphemeris(date) {
    const time = createTimeState(date);
    const { T } = time;
    const moon = moonGeocentric(T);
    const bodies = { sun: { id: 'sun', position: vec3(), distanceAU: 0 } };

    for (const id of PLANET_IDS) {
        bodies[id] = { id, ...heliocentricPlanet(id, T) };
    }

    // La tabla del JPL da el baricentro Tierra-Luna; la Tierra se desplaza en
    // sentido opuesto a la Luna en proporción a la razón de masas (1 : 81.3).
    const earthPosition = subVec(bodies.earth.position, scaleVec(moon.position, 1 / (1 + EARTH_MOON_MASS_RATIO)));
    bodies.earth.position = earthPosition;
    bodies.earth.distanceAU = lengthVec(earthPosition);
    bodies.earth.orbitalSpeedKmS = orbitalSpeedKmS(bodies.earth.distanceAU, bodies.earth.elements.a);

    const moonPosition = addVec(earthPosition, moon.position);
    bodies.moon = {
        id: 'moon',
        position: moonPosition,
        geocentric: moon.position,
        distanceAU: lengthVec(moonPosition),
        distanceKm: moon.distanceKm,
        longitudeDeg: moon.longitudeDeg,
        latitudeDeg: moon.latitudeDeg,
        orbitalPeriodDays: SIDEREAL_MONTH_DAYS
    };

    for (const id of ROTATING_BODY_IDS) {
        const body = bodies[id];
        body.rotation = rotationState(id, time);
        body.frame = bodyFrame(body.rotation.poleRaDeg, body.rotation.poleDecDeg, body.rotation.meridianDeg);
        if (body.elements) {
            body.axialTiltDeg = axialTiltDeg(body.frame.pole, orbitNormal(body.elements), body.rotation.rateDegPerDay);
        }
        if (id !== 'earth') {
            addGeocentricData(body, earthPosition);
        }
    }

    const sun = sunApparentPosition(earthPosition, T);
    return {
        time,
        bodies,
        sun,
        moonPhase: lunarPhase(sun.position, moon.position),
        lunarEclipse: lunarEclipseShadow(sun.position, moon.position),
        gmstDeg: greenwichMeanSiderealTimeDeg(time.jdUT),
        withinKeplerValidity: time.decimalYear >= KEPLER_VALIDITY_YEARS.from
            && time.decimalYear <= KEPLER_VALIDITY_YEARS.to
    };
}
