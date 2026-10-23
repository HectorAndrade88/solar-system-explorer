/**
 * @file satellite-layer.js
 * Representación 3D de la constelación Starlink y de los lanzamientos.
 *
 * Marco: un grupo hijo de la Tierra orientado según el sistema inercial TEME
 * (eje X hacia el equinoccio, eje Y hacia el polo) y escalado para que 1 km
 * real equivalga a radioVisualTierra / 6371 km. Así las órbitas guardan la
 * proporción correcta respecto al globo dibujado, y como la Tierra gira con
 * el mismo tiempo sidéreo que usa SGP4, cada satélite pasa sobre el punto
 * geográfico correcto.
 *
 * Rendimiento: SGP4 completo de todo el catálogo solo cuando el tiempo
 * simulado se aleja más de PERFORMANCE.satelliteRefreshSeconds del último
 * cálculo; entre tanto la GPU extrapola cada órbita (ver satellites.glsl.js).
 */
import * as THREE from 'three';
import {
    bodyFrame, horizontalBasis, localSiderealTimeDeg, observerEquatorialPosition,
    eclipticToEquatorial, scaleVec, AU_KM, RAD
} from './astronomy.js';
import { frameToMatrix } from './scale.js';
import { EARTH_RADIUS_KM } from './satellites.js';
import { LaunchTrajectory } from './launch-trajectory.js';
import { createRadialGlowTexture, GLOW_STOPS_SOFT } from './textures.js';
import { projectToScreen } from './labels.js';
import {
    SATELLITE_SPACE_VERTEX_SHADER, SATELLITE_SKY_VERTEX_SHADER, SATELLITE_FRAGMENT_SHADER
} from './shaders/satellites.glsl.js';
import { PERFORMANCE } from './config.js';

const MS_PER_DAY = 86400000;
const UNIX_EPOCH_JD = 2440587.5;
const SKY_RADIUS = 850;
const PICK_RADIUS_PX = 9;
const MARKER_SIZE_PX = 16;
const ROCKET_SIZE_PX = 22;
const ORBIT_REFRESH_MS = 120000;
const LAUNCH_ORBIT_REFRESH_MS = 600000;

const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const inverseRotation = new THREE.Quaternion();

/** Extrapolación circular idéntica a la del shader (para selección con el ratón). */
function propagateCircular(positions, velocities, index, dt, target) {
    const i = index * 3;
    const r = target.set(positions[i], positions[i + 1], positions[i + 2]);
    const radius = r.length();
    const radial = scratchB.copy(r).divideScalar(radius);
    const vx = velocities[i], vy = velocities[i + 1], vz = velocities[i + 2];
    const radialSpeed = vx * radial.x + vy * radial.y + vz * radial.z;
    const tx = vx - radialSpeed * radial.x, ty = vy - radialSpeed * radial.y, tz = vz - radialSpeed * radial.z;
    const speed = Math.hypot(tx, ty, tz);
    const angle = (speed / radius) * dt;
    const c = Math.cos(angle) * radius;
    const s = Math.sin(angle) * radius / speed;
    return target.set(radial.x * c + tx * s, radial.y * c + ty * s, radial.z * c + tz * s);
}

/** Línea reutilizable con vértices reemplazables. */
function createLine(color, opacity, vertexColors = false) {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, vertexColors });
    const line = new THREE.Line(new THREE.BufferGeometry(), material);
    line.frustumCulled = false;
    line.visible = false;
    return line;
}

function setPoints(line, points, colors = null) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    if (colors) line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/** Sprite de tamaño constante en pantalla. */
function createMarker(texture, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    sprite.visible = false;
    return sprite;
}

