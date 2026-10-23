/**
 * @file main.js
 * Punto de entrada: inicialización y ciclo principal.
 *
 * Separación de responsabilidades en cada fotograma (requestAnimationFrame):
 *  1. SimulationClock avanza el instante simulado.
 *  2. EphemerisService entrega posiciones interpoladas (los cálculos
 *     astronómicos completos se ejecutan ~10 veces por segundo, no por fotograma).
 *  3. SolarSystem / SkyView / SatelliteLayer traducen ese estado a la escena
 *     (los satélites se propagan con SGP4 cada 120 s simulados y la GPU los
 *     extrapola entre tanto).
 *  4. SceneManager renderiza.
 *  5. UIManager actualiza el reloj (al cambiar el segundo) y los paneles (4 Hz).
 */
import * as THREE from 'three';
import { CONFIG, TIME_SCALE_STEPS, PERFORMANCE } from './config.js';
import { SceneManager } from './scene.js';
import { TextureLibrary, TEXTURE_MANIFEST } from './textures.js';
import { SolarSystem } from './solar-system.js';
import { SkyView, CARDINAL_POINTS } from './sky-view.js';
import { SimulationClock } from './clock.js';
import { EphemerisService } from './ephemeris-service.js';
import { OrbitCameraController, SkyLookController } from './controls.js';
import { LabelLayer, projectToScreen } from './labels.js';
import { UIManager, setLoadingProgress, showStartupError } from './ui.js';
import { BODY_DEFINITIONS, BODY_ORDER, PLANET_ORDER } from './planets.js';
import { SatelliteCatalog, describeDataAge } from './satellites.js';
import { SatelliteLayer } from './satellite-layer.js';
import { LaunchHistoryPanel } from './launch-history.js';
import {
    describeBody, bodyLiveRows, bodyObservationRows, describeLaunch, launchLiveRows,
    describeSatellite, satelliteLiveRows, satelliteObservationRows
} from './info-rows.js';
import { formatDate, formatElapsedDays, formatMissionClock } from './format.js';

document.documentElement.dataset.appState = 'loading';

/** Vista de la barra superior asociada a cada cuerpo. */
const VIEW_FOR_BODY = { sun: 'sun', earth: 'earth', moon: 'moon' };
/** Ángulo entre la cámara y la dirección del Sol al enfocar un cuerpo (vista de tres cuartos). */
const SUNLIT_VIEW_ANGLE = 1.1;
const LABEL_LARGE_RADIUS_PX = 7;
/** Separación mínima (px) entre etiquetas; si se solapan, la de menor prioridad muestra solo el punto. */
const LABEL_MIN_SEPARATION = { x: 70, y: 14 };
/** Cerca del borde derecho el texto se coloca a la izquierda del punto. */
const LABEL_EDGE_MARGIN_PX = 110;
/** Velocidad con la que arranca la simulación de un lanzamiento (índice de TIME_SCALE_STEPS: 10×). */
const LAUNCH_SIMULATION_SPEED_INDEX = 1;
/** Segundos antes del despegue en que empieza la simulación. */
const LAUNCH_SIMULATION_LEAD_SECONDS = 60;
const SATELLITE_LABEL = 'satellite-selected';
const ROCKET_LABEL = 'rocket';

class SolarSystemExplorer {
    constructor() {
        this.mode = 'space';
        /** Objeto seleccionado: { kind: 'body' | 'satellite' | 'launch', id }. */
        this.selection = { kind: 'body', id: 'earth' };
        this.focusedId = null;
        this.speedIndex = 0;
        this.planetTourIndex = -1;
        this.elapsedSeconds = 0;
        this.lastFrameTime = performance.now();
        this.lastPanelUpdate = 0;
        this.followTarget = new THREE.Vector3();
        this.defaultScales = {
            planetScale: CONFIG.planetScale,
            sunScale: CONFIG.sunScale,
            orbitScale: CONFIG.orbitScale,
            moonScale: CONFIG.moonScale,
            distanceMode: CONFIG.distanceMode
        };
        this.frame = this.frame.bind(this);
    }

