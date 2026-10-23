/**
 * Pruebas del motor astronómico (sin dependencias externas).
 * Ejecución:  node tests/astronomy.test.mjs
 *
 * Compara los resultados con ejemplos publicados (Meeus, "Astronomical
 * Algorithms") y con eventos astronómicos conocidos.
 */
import assert from 'node:assert/strict';
import {
    julianCenturies, greenwichMeanSiderealTimeDeg, moonGeocentric, computeEphemeris,
    solveKepler, angleBetween, horizontalBasis, localSiderealTimeDeg, eclipticToEquatorial,
    dotVec, normalizeVec, RAD
} from '../js/astronomy.js';

let passed = 0;
function check(name, actual, expected, tolerance) {
    const ok = Math.abs(actual - expected) <= tolerance;
    assert.ok(ok, `${name}: obtenido ${actual}, esperado ${expected} ± ${tolerance}`);
    passed++;
    console.log(`✔ ${name}: ${actual.toFixed(4)} (esperado ${expected} ± ${tolerance})`);
}

const elongation = (snapshot, id) => angleBetween(snapshot.bodies[id].geocentric, snapshot.sun.position) * RAD;
const at = (iso) => computeEphemeris(new Date(iso));

// Meeus, ejemplo 47.a: Luna el 12 de abril de 1992 a 0h TD.
const moon = moonGeocentric(julianCenturies(2448724.5));
check('Luna λ (Meeus 47.a)', moon.longitudeOfDateDeg, 133.162655, 1e-5);
check('Luna β (Meeus 47.a)', moon.latitudeDeg, -3.229126, 1e-5);
check('Luna Δ km (Meeus 47.a)', moon.distanceKm, 368409.7, 0.5);

// Meeus, ejemplo 12.a: tiempo sidéreo medio de Greenwich el 10 de abril de 1987 a 0h UT.
check('GMST (Meeus 12.a)', greenwichMeanSiderealTimeDeg(2446895.5), 197.693195, 1e-5);

// Ecuación de Kepler: E − e·sin E = M.
const E = solveKepler(1.2, 0.2);
check('Kepler residuo', E - 0.2 * Math.sin(E) - 1.2, 0, 1e-12);

// Sol aparente en el equinoccio y el solsticio de 2026.
check('λ☉ equinoccio 2026-03-20 14:46 UTC', at('2026-03-20T14:46:00Z').sun.longitudeDeg, 0, 0.02);
check('λ☉ solsticio 2026-06-21 08:24 UTC', at('2026-06-21T08:24:00Z').sun.longitudeDeg, 90, 0.02);

// Oposiciones (elongación ≈ 180°, menos la latitud eclíptica del planeta).
check('Oposición de Júpiter 2026-01-10', elongation(at('2026-01-10T00:00:00Z'), 'jupiter'), 180, 1);
check('Oposición de Saturno 2025-09-21', elongation(at('2025-09-21T00:00:00Z'), 'saturn'), 180, 3);
check('Oposición de Marte 2025-01-16', elongation(at('2025-01-16T02:00:00Z'), 'mars'), 180, 5);
check('Máxima elongación de Venus 2026-08-15', elongation(at('2026-08-15T00:00:00Z'), 'venus'), 45.9, 0.3);

// Fases lunares.
check('Luna llena 2026-10-26 04:12 UTC (iluminación)', at('2026-10-26T04:12:00Z').moonPhase.illumination, 1, 0.005);
check('Luna nueva 2026-10-10 15:50 UTC (iluminación)', at('2026-10-10T15:50:00Z').moonPhase.illumination, 0, 0.005);

// Eclipses lunares de 2026.
check('Eclipse total 2026-03-03 (fracción en umbra)', at('2026-03-03T11:33:00Z').lunarEclipse.umbral, 1, 0);
check('Eclipse parcial 2026-08-28 (magnitud umbral ≈ 0,93)', at('2026-08-28T04:13:00Z').lunarEclipse.umbral, 0.93, 0.03);

// Rotación: oblicuidad calculada desde el polo IAU.
const today = at('2026-10-04T18:00:00Z');
check('Oblicuidad terrestre', today.bodies.earth.axialTiltDeg, 23.44, 0.02);
check('Oblicuidad de Urano (retrógrado)', today.bodies.uranus.axialTiltDeg, 97.8, 0.3);

// Altura del Sol en Bogotá (4,711° N, 74,072° O) en el mediodía solar del 2026-10-04:
// 12:00 + 74,072°/15 − ecuación del tiempo (11 min) ≈ 16:45 UTC; altura = 90° − |φ − δ☉|.
const bogota = at('2026-10-04T16:45:00Z');
const basis = horizontalBasis(4.711, localSiderealTimeDeg(bogota.time.jdUT, -74.072));
const sunDirection = normalizeVec(eclipticToEquatorial(bogota.bodies.sun.geocentric));
check('Altura del Sol al mediodía en Bogotá', Math.asin(dotVec(basis.up, sunDirection)) * RAD, 90 - 4.711 - 4.4, 0.6);

console.log(`\n${passed} comprobaciones superadas.`);