export class SatelliteLayer {
    /**
     * @param {import('./satellites.js').SatelliteCatalog} catalog
     * @param {import('./earth.js').Earth} earth Cuerpo al que se ancla la constelación.
     * @param {import('./sky-view.js').SkyView} skyView Vista desde la superficie.
     * @param {number} pixelRatio Relación de píxeles del renderizador.
     */
    constructor(catalog, earth, skyView, pixelRatio) {
        this.catalog = catalog;
        this.earth = earth;
        this.skyView = skyView;
        this.snapshotTimeMs = NaN;
        this.selectedIndex = -1;
        this.launch = null;
        this.trajectory = null;
        this.orbitTimeMs = NaN;
        this.launchOrbitsTimeMs = NaN;
        this.dt = 0;
        this.frameMatrix = new THREE.Matrix4();

        const count = catalog.count;
        this.positions = new Float32Array(count * 3);
        this.velocities = new Float32Array(count * 3);
        this.visibleFlags = new Float32Array(count);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('aVisible', new THREE.BufferAttribute(this.visibleFlags, 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('aLaunch', new THREE.BufferAttribute(Float32Array.from(catalog.launchOf), 1));

        this.uniforms = {
            uDt: { value: 0 },
            uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
            uHighlight: { value: -1 },
            uPixelRatio: { value: pixelRatio },
            uSize: { value: 2.4 }
        };
        this.group = new THREE.Group();
        this.group.name = 'Satélites (TEME)';
        earth.root.add(this.group);

        this.spacePoints = this.createPoints(SATELLITE_SPACE_VERTEX_SHADER, this.uniforms, true);
        this.group.add(this.spacePoints);

        this.skyUniforms = {
            ...this.uniforms,
            uSize: { value: 2.6 },
            uObserver: { value: new THREE.Vector3() },
            uHorizon: { value: new THREE.Matrix3() },
            uDaylight: { value: 0 },
            uSkyRadius: { value: SKY_RADIUS }
        };
        this.skyPoints = this.createPoints(SATELLITE_SKY_VERTEX_SHADER, this.skyUniforms, false);
        this.skyPoints.renderOrder = 11;
        skyView.scene.add(this.skyPoints);

        const glow = createRadialGlowTexture(GLOW_STOPS_SOFT, 128);
        this.marker = createMarker(glow, new THREE.Color(0.6, 1.0, 0.85));
        this.orbitLine = createLine(0x7dffd6, 0.85);
        this.launchOrbits = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
            color: 0xffc35a, transparent: true, opacity: 0.32, depthWrite: false
        }));
        this.launchOrbits.frustumCulled = false;
        this.launchOrbits.visible = false;
        this.trajectoryLine = createLine(0xffffff, 0.95, true);
        this.rocket = createMarker(glow, new THREE.Color(1.6, 0.9, 0.45));
        this.group.add(this.marker, this.orbitLine, this.launchOrbits, this.trajectoryLine, this.rocket);