    async start() {
        this.sceneManager = new SceneManager(document.getElementById('viewport'));
        this.textures = new TextureLibrary(this.sceneManager.renderer);
        await this.textures.loadAll(TEXTURE_MANIFEST, setLoadingProgress);

        this.sceneManager.createBackground(this.textures);
        this.solarSystem = new SolarSystem(this.textures, CONFIG);
        this.sceneManager.scene.add(this.solarSystem.group);
        this.skyView = new SkyView(this.textures, CONFIG);
        const pixelRatio = this.sceneManager.renderer.getPixelRatio();
        this.skyView.celestial.setPixelRatio(pixelRatio);
        this.catalog = new SatelliteCatalog();
        this.satellites = new SatelliteLayer(this.catalog, this.solarSystem.get('earth'), this.skyView, pixelRatio);

        // La fecha inicial es siempre el instante actual del sistema; la velocidad
        // inicial sale de CONFIG.timeScale (1 = tiempo real).
        this.clock = new SimulationClock(new Date());
        this.speedIndex = Math.max(0, TIME_SCALE_STEPS.indexOf(CONFIG.timeScale));
        this.clock.setTimeScale(TIME_SCALE_STEPS[this.speedIndex]);
        this.ephemeris = new EphemerisService();
        this.state = this.ephemeris.update(this.clock.timeMs, this.clock.effectiveScale);
        this.solarSystem.update(this.state);

        const canvas = this.sceneManager.canvas;
        const pointerCallbacks = {
            onSelect: (x, y) => this.handlePick(x, y, false),
            onDoubleClick: (x, y) => this.handlePick(x, y, true)
        };
        this.orbitController = new OrbitCameraController(this.sceneManager.camera, canvas, pointerCallbacks);
        this.skyController = new SkyLookController(this.skyView.camera, canvas, pointerCallbacks);

        this.labels = new LabelLayer(document.getElementById('label-layer'), (key) => this.handleLabelClick(key));
        this.createLabels();

        this.ui = new UIManager(CONFIG, this.createActions());
        this.history = new LaunchHistoryPanel(this.catalog, (launchId) => this.selectLaunch(launchId, true));
        for (const key of ['showOrbits', 'showMilkyWay', 'showConstellations', 'showAxes', 'bloom']) this.applyOption(key);
        this.selectBody('earth', false);
        this.setView('solar-system');
        this.refreshTimeState();

        requestAnimationFrame(this.frame);
        this.ui.hideLoading();
        document.documentElement.dataset.appState = 'running';
    }

    /* ----------------------------- Acciones UI ---------------------------- */

    createActions() {
        return {
            play: () => this.updateClock(() => this.clock.play()),
            pause: () => this.updateClock(() => this.clock.pause()),
            togglePlay: () => this.updateClock(() => this.clock.togglePlay()),
            realtime: () => this.syncRealTime(),
            toggleDirection: () => this.updateClock(() => this.clock.setDirection(-this.clock.direction)),
            stepSpeed: (delta) => this.setSpeedIndex(this.speedIndex + delta),
            setSpeedIndex: (index) => this.setSpeedIndex(index),
            applyDate: (date) => this.updateClock(() => this.clock.setDate(date)),
            setScale: (key, value) => this.updateScale(() => { CONFIG[key] = value; }),
            setDistanceMode: (mode) => this.updateScale(() => { CONFIG.distanceMode = mode; }),
            resetScales: () => this.updateScale(() => Object.assign(CONFIG, this.defaultScales), true),
            setOption: (key, value) => this.setOption(key, value),
            toggleOption: (key) => this.setOption(key, !CONFIG[key]),
            setCloudsVisible: (visible) => this.solarSystem.get('earth').setCloudsVisible(visible),
            setGroundVisible: (visible) => this.skyView.setGroundVisible(visible),
            selectBody: (id, focus) => this.selectBody(id, focus),
            setView: (view) => this.setView(view),
            runSelectionAction: (action) => this.runSelectionAction(action),
            openHistory: () => this.history.open(),
            setObserver: (observer) => {
                this.skyView.setObserver(observer);
                this.ui.showObserver(observer);
            },
            escape: () => {
                if (this.mode === 'sky') this.setView('earth');
            }
        };
    }

    /** Ejecuta un cambio del reloj y refresca el panel de tiempo. */
    updateClock(change) {
        change();
        this.refreshTimeState();
    }

    /** Vuelve a la fecha y hora actuales del sistema a velocidad 1×. */
    syncRealTime() {
        this.updateClock(() => {
            this.clock.syncToRealTime();
            this.speedIndex = 0;
            CONFIG.timeScale = 1;
        });
    }

