/**
 * Pruebas del catálogo de satélites, la propagación SGP4 y el modelo de lanzamiento.
 * Ejecución:  node tests/satellites.test.mjs
 */
import assert from 'node:assert/strict';
import { SatelliteCatalog, launchDesignator, describeDataAge, EARTH_RADIUS_KM } from '../js/satellites.js';
import { LaunchTrajectory, launchAzimuthDeg } from '../js/launch-trajectory.js';
import { twoline2satrec } from '../vendor/satellite.js/io.js';
import { sgp4 } from '../vendor/satellite.js/propagation.js';

let passed = 0;
function check(name, condition, detail = '') {
    assert.ok(condition, `${name} ${detail}`);
    passed++;
    console.log(`✔ ${name}${detail ? `: ${detail}` : ''}`);
}

// SGP4: caso de verificación de Vallado et al. (2006), satélite 00005 en t = 0.
const vanguard = twoline2satrec(
    '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
    '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667'
);
const { position } = sgp4(vanguard, 0);
check('SGP4 Vallado 00005 (x, y, z km)',
    Math.abs(position.x - 7022.46529266) < 1e-3 && Math.abs(position.y + 1400.08296755) < 1e-3 && Math.abs(position.z - 0.03995155) < 1e-3,
    `${position.x.toFixed(5)}, ${position.y.toFixed(5)}, ${position.z.toFixed(5)}`);

check('Designador COSPAR desde la línea 1', launchDesignator('1 44714U 19074B   26277.49507853') === '2019-074');
check('Edad de los datos', describeDataAge(0.5).level === 'good' && describeDataAge(10).level === 'fair' && describeDataAge(90).level === 'poor');

const catalog = new SatelliteCatalog();
check('Catálogo cargado', catalog.count > 1000 && catalog.launches.length > 100, `${catalog.count} satélites, ${catalog.launches.length} lanzamientos`);

const linked = [...catalog.launchOf].filter((index) => index >= 0).length;
check('Satélites asociados a su lanzamiento', linked / catalog.count > 0.99, `${linked} de ${catalog.count}`);

// Todos los satélites deben estar en órbita baja en la época de los datos.
const positions = new Float32Array(catalog.count * 3);
const velocities = new Float32Array(catalog.count * 3);
const visible = new Float32Array(catalog.count);
const valid = catalog.propagateAll(catalog.dataEpochMs, positions, velocities, visible);
check('Propagación de todo el catálogo', valid / catalog.count > 0.99, `${valid} válidos`);
let lowEarthOrbit = 0;
for (let i = 0; i < catalog.count; i++) {
    const altitude = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]) - EARTH_RADIUS_KM;
    const speed = Math.hypot(velocities[i * 3], velocities[i * 3 + 1], velocities[i * 3 + 2]);
    if (visible[i] && altitude > 150 && altitude < 1300 && speed > 7 && speed < 8) lowEarthOrbit++;
}
check('Altitudes y velocidades de órbita baja', lowEarthOrbit / valid > 0.99, `${lowEarthOrbit} entre 150–1.300 km y 7–8 km/s`);

// Un satélite no existe antes de su lanzamiento.
const first = catalog.satellitesOfLaunch(catalog.launches.find((launch) => catalog.satellitesOfLaunch(launch.id).length).id)[0];
check('Sin posición antes del lanzamiento', catalog.propagate(first, catalog.launchTimeMs[first] - 1000) === null);

// Periodo orbital coherente con la tercera ley de Kepler para ~550 km (~95,6 min).
const elements = catalog.meanElements(first);
check('Periodo orbital de órbita baja', elements.periodMinutes > 85 && elements.periodMinutes < 110, `${elements.periodMinutes.toFixed(1)} min`);

// Acimut de lanzamiento: polar desde Vandenberg hacia el sur; 53° desde Florida hacia el noreste.
const polar = launchAzimuthDeg(34.63, 97.6, true);
const northeast = launchAzimuthDeg(28.56, 53, false);
check('Acimut polar desde Vandenberg (≈ 190°)', polar > 180 && polar < 200, `${polar.toFixed(1)}°`);
check('Acimut 53° desde Florida (≈ 40°)', northeast > 35 && northeast < 50, `${northeast.toFixed(1)}°`);

// El modelo de trayectoria alcanza la inclinación objetivo y la altitud de inserción.
for (const id of ['2023-099', '2019-074']) {
    const launch = catalog.launchById(id);
    const trajectory = new LaunchTrajectory(launch, catalog.sites[launch.site]);
    const seco = trajectory.stateAt(Date.parse(launch.net) + 600000);
    check(`Trayectoria ${launch.name}: inclinación`, Math.abs(trajectory.coast.inclinationDeg - launch.inclination) < 1.5,
        `${trajectory.coast.inclinationDeg.toFixed(2)}° (objetivo ${launch.inclination}°)`);
    check(`Trayectoria ${launch.name}: altitud tras SECO`, Math.abs(seco.altitudeKm - 280) < 5, `${seco.altitudeKm.toFixed(0)} km`);
}

console.log(`\n${passed} comprobaciones superadas.`);