        this.skyMarker = createMarker(glow, new THREE.Color(0.6, 1.0, 0.85));
        this.skyMarker.material.depthTest = false;
        this.skyMarker.renderOrder = 11;
        skyView.scene.add(this.skyMarker);
    }

    createPoints(vertexShader, uniforms, depthTest) {
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader: SATELLITE_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            depthTest
        });
        const points = new THREE.Points(this.geometry, material);
        points.frustumCulled = false;
        return points;
    }

    /* --------------------------- Propagación --------------------------- */

    /** Propaga todo el catálogo con SGP4 si el instante se alejó del último cálculo. */
    ensureSnapshot(timeMs) {
        if (Math.abs(timeMs - this.snapshotTimeMs) <= PERFORMANCE.satelliteRefreshSeconds * 1000) return;
        this.catalog.propagateAll(timeMs, this.positions, this.velocities, this.visibleFlags);
        for (const name of ['position', 'aVelocity', 'aVisible']) this.geometry.attributes[name].needsUpdate = true;
        this.snapshotTimeMs = timeMs;
    }

    /** Orientación inercial del grupo y dirección del Sol en su marco. */
    updateFrame(state) {
        const rotation = state.snapshot.bodies.earth.rotation;
        // Meridiano −90°: el eje X local apunta al equinoccio (marco TEME).
        frameToMatrix(bodyFrame(rotation.poleRaDeg, rotation.poleDecDeg, -90), this.frameMatrix);
        this.group.quaternion.setFromRotationMatrix(this.frameMatrix);
        this.group.scale.setScalar(this.earth.visualRadius / EARTH_RADIUS_KM);
        inverseRotation.copy(this.group.quaternion).invert();
        this.earth.sunDirection(this.uniforms.uSunDirection.value).applyQuaternion(inverseRotation);
    }

    advance(timeMs) {
        this.ensureSnapshot(timeMs);
        this.dt = (timeMs - this.snapshotTimeMs) / 1000;
        this.uniforms.uDt.value = this.dt;
    }

    /* ---------------------------- Vista espacial ---------------------------- */

    /**
     * Actualiza la capa en la vista espacial.
     * @param {object} state Estado de efemérides.
     * @param {THREE.PerspectiveCamera} camera
     * @param {number} viewportHeight Altura del lienzo (px).
     * @param {boolean} constellationVisible Mostrar la constelación.
     */
    updateSpace(state, camera, viewportHeight, constellationVisible) {
        const timeMs = state.timeMs;
        this.updateFrame(state);
        const nearEarth = this.earth.distanceToSurface(camera) < this.earth.visualRadius * PERFORMANCE.satelliteMaxEarthRadii;
        this.spacePoints.visible = constellationVisible && nearEarth;
        const needsSatellites = this.spacePoints.visible || this.selectedIndex >= 0 || this.launch;
        if (needsSatellites) this.advance(timeMs);

        const pixelsToLocal = (distance, px) => (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * px)
            / viewportHeight / this.group.scale.x;
        this.updateSelectedSatellite(timeMs, camera, pixelsToLocal);
        this.updateLaunch(timeMs, camera, pixelsToLocal);
    }

    updateSelectedSatellite(timeMs, camera, pixelsToLocal) {
        const state = this.selectedIndex >= 0 ? this.catalog.propagate(this.selectedIndex, timeMs) : null;
        this.marker.visible = Boolean(state);
        this.orbitLine.visible = Boolean(state);
        if (!state) return;
        const { x, y, z } = state.position;
        this.marker.position.set(x, z, -y);
        this.marker.getWorldPosition(scratch);
        this.marker.scale.setScalar(pixelsToLocal(camera.position.distanceTo(scratch), MARKER_SIZE_PX));
        if (!(Math.abs(timeMs - this.orbitTimeMs) < ORBIT_REFRESH_MS)) {
            setPoints(this.orbitLine, this.catalog.orbitPoints(this.selectedIndex, timeMs, 180));
            this.orbitTimeMs = timeMs;
        }
    }

    updateLaunch(timeMs, camera, pixelsToLocal) {
        const launchState = this.trajectory?.stateAt(timeMs) ?? null;
        this.trajectoryLine.visible = Boolean(launchState);
        this.rocket.visible = Boolean(launchState);
        this.launchState = launchState;
        if (launchState) {
            this.rocket.position.fromArray(launchState.positionLocal);
            this.rocket.getWorldPosition(scratch);
            this.rocket.scale.setScalar(pixelsToLocal(camera.position.distanceTo(scratch), ROCKET_SIZE_PX));
            this.rocket.material.color.set(launchState.deployed ? 0x7dffd6 : 0xff9a3c).multiplyScalar(1.6);
        }
        // Durante la misión simulada se muestra la trayectoria modelada; las órbitas
        // actuales (TLE recientes) solo tienen sentido lejos de la fecha del despegue.
        const hasOrbits = this.launch && !launchState && this.catalog.satellitesOfLaunch(this.launch.id).length > 0;
        this.launchOrbits.visible = Boolean(hasOrbits);
        if (hasOrbits && !(Math.abs(timeMs - this.launchOrbitsTimeMs) < LAUNCH_ORBIT_REFRESH_MS)) {
            this.rebuildLaunchOrbits(timeMs);
        }
    }

    /** Órbitas actuales de todos los satélites (con TLE) del lanzamiento seleccionado. */
    rebuildLaunchOrbits(timeMs) {
        const vertices = [];
        for (const index of this.catalog.satellitesOfLaunch(this.launch.id)) {
            const points = this.catalog.orbitPoints(index, timeMs, 90);
            for (let k = 0; k + 1 < points.length; k++) vertices.push(...points[k], ...points[k + 1]);
        }
        this.launchOrbits.geometry.dispose();
        this.launchOrbits.geometry = new THREE.BufferGeometry();
        this.launchOrbits.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.launchOrbitsTimeMs = timeMs;
    }

    /* ----------------------------- Vista celeste ---------------------------- */

    /**
     * Actualiza los satélites vistos desde el observador.
     * @param {object} state Estado de efemérides.
     * @param {boolean} visible Mostrar la constelación.
     */
    updateSky(state, visible) {
        const timeMs = state.timeMs;
        this.updateFrame(state);
        this.skyPoints.visible = visible;
        const needsSatellites = visible || this.selectedIndex >= 0;
        if (!needsSatellites) {
            this.skyMarker.visible = false;
            return;
        }
        this.advance(timeMs);
        const { observer, daylight } = this.skyView;
        const lst = localSiderealTimeDeg(timeMs / MS_PER_DAY + UNIX_EPOCH_JD, observer.longitude);
        const basis = horizontalBasis(observer.latitude, lst);
        // Filas (este, cénit, −norte) expresadas en el marco local (x, z, −y) del TEME.
        const row = (v) => [v.x, v.z, -v.y];
        this.skyUniforms.uHorizon.value.set(
            ...row(basis.east),
            ...row(basis.up),
            ...row(scaleVec(basis.north, -1))
        );
        const observerKm = scaleVec(observerEquatorialPosition(observer.latitude, lst), AU_KM);
        this.skyUniforms.uObserver.value.set(observerKm.x, observerKm.z, -observerKm.y);
        this.skyUniforms.uDaylight.value = daylight;
        this.updateSkyMarker(timeMs);
    }

    updateSkyMarker(timeMs) {
        const state = this.selectedIndex >= 0 ? this.catalog.propagate(this.selectedIndex, timeMs) : null;
        this.skyMarker.visible = Boolean(state);
        if (!state) return;
        const { x, y, z } = state.position;
        const direction = this.skyDirection(new THREE.Vector3(x, z, -y), scratch);
        this.skyMarker.position.copy(direction).multiplyScalar(SKY_RADIUS);
        const camera = this.skyView.camera;
        this.skyMarker.scale.setScalar((2 * SKY_RADIUS * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * MARKER_SIZE_PX)
            / (this.skyView.viewportHeight ?? 800));
    }

    /** Dirección horizontal (escena del cielo) de un punto local TEME. */
    skyDirection(localPosition, target) {
        return target.copy(localPosition).sub(this.skyUniforms.uObserver.value).normalize()
            .applyMatrix3(this.skyUniforms.uHorizon.value);
    }

    /* ------------------------------ Selección ------------------------------ */

    selectSatellite(index) {
        this.selectedIndex = index;
        this.orbitTimeMs = NaN;
    }

    /** Selecciona un lanzamiento: resalta sus satélites y prepara la trayectoria modelada. */
    selectLaunch(launch) {
        this.launch = launch;
        this.launchOrbitsTimeMs = NaN;
        this.uniforms.uHighlight.value = launch ? this.catalog.launchIndexById.get(launch.id) : -1;
        const site = launch ? this.catalog.sites[launch.site] : null;
        this.trajectory = site ? new LaunchTrajectory(launch, site) : null;
        if (this.trajectory) {
            const { points, ascentCount } = this.trajectory.samplePath();
            const colors = points.flatMap((_, index) => (index < ascentCount ? [1, 0.55, 0.2] : [1, 0.85, 0.35]));
            setPoints(this.trajectoryLine, points, colors);
        }
    }

    /** Satélite más cercano al puntero (vista espacial), descartando los ocultos por la Tierra. */
    pickSpace(clientX, clientY, camera, rect) {
        if (!this.spacePoints.visible) return -1;
        this.group.updateMatrixWorld();
        const earthSphere = new THREE.Sphere(this.earth.position, this.earth.visualRadius);
        const ray = new THREE.Ray();
        return this.pickNearest(clientX - rect.left, clientY - rect.top, (index, world) => {
            propagateCircular(this.positions, this.velocities, index, this.dt, world).applyMatrix4(this.group.matrixWorld);
            ray.origin.copy(camera.position);
            ray.direction.copy(world).sub(camera.position);
            const distance = ray.direction.length();
            ray.direction.divideScalar(distance);
            const hit = ray.intersectSphere(earthSphere, scratchB);
            if (hit && camera.position.distanceTo(hit) < distance) return null;
            return projectToScreen(world, camera, rect.width, rect.height);
        });
    }

    /** Satélite más cercano al puntero en la vista celeste (solo los visibles sobre el horizonte). */
    pickSky(clientX, clientY, rect) {
        if (!this.skyPoints.visible) return -1;
        const camera = this.skyView.camera;
        const sunDirection = this.uniforms.uSunDirection.value;
        return this.pickNearest(clientX - rect.left, clientY - rect.top, (index, world) => {
            const local = propagateCircular(this.positions, this.velocities, index, this.dt, world);
            const along = local.dot(sunDirection);
            const sunlit = along > 0 || scratchB.copy(local).addScaledVector(sunDirection, -along).length() > EARTH_RADIUS_KM;
            const direction = this.skyDirection(local, world);
            if (!sunlit || direction.y < 0) return null;
            return projectToScreen(direction.multiplyScalar(SKY_RADIUS), camera, rect.width, rect.height);
        });
    }

    pickNearest(x, y, project) {
        let best = -1;
        let bestDistance = PICK_RADIUS_PX;
        const world = new THREE.Vector3();
        for (let index = 0; index < this.catalog.count; index++) {
            if (this.visibleFlags[index] < 0.5) continue;
            const point = project(index, world);
            if (!point) continue;
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < bestDistance) {
                best = index;
                bestDistance = distance;
            }
        }
        return best;
    }

    /* ------------------------------ Consultas ------------------------------ */

    /** Posición de mundo del satélite seleccionado (para la cámara y la etiqueta). */
    selectedWorldPosition(target) {
        return this.marker.visible ? this.marker.getWorldPosition(target) : null;
    }

    rocketWorldPosition(target) {
        return this.rocket.visible ? this.rocket.getWorldPosition(target) : null;
    }

    skyMarkerPosition() {
        return this.skyMarker.visible ? this.skyMarker.position : null;
    }

    /** ¿Está iluminado por el Sol un punto TEME (km)? */
    isSunlit(position, state) {
        const sun = eclipticToEquatorial(scaleVec(state.positions.earth, -1));
        const length = Math.hypot(sun.x, sun.y, sun.z);
        const along = (position.x * sun.x + position.y * sun.y + position.z * sun.z) / length;
        const axisDistance = Math.sqrt(Math.max(0, position.x ** 2 + position.y ** 2 + position.z ** 2 - along ** 2));
        return along > 0 || axisDistance > EARTH_RADIUS_KM;
    }

    /**
     * Datos del satélite para el panel de información. `geodetic` es null si en
     * la fecha simulada aún no se había lanzado o el modelo no es aplicable.
     */
    describeSatellite(index, state) {
        const geodetic = this.catalog.geodetic(index, state.timeMs);
        let observation = null;
        if (geodetic) {
            const { observer } = this.skyView;
            const lst = localSiderealTimeDeg(state.timeMs / MS_PER_DAY + UNIX_EPOCH_JD, observer.longitude);
            const basis = horizontalBasis(observer.latitude, lst);
            const observerKm = scaleVec(observerEquatorialPosition(observer.latitude, lst), AU_KM);
            const p = geodetic.state.position;
            const rel = { x: p.x - observerKm.x, y: p.y - observerKm.y, z: p.z - observerKm.z };
            const range = Math.hypot(rel.x, rel.y, rel.z);
            const dotWith = (v) => (v.x * rel.x + v.y * rel.y + v.z * rel.z) / range;
            observation = {
                azimuthDeg: ((Math.atan2(dotWith(basis.east), dotWith(basis.north)) * RAD) + 360) % 360,
                altitudeDeg: Math.asin(dotWith(basis.up)) * RAD,
                rangeKm: range
            };
        }
        return {
            name: this.catalog.names[index],
            launch: this.catalog.launchOfSatellite(index),
            elements: this.catalog.meanElements(index),
            geodetic,
            sunlit: geodetic ? this.isSunlit(geodetic.state.position, state) : false,
            observation,
            dataAgeDays: (state.timeMs - this.catalog.epochMs[index]) / MS_PER_DAY
        };
    }
}