    setSpeedIndex(index) {
        this.speedIndex = Math.min(TIME_SCALE_STEPS.length - 1, Math.max(0, index));
        CONFIG.timeScale = TIME_SCALE_STEPS[this.speedIndex];
        this.updateClock(() => this.clock.setTimeScale(CONFIG.timeScale));
    }

    refreshTimeState() {
        this.ui.updateTimeState(this.clock, this.speedIndex, this.state.snapshot.withinKeplerValidity);
        this.ui.updateClock(this.clock.timeMs);
    }

    /** Aplica un cambio de escala y mantiene la cámara fuera del cuerpo enfocado. */
    updateScale(change, syncControls = false) {
        change();
        this.solarSystem.applyScale();
        this.solarSystem.update(this.state);
        if (this.focusedId) {
            const body = this.solarSystem.get(this.focusedId);
            this.orbitController.minDistance = body.visualRadius * 1.15;
            this.orbitController.spherical.radius = Math.max(this.orbitController.spherical.radius, this.orbitController.minDistance);
        }
        if (syncControls) this.ui.syncScaleControls();
    }

    setOption(key, value) {
        CONFIG[key] = value;
        this.applyOption(key);
        this.ui.syncOption(key);
    }

    applyOption(key) {
        const value = CONFIG[key];
        const background = this.sceneManager.celestialSphere;
        const handlers = {
            showOrbits: () => this.solarSystem.setOrbitsVisible(value),
            showMilkyWay: () => background.setMilkyWayVisible(value),
            showConstellations: () => background.setConstellationsVisible(value),
            showAxes: () => this.solarSystem.setAxesVisible(value),
            bloom: () => this.sceneManager.setBloomEnabled(value)
        };
        handlers[key]?.();
    }

    /* ------------------------------ Selección ----------------------------- */

    /** Cuerpo celeste seleccionado (o null si la selección es un satélite o lanzamiento). */
    get selectedBodyId() {
        return this.selection.kind === 'body' ? this.selection.id : null;
    }

    selectBody(id, focus) {
        if (!BODY_DEFINITIONS[id]) return;
        this.selection = { kind: 'body', id };
        this.satellites.selectSatellite(-1);
        this.satellites.selectLaunch(null);
        this.ui.showSelection(describeBody(id));
        this.solarSystem.orbits.highlight(id);
        this.updatePanels();
        if (!focus) return;
        if (this.mode === 'sky') {
            this.lookAtSkyObject(id);
        } else {
            this.focusBody(id);
            this.ui.setActiveView(VIEW_FOR_BODY[id] ?? 'planets');
        }
    }

    selectSatellite(index, focus) {
        this.selection = { kind: 'satellite', id: index };
        this.satellites.selectSatellite(index);
        this.solarSystem.orbits.highlight(null);
        const info = this.satellites.describeSatellite(index, this.state);
        this.ui.showSelection(describeSatellite(info, this.catalog.generated));
        this.labels.setText(SATELLITE_LABEL, info.name);
        this.updatePanels();
        if (focus) this.focusSatellite();
    }

    /** Selecciona una misión del historial: resalta sus satélites y prepara su trayectoria. */
    selectLaunch(launchId, focus) {
        const launch = this.catalog.launchById(launchId);
        if (!launch) return;
        this.selection = { kind: 'launch', id: launchId };
        this.satellites.selectSatellite(-1);
        this.satellites.selectLaunch(launch);
        this.solarSystem.orbits.highlight(null);
        this.labels.setText(ROCKET_LABEL, launch.rocket);
        const tracked = this.catalog.satellitesOfLaunch(launchId).length;
        this.ui.showSelection(describeLaunch(launch, this.catalog.sites[launch.site], tracked));
        this.updatePanels();
        if (focus) this.focusLaunch();
    }

    /** Acciones de los botones del panel de información (y la tecla F). */
    runSelectionAction(action) {
        const { kind, id } = this.selection;
        const handlers = {
            focus: () => {
                if (kind === 'body') this.selectBody(id, true);
                else if (kind === 'satellite') this.focusSatellite();
                else this.focusLaunch();
            },
            'follow-satellite': () => this.focusSatellite(),
            'show-satellite-launch': () => {
                const launch = this.catalog.launchOfSatellite(id);
                if (launch) this.selectLaunch(launch.id, true);
            },
            'simulate-launch': () => this.simulateLaunch(),
            'launch-now': () => {
                this.syncRealTime();
                this.setOption('showSatellites', true);
                this.focusEarthOverview();
            },
            'open-history': () => this.history.open()
        };
        handlers[action]?.();
    }

    handlePick(clientX, clientY, focus) {
        const rect = this.sceneManager.canvas.getBoundingClientRect();
        if (this.mode === 'sky') {
            const bodyId = this.sceneManager.pick(clientX, clientY, this.skyView.objects, this.skyView.camera);
            if (bodyId) {
                this.selectBody(bodyId, focus);
                return;
            }
            const satellite = this.satellites.pickSky(clientX, clientY, rect);
            if (satellite >= 0) this.selectSatellite(satellite, focus);
            return;
        }
        const satellite = this.satellites.pickSpace(clientX, clientY, this.sceneManager.camera, rect);
        if (satellite >= 0) {
            this.selectSatellite(satellite, focus);
            return;
        }
        const bodyId = this.sceneManager.pick(clientX, clientY, this.solarSystem.bodies, this.sceneManager.camera);
        if (bodyId) this.selectBody(bodyId, focus);
    }

    handleLabelClick(key) {
        if (key === SATELLITE_LABEL) this.focusSatellite();
        else if (key === ROCKET_LABEL) this.focusLaunch();
        else this.selectBody(key, true);
    }

    /* -------------------------------- Vistas ------------------------------ */

    /** Vuela hacia un cuerpo con una vista de tres cuartos iluminada por el Sol. */
    focusBody(id) {
        const body = this.solarSystem.get(id);
        const position = body.position;
        const towardSun = Math.atan2(-position.x, -position.z);
        this.focusedId = id;
        this.orbitController.focusOn(() => body.position, {
            distance: body.outerVisualRadius * (id === 'sun' ? 6 : 4.2),
            minDistance: body.visualRadius * 1.15,
            theta: id === 'sun' ? this.orbitController.spherical.theta : towardSun + SUNLIT_VIEW_ANGLE,
            phi: 1.25
        });
    }

    /** La Tierra con la envoltura completa de la constelación. */
    focusEarthOverview() {
        if (this.mode === 'sky') this.exitSky();
        const earth = this.solarSystem.get('earth');
        const towardSun = Math.atan2(-earth.position.x, -earth.position.z);
        this.focusedId = 'earth';
        this.orbitController.focusOn(() => earth.position, {
            distance: earth.visualRadius * 3.4,
            minDistance: earth.visualRadius * 1.15,
            theta: towardSun + 0.8,
            phi: 1.05
        });
        this.ui.setActiveView('satellites');
    }

    /** Sigue al satélite seleccionado (cámara cercana o mirada desde la superficie). */
    focusSatellite() {
        if (this.selection.kind !== 'satellite') return;
        if (this.mode === 'sky') {
            const { observation } = this.satellites.describeSatellite(this.selection.id, this.state);
            if (observation) this.skyController.lookAt(observation.azimuthDeg, Math.max(observation.altitudeDeg, -10));
            return;
        }
        this.chase(() => this.satellites.selectedWorldPosition(this.followTarget), 0.45);
    }

    /**
     * Cámara de persecución sobre un objeto en órbita baja: el desplazamiento se
     * define respecto a la vertical local del objeto, de modo que la Tierra queda
     * siempre debajo aunque el objeto dé vueltas al planeta.
     * @param {() => THREE.Vector3|null} getPosition Posición de mundo del objeto.
     * @param {number} distanceInEarthRadii Distancia de la cámara al objeto.
     */
    chase(getPosition, distanceInEarthRadii) {
        const earth = this.solarSystem.get('earth');
        const frame = new THREE.Quaternion();
        const vertical = new THREE.Vector3();
        const position = () => getPosition() ?? earth.position;
        this.focusedId = null;
        this.orbitController.focusOn(position, {
            distance: earth.visualRadius * distanceInEarthRadii,
            minDistance: earth.visualRadius * 0.01,
            theta: 0,
            phi: 0.55,
            maxPhi: 1.35,
            getFrame: () => {
                vertical.copy(position()).sub(earth.position);
                if (vertical.lengthSq() > 0) frame.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, vertical.normalize());
                return frame;
            }
        });
    }

    /** Sigue al cohete si la misión está en curso; si no, muestra la Tierra con sus órbitas. */
    focusLaunch() {
        if (this.mode === 'sky') this.exitSky();
        if (!this.satellites.trajectory?.isActive(this.clock.timeMs)) {
            this.focusEarthOverview();
            return;
        }
        this.chase(() => this.satellites.rocketWorldPosition(this.followTarget), 0.6);
    }

    /** Lleva el reloj al despegue de la misión seleccionada y sigue al cohete a 10×. */
    simulateLaunch() {
        const launch = this.catalog.launchById(this.selection.id);
        if (!launch) return;
        this.clock.setDate(new Date(Date.parse(launch.net) - LAUNCH_SIMULATION_LEAD_SECONDS * 1000));
        this.clock.setDirection(1);
        this.clock.play();
        this.setSpeedIndex(LAUNCH_SIMULATION_SPEED_INDEX);
        // Coloca ya el cohete en la plataforma para que la cámara parta de su vertical.
        this.state = this.ephemeris.update(this.clock.timeMs, this.clock.effectiveScale);
        this.solarSystem.update(this.state);
        this.satellites.updateSpace(this.state, this.sceneManager.camera, this.sceneManager.size.height, CONFIG.showSatellites);
        this.focusLaunch();
    }

    /** Encuadra el Sistema Solar completo (hasta la órbita de Neptuno). */
    frameSolarSystem() {
        const sun = this.solarSystem.get('sun');
        this.focusedId = 'sun';
        this.orbitController.focusOn(() => sun.position, {
            distance: this.solarSystem.scale.radialDistance(31) * 2.3,
            minDistance: sun.visualRadius * 1.15,
            theta: 0.5,
            phi: 0.85,
            duration: 2
        });
    }

    setView(view) {
        if (view === 'sky') {
            if (this.mode !== 'sky') this.enterSky();
            return;
        }
        if (this.mode === 'sky') this.exitSky();
        switch (view) {
            case 'solar-system':
            case 'reset':
                this.frameSolarSystem();
                break;
            case 'planets':
                this.planetTourIndex = (this.planetTourIndex + 1) % PLANET_ORDER.length;
                this.selectBody(PLANET_ORDER[this.planetTourIndex], true);
                break;
            case 'satellites':
                this.setOption('showSatellites', true);
                this.focusEarthOverview();
                break;
            default:
                this.selectBody(view, true);
        }
        this.ui.setActiveView(view === 'reset' ? 'solar-system' : view);
    }

    enterSky() {
        this.mode = 'sky';
        this.orbitController.enabled = false;
        this.skyController.enabled = true;
        this.sceneManager.setSkyView(this.skyView);
        this.sceneManager.resize();
        this.skyView.setViewportHeight(this.sceneManager.size.height);
        this.skyView.update(this.state);
        this.ui.setSkyMode(true, this.skyView.observer);
        this.ui.setActiveView('sky');

        const observation = this.selectedBodyId ? this.skyView.getObservation(this.selectedBodyId) : null;
        if (observation && observation.altitudeDeg > -5) {
            this.skyController.lookAt(observation.azimuthDeg, observation.altitudeDeg, 0.01);
        } else {
            this.skyController.lookAt(this.skyView.observer.latitude >= 0 ? 180 : 0, 30, 0.01);
        }
    }

    exitSky() {
        this.mode = 'space';
        this.skyController.enabled = false;
        this.orbitController.enabled = true;
        this.sceneManager.setSkyView(null);
        this.ui.setSkyMode(false);
    }

    lookAtSkyObject(id) {
        const observation = this.skyView.getObservation(id);
        if (observation) this.skyController.lookAt(observation.azimuthDeg, Math.max(observation.altitudeDeg, -10));
    }

    /* ------------------------------ Etiquetas ----------------------------- */

    createLabels() {
        for (const [id, definition] of Object.entries(BODY_DEFINITIONS)) {
            this.labels.ensure(id, definition.name, { color: definition.color, interactive: true });
        }
        this.labels.ensure(SATELLITE_LABEL, '', { color: '#7dffd6', interactive: true });
        this.labels.ensure(ROCKET_LABEL, '', { color: '#ffb347', interactive: true });
        for (const point of CARDINAL_POINTS) {
            this.labels.ensure(`cardinal-${point.label}`, point.label, { className: 'scene-label--cardinal' });
        }
        // Ambas esferas celestes comparten claves: basta con registrar las de una.
        const sphere = this.sceneManager.celestialSphere;
        for (const entry of sphere.constellationLabels) {
            this.labels.ensure(entry.key, entry.name, { className: 'scene-label--constellation' });
        }
        for (const entry of sphere.starLabels) {
            this.labels.ensure(entry.key, entry.name, { className: 'scene-label--star' });
        }
    }

    labelState(id, { large = false, compact = false, flipped = false } = {}) {
        const classes = [id === this.selectedBodyId && 'is-selected', large && 'is-large', compact && 'is-compact', flipped && 'is-flipped'];
        return classes.filter(Boolean).join(' ');
    }

    updateSpaceLabels() {
        const { width, height } = this.sceneManager.size;
        const camera = this.sceneManager.camera;
        if (CONFIG.showLabels) {
            const pixelsPerUnitAtDistanceOne = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
            const placed = [];
            this.placeMovingLabels(camera, width, height, placed);
            // Prioridad: el cuerpo seleccionado y después el orden de la barra inferior.
            const selected = this.selectedBodyId;
            const order = selected ? [selected, ...BODY_ORDER.filter((id) => id !== selected)] : BODY_ORDER;
            for (const id of order) {
                const body = this.solarSystem.get(id);
                const point = projectToScreen(body.position, camera, width, height);
                if (!point) continue;
                const radiusPx = (body.visualRadius / camera.position.distanceTo(body.position)) * pixelsPerUnitAtDistanceOne;
                const large = radiusPx > LABEL_LARGE_RADIUS_PX;
                const anchor = large ? { x: point.x, y: point.y - radiusPx - 10 } : point;
                const crowded = placed.some((other) => Math.abs(other.x - anchor.x) < LABEL_MIN_SEPARATION.x
                    && Math.abs(other.y - anchor.y) < LABEL_MIN_SEPARATION.y);
                if (!crowded) placed.push(anchor);
                const flipped = anchor.x > width - LABEL_EDGE_MARGIN_PX;
                this.labels.place(id, anchor, this.labelState(id, { large, compact: crowded, flipped }));
            }
        }
        if (CONFIG.showConstellations) {
            this.sceneManager.syncBackgroundCamera();
            this.placeCelestialLabels(this.sceneManager.celestialSphere, this.sceneManager.backgroundCamera, width, height, () => true);
        }
    }

    /** Etiquetas del satélite seleccionado y del cohete (prioridad máxima). */
    placeMovingLabels(camera, width, height, placed) {
        const satellite = this.satellites.selectedWorldPosition(this.followTarget);
        const satellitePoint = satellite && projectToScreen(satellite, camera, width, height);
        if (satellitePoint) {
            placed.push(satellitePoint);
            this.labels.place(SATELLITE_LABEL, satellitePoint, 'is-selected');
        }
        const launchState = this.satellites.launchState;
        const rocket = this.satellites.rocketWorldPosition(this.followTarget);
        const rocketPoint = rocket && projectToScreen(rocket, camera, width, height);
        if (rocketPoint && launchState) {
            const subject = launchState.deployed ? 'Satélites desplegados' : this.satellites.launch.rocket;
            this.labels.setText(ROCKET_LABEL, `${subject} · ${formatMissionClock(launchState.seconds)}`);
            placed.push(rocketPoint);
            this.labels.place(ROCKET_LABEL, rocketPoint, 'is-selected');
        }
    }

    updateSkyLabels() {
        const { width, height } = this.sceneManager.size;
        const camera = this.skyView.camera;
        const visible = (position) => this.skyView.isAboveHorizon(position);
        if (CONFIG.showLabels) {
            for (const [id, object] of this.skyView.objects) {
                if (!visible(object.position) || (!object.visible && id !== this.selectedBodyId)) continue;
                const point = projectToScreen(object.position, camera, width, height);
                this.labels.place(id, point, this.labelState(id, { flipped: point && point.x > width - LABEL_EDGE_MARGIN_PX }));
            }
        }
        const satellite = this.satellites.skyMarkerPosition();
        if (satellite && visible(satellite)) {
            this.labels.place(SATELLITE_LABEL, projectToScreen(satellite, camera, width, height), 'is-selected');
        }
        const scratch = this.skyView.scratch;
        for (const point of CARDINAL_POINTS) {
            this.labels.place(`cardinal-${point.label}`,
                projectToScreen(this.skyView.cardinalPosition(point.azimuth, scratch), camera, width, height));
        }
        if (CONFIG.showConstellations) {
            this.placeCelestialLabels(this.skyView.celestial, camera, width, height, visible);
        }
    }

    /** Nombres de constelaciones y estrellas brillantes de una esfera celeste. */
    placeCelestialLabels(sphere, camera, width, height, isVisible) {
        const world = this.skyView.scratch;
        for (const entry of [...sphere.constellationLabels, ...sphere.starLabels]) {
            sphere.toWorld(entry.position, world);
            if (isVisible(world)) this.labels.place(entry.key, projectToScreen(world, camera, width, height));
        }
    }

    /* ---------------------------- Ciclo principal ------------------------- */

    frame(now) {
        requestAnimationFrame(this.frame);
        const dt = Math.min(0.1, Math.max(0, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;
        this.elapsedSeconds += dt;

        this.clock.tick(dt * 1000);
        this.state = this.ephemeris.update(this.clock.timeMs, this.clock.effectiveScale);

        this.labels.beginFrame();
        if (this.mode === 'space') this.renderSpace(dt);
        else this.renderSky(dt);
        this.labels.endFrame();

        this.sceneManager.render();
        this.ui.updateClock(this.clock.timeMs);
        if (now - this.lastPanelUpdate >= PERFORMANCE.uiRefreshMs) {
            this.lastPanelUpdate = now;
            this.updatePanels();
        }
    }

    renderSpace(dt) {
        const camera = this.sceneManager.camera;
        this.solarSystem.update(this.state);
        this.satellites.updateSpace(this.state, camera, this.sceneManager.size.height, CONFIG.showSatellites);
        this.orbitController.update(dt);
        camera.updateMatrixWorld();
        this.sceneManager.updateClipping(this.solarSystem.nearestSurfaceDistance(camera));
        this.solarSystem.animate(this.state, camera, this.elapsedSeconds);
        this.updateSpaceLabels();
    }

    renderSky(dt) {
        this.skyView.setViewportHeight(this.sceneManager.size.height);
        this.skyController.update(dt);
        this.skyView.camera.updateMatrixWorld();
        this.skyView.update(this.state);
        this.satellites.updateSky(this.state, CONFIG.showSatellites);
        this.updateSkyLabels();
    }

    updatePanels() {
        const snapshot = this.state.snapshot;
        this.ui.updateInfo(this.selectionInfo());
        this.ui.updateTimeState(this.clock, this.speedIndex, snapshot.withinKeplerValidity);
        const ageDays = (this.clock.timeMs - this.catalog.dataEpochMs) / 86400000;
        const age = describeDataAge(ageDays);
        this.ui.updateSatelliteSummary({
            count: this.catalog.count,
            launches: this.catalog.launches.length,
            dataDate: formatDate(new Date(this.catalog.dataEpochMs)),
            ageText: `${formatElapsedDays(Math.abs(ageDays))} ${ageDays < 0 ? 'posteriores' : 'de antigüedad'}, ${age.text}`,
            ageLevel: age.level
        });
        if (this.mode === 'sky') this.ui.updateSkyStatus(this.skyView.sunAltitudeDeg, this.skyController);
    }

    /** Filas instantáneas del panel de información según el tipo de selección. */
    selectionInfo() {
        const { kind, id } = this.selection;
        const sky = this.mode === 'sky';
        if (kind === 'satellite') {
            const info = this.satellites.describeSatellite(id, this.state);
            return {
                live: satelliteLiveRows(info),
                observation: sky && info.observation ? satelliteObservationRows(info) : null
            };
        }
        if (kind === 'launch') {
            const launch = this.catalog.launchById(id);
            return { live: launchLiveRows(launch, this.clock.timeMs, this.satellites.trajectory?.stateAt(this.clock.timeMs)) };
        }
        const observation = sky ? this.skyView.getObservation(id) : null;
        return {
            live: bodyLiveRows(id, this.state.snapshot),
            observation: observation ? bodyObservationRows(observation) : null,
            moonPhase: id === 'moon' ? this.state.snapshot.moonPhase : null
        };
    }
}

const app = new SolarSystemExplorer();
app.start().catch((error) => {
    console.error(error);
    const webglMissing = !window.WebGL2RenderingContext;
    showStartupError(webglMissing
        ? 'Este navegador no admite WebGL 2, necesario para el renderizado 3D.'
        : `Error al iniciar: ${error.message}`);
});
