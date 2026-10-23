/**
 * @file ui.js
 * Interfaz de usuario (HUD): reloj, control de tiempo, fecha personalizada,
 * escalas, capas, panel de información, barra de cuerpos y atajos.
 *
 * La interfaz no conoce Three.js ni el bucle de render: recibe datos ya
 * calculados y comunica las acciones del usuario mediante el objeto `actions`.
 */
import { BODY_DEFINITIONS, BODY_ORDER } from './planets.js';
import { TIME_SCALE_STEPS, SCALE_LIMITS } from './config.js';
import { julianDate } from './astronomy.js';
import { describeSunAltitude } from './sky-view.js';
import {
    formatNumber, formatDegrees, formatAzimuth, formatTimeScale, describeTimeScale, localTimeZone,
    formatDate, formatTime, formatHeaderDate, formatUtcTime, formatUtcOffset, toDateInputValue,
    toTimeInputValue, parseLocalDateTime
} from './format.js';

const byId = (id) => document.getElementById(id);
const SLIDER_RESOLUTION = 1000;

/* ------------------------------------------------------------------------ */
/* Gestor de interfaz                                                        */
/* ------------------------------------------------------------------------ */

export class UIManager {
    /**
     * @param {object} config CONFIG compartido.
     * @param {object} actions Callbacks hacia la aplicación (ver main.js).
     */
    constructor(config, actions) {
        this.config = config;
        this.actions = actions;
        this.app = byId('app');
        this.lastClockSecond = NaN;
        this.dateFormDirty = false;
        this.bodyButtons = new Map();

        this.buildBodyBar();
        this.buildSpeedTicks();
        this.bindTimeControls();
        this.bindDateForm();
        this.bindScaleControls();
        this.bindToggles();
        this.bindViews();
        this.bindObserverForm();
        this.bindPanels();
        this.bindKeyboard();
        byId('clock-zone').textContent = localTimeZone();
    }

    /* ---------------------------- Construcción ---------------------------- */

    buildBodyBar() {
        const bar = byId('body-bar');
        for (const id of BODY_ORDER) {
            const definition = BODY_DEFINITIONS[id];
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'body-button';
            button.style.setProperty('--body-color', definition.color);
            button.title = `${definition.name} (${definition.shortcut})`;
            button.innerHTML = '<span class="body-button__symbol"></span><span class="body-button__name"></span>';
            button.querySelector('.body-button__symbol').textContent = definition.symbol;
            button.querySelector('.body-button__name').textContent = definition.name;
            button.addEventListener('click', () => this.actions.selectBody(id, true));
            bar.appendChild(button);
            this.bodyButtons.set(id, button);
        }
    }

    buildSpeedTicks() {
        const ticks = byId('speed-ticks');
        const slider = byId('speed-slider');
        slider.max = String(TIME_SCALE_STEPS.length - 1);
        ticks.replaceChildren(...TIME_SCALE_STEPS.map((scale) => {
            const tick = document.createElement('span');
            tick.textContent = scale >= 1000 ? `${formatNumber(scale / 1000, 0)}k` : String(scale);
            return tick;
        }));
    }

    /* ------------------------------ Eventos ------------------------------- */

    bindTimeControls() {
        byId('btn-play').addEventListener('click', () => this.actions.play());
        byId('btn-pause').addEventListener('click', () => this.actions.pause());
        byId('btn-realtime').addEventListener('click', () => this.actions.realtime());
        byId('btn-reverse').addEventListener('click', () => this.actions.toggleDirection());
        byId('btn-slower').addEventListener('click', () => this.actions.stepSpeed(-1));
        byId('btn-faster').addEventListener('click', () => this.actions.stepSpeed(1));
        byId('speed-slider').addEventListener('input', (event) => this.actions.setSpeedIndex(Number(event.target.value)));
    }

    bindDateForm() {
        const form = byId('date-form');
        form.addEventListener('input', () => { this.dateFormDirty = true; });
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const date = parseLocalDateTime(byId('input-date').value, byId('input-time').value);
            const error = byId('date-error');
            if (!date) {
                error.textContent = 'Introduzca una fecha y una hora válidas.';
                error.hidden = false;
                return;
            }
            error.hidden = true;
            this.dateFormDirty = false;
            this.actions.applyDate(date);
        });
        byId('btn-now').addEventListener('click', () => {
            this.dateFormDirty = false;
            byId('date-error').hidden = true;
            this.actions.realtime();
        });
    }

    /** Deslizadores logarítmicos de escala (data-scale="clave"). */
    bindScaleControls() {
        for (const field of document.querySelectorAll('[data-scale]')) {
            const key = field.dataset.scale;
            const { min, max } = SCALE_LIMITS[key];
            const input = field.querySelector('input');
            const output = field.querySelector('output');
            const toValue = (position) => min * (max / min) ** (position / SLIDER_RESOLUTION);
            const toPosition = (value) => (Math.log(value / min) / Math.log(max / min)) * SLIDER_RESOLUTION;
            const show = (value) => {
                output.textContent = `×${formatNumber(value, value < 10 ? 2 : 0)}`;
            };
            input.max = String(SLIDER_RESOLUTION);
            input.addEventListener('input', () => {
                const value = toValue(Number(input.value));
                show(value);
                this.actions.setScale(key, value);
            });
            field.syncFromConfig = () => {
                input.value = String(toPosition(this.config[key]));
                show(this.config[key]);
            };
            field.syncFromConfig();
        }
        const distanceMode = byId('distance-mode');
        distanceMode.value = this.config.distanceMode;
        distanceMode.addEventListener('change', () => this.actions.setDistanceMode(distanceMode.value));
        byId('btn-reset-scale').addEventListener('click', () => this.actions.resetScales());
    }

    /** Refleja en los controles los valores actuales de CONFIG. */
    syncScaleControls() {
        for (const field of document.querySelectorAll('[data-scale]')) field.syncFromConfig();
        byId('distance-mode').value = this.config.distanceMode;
    }

    bindToggles() {
        for (const input of document.querySelectorAll('[data-config]')) {
            input.checked = Boolean(this.config[input.dataset.config]);
            input.addEventListener('change', () => this.actions.setOption(input.dataset.config, input.checked));
        }
        byId('toggle-clouds').addEventListener('change', (event) => this.actions.setCloudsVisible(event.target.checked));
        byId('toggle-ground').addEventListener('change', (event) => this.actions.setGroundVisible(event.target.checked));
    }

    /** Sincroniza una casilla con CONFIG (cuando cambia por teclado). */
    syncOption(key) {
        for (const input of document.querySelectorAll(`[data-config="${key}"]`)) input.checked = Boolean(this.config[key]);
    }

    bindViews() {
        for (const button of document.querySelectorAll('[data-view]')) {
            button.addEventListener('click', () => this.actions.setView(button.dataset.view));
        }
        byId('info-actions').addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (button) this.actions.runSelectionAction(button.dataset.action);
        });
        byId('btn-history').addEventListener('click', () => this.actions.openHistory());
    }

    bindObserverForm() {
        byId('observer-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const latitude = Number(byId('input-latitude').value);
            const longitude = Number(byId('input-longitude').value);
            const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
                && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
            if (valid) this.actions.setObserver({ name: 'coordenadas personalizadas', latitude, longitude });
        });
    }

    /** Paneles plegables en pantallas pequeñas y diálogo de ayuda. */
    bindPanels() {
        const toggle = (panelId, otherId) => {
            const panel = byId(panelId);
            panel.classList.toggle('is-open');
            byId(otherId).classList.remove('is-open');
        };
        byId('btn-toggle-left').addEventListener('click', () => toggle('panel-time', 'panel-info'));
        byId('btn-toggle-right').addEventListener('click', () => toggle('panel-info', 'panel-time'));
        byId('btn-help').addEventListener('click', () => this.toggleHelp());
    }

    toggleHelp() {
        const dialog = byId('help-dialog');
        if (dialog.open) dialog.close();
        else dialog.showModal();
    }

    /** Atajos globales (las teclas de cámara las gestiona controls.js). */
    bindKeyboard() {
        const shortcuts = {
            Space: () => this.actions.togglePlay(),
            KeyT: () => this.actions.realtime(),
            KeyR: () => this.actions.setView('reset'),
            KeyV: () => this.actions.setView('sky'),
            KeyF: () => this.actions.runSelectionAction('focus'),
            KeyK: () => this.actions.toggleOption('showSatellites'),
            KeyU: () => this.actions.openHistory(),
            KeyO: () => this.actions.toggleOption('showOrbits'),
            KeyL: () => this.actions.toggleOption('showLabels'),
            KeyC: () => this.actions.toggleOption('showConstellations'),
            KeyX: () => this.actions.toggleOption('showAxes'),
            KeyH: () => this.app.classList.toggle('is-ui-hidden'),
            Escape: () => this.actions.escape()
        };
        const characterShortcuts = {
            '+': () => this.actions.stepSpeed(1),
            '=': () => this.actions.stepSpeed(1),
            '-': () => this.actions.stepSpeed(-1),
            '?': () => this.toggleHelp()
        };
        const digitTargets = Object.fromEntries(BODY_ORDER.map((id) => [BODY_DEFINITIONS[id].shortcut, id]));

        window.addEventListener('keydown', (event) => {
            const target = event.target;
            const editing = target instanceof HTMLElement
                && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
            if (editing || event.ctrlKey || event.metaKey || event.altKey || byId('help-dialog').open) return;
            const characterHandler = characterShortcuts[event.key];
            if (characterHandler) {
                event.preventDefault();
                characterHandler();
                return;
            }
            const digit = /^(Digit|Numpad)(\d)$/.exec(event.code)?.[2];
            if (digit !== undefined && digitTargets[digit] && !event.shiftKey) {
                this.actions.selectBody(digitTargets[digit], true);
                return;
            }
            const handler = shortcuts[event.code];
            if (handler && !event.shiftKey) {
                event.preventDefault();
                handler();
            }
        });
    }

    /* --------------------------- Actualizaciones -------------------------- */

    /**
     * Reloj (se llama en cada fotograma; solo toca el DOM al cambiar el segundo).
     * @param {number} timeMs Instante simulado.
     */
    updateClock(timeMs) {
        const second = Math.floor(timeMs / 1000);
        if (second === this.lastClockSecond) return;
        this.lastClockSecond = second;
        const date = new Date(timeMs);
        byId('clock-date').textContent = formatHeaderDate(date);
        byId('clock-time').textContent = formatTime(date);
        byId('clock-offset').textContent = formatUtcOffset(date);
        byId('clock-utc').textContent = formatUtcTime(date);
        byId('sim-date').textContent = formatDate(date);
        byId('sim-time').textContent = formatTime(date);
        byId('sim-jd').textContent = formatNumber(julianDate(date), 5);
        if (!this.dateFormDirty) {
            byId('input-date').value = toDateInputValue(date);
            byId('input-time').value = toTimeInputValue(date);
        }
    }

    /** Estado del control de tiempo (modo, velocidad, sentido). */
    updateTimeState(clock, speedIndex, withinValidity) {
        const badge = byId('mode-badge');
        const [label, className] = clock.realtime
            ? ['Tiempo real', 'badge--live']
            : clock.playing ? ['Simulado', 'badge--sim'] : ['En pausa', 'badge--paused'];
        if (badge.textContent !== label) {
            badge.textContent = label;
            badge.className = `badge ${className}`;
        }
        const signedScale = clock.timeScale * clock.direction;
        const scaleText = `${clock.direction < 0 ? '−' : ''}${formatTimeScale(clock.timeScale)}`;
        byId('speed-badge').textContent = clock.playing ? scaleText : `${scaleText} (pausa)`;
        byId('speed-output').textContent = scaleText;
        byId('speed-hint').textContent = signedScale < 0
            ? `${describeTimeScale(clock.timeScale)} (hacia atrás)`
            : describeTimeScale(clock.timeScale);
        byId('speed-slider').value = String(speedIndex);
        byId('btn-play').classList.toggle('is-active', clock.playing);
        byId('btn-pause').classList.toggle('is-active', !clock.playing);
        byId('btn-realtime').classList.toggle('is-active', clock.realtime);
        byId('btn-reverse').setAttribute('aria-pressed', String(clock.direction < 0));
        [...byId('speed-ticks').children].forEach((tick, index) => tick.classList.toggle('is-active', index === speedIndex));
        byId('precision-warning').hidden = withinValidity;
    }

    /** Cabecera, descripción y datos de referencia del objeto seleccionado. */
    /**
     * Muestra el encabezado, los datos de referencia y las acciones del objeto
     * seleccionado (cuerpo, satélite o lanzamiento; ver info-rows.js).
     * @param {object} descriptor { symbol, name, type, color, description, staticRows, actions, bodyId, showMoonPhase }
     */
    showSelection(descriptor) {
        const panel = byId('panel-info');
        panel.style.setProperty('--object-color', descriptor.color);
        byId('info-symbol').textContent = descriptor.symbol;
        byId('info-name').textContent = descriptor.name;
        byId('info-type').textContent = descriptor.type;
        byId('info-description').textContent = descriptor.description;
        byId('moon-phase').hidden = !descriptor.showMoonPhase;
        this.renderRows(byId('info-static'), descriptor.staticRows);
        byId('info-actions').replaceChildren(...descriptor.actions.map(({ id, label }, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn btn--block${index === 0 ? ' btn--primary' : ''}`;
            button.dataset.action = id;
            button.textContent = label;
            return button;
        }));
        for (const [bodyId, button] of this.bodyButtons) button.classList.toggle('is-active', bodyId === descriptor.bodyId);
    }

    /**
     * Datos dinámicos del objeto seleccionado (≈ 4 veces por segundo).
     * @param {object} info { live: filas, observation: filas | null, moonPhase: fase | null }
     */
    updateInfo({ live, observation = null, moonPhase = null }) {
        this.renderRows(byId('info-live'), live);
        const observationList = byId('info-observation');
        observationList.hidden = !observation;
        if (observation) this.renderRows(observationList, observation);
        if (moonPhase) this.drawMoonPhase(moonPhase);
    }

    /** Resumen de la sección "Satélites Starlink" del panel izquierdo. */
    updateSatelliteSummary({ count, launches, dataDate, ageText, ageLevel }) {
        byId('satellite-count').textContent = formatNumber(count, 0);
        byId('launch-count').textContent = formatNumber(launches, 0);
        byId('satellite-data-date').textContent = dataDate;
        const warning = byId('satellite-age');
        warning.textContent = `Elementos orbitales: ${ageText}.`;
        warning.dataset.level = ageLevel;
    }

    /**
     * Pinta una lista <dl>. Si las etiquetas no cambian, solo actualiza los
     * textos modificados (evita reconstruir el DOM varias veces por segundo).
     */
    renderRows(container, rows) {
        const signature = rows.map((item) => item.label).join('|');
        if (container.dataset.signature !== signature) {
            container.replaceChildren(...rows.map((item) => {
                const wrapper = document.createElement('div');
                const dt = document.createElement('dt');
                const dd = document.createElement('dd');
                dt.textContent = item.label;
                wrapper.append(dt, dd);
                return wrapper;
            }));
            container.dataset.signature = signature;
        }
        rows.forEach((item, index) => {
            const dd = container.children[index].lastElementChild;
            const text = `${item.value}\u0000${item.note}`;
            if (dd.dataset.text === text) return;
            dd.dataset.text = text;
            dd.textContent = item.value;
            if (item.note) {
                const note = document.createElement('small');
                note.textContent = ` · ${item.note}`;
                dd.appendChild(note);
            }
        });
    }

    /**
     * Dibuja la fase lunar: medio disco iluminado más una semielipse del
     * terminador de semieje |cos i|·r (i = ángulo de fase). En creciente
     * se ilumina el lado derecho (vista desde el hemisferio norte).
     */
    drawMoonPhase({ illumination, waxing }) {
        const canvas = byId('moon-phase-canvas');
        const context = canvas.getContext('2d');
        const size = canvas.width;
        const r = size * 0.44;
        const c = size / 2;
        context.clearRect(0, 0, size, size);
        context.save();
        context.translate(c, c);
        if (!waxing) context.scale(-1, 1);

        context.fillStyle = '#1a2233';
        context.beginPath();
        context.arc(0, 0, r, 0, Math.PI * 2);
        context.fill();

        const terminator = Math.abs(2 * illumination - 1) * r;
        const gradient = context.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        gradient.addColorStop(0, '#fbfbf5');
        gradient.addColorStop(1, '#c9cbc4');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        if (illumination >= 0.5) context.ellipse(0, 0, terminator, r, 0, Math.PI / 2, Math.PI * 1.5, false);
        else context.ellipse(0, 0, terminator, r, 0, Math.PI / 2, -Math.PI / 2, true);
        context.fill();
        context.restore();
    }

    /** Cambia la presentación entre la vista espacial y la vista desde la Tierra. */
    setSkyMode(enabled, observer) {
        byId('sky-section').hidden = !enabled;
        byId('sky-compass').hidden = !enabled;
        if (enabled) this.showObserver(observer);
        if (!enabled) byId('info-observation').hidden = true;
    }

    showObserver(observer) {
        byId('input-latitude').value = observer.latitude.toFixed(3);
        byId('input-longitude').value = observer.longitude.toFixed(3);
        byId('observer-name').textContent = `Ubicación: ${observer.name}.`;
    }

    /** Estado de iluminación del cielo y orientación de la mirada. */
    updateSkyStatus(sunAltitudeDeg, look) {
        byId('sky-status').textContent = `☀ ${formatDegrees(sunAltitudeDeg, 1)} · ${describeSunAltitude(sunAltitudeDeg)}`;
        byId('sky-compass').textContent = `Mirando: Az ${formatAzimuth(look.azimuth)} · Alt ${formatDegrees(look.altitude, 1)} · Campo ${formatDegrees(look.fov, 0)}`;
    }

    setActiveView(view) {
        for (const button of document.querySelectorAll('[data-view]')) {
            button.classList.toggle('is-active', button.dataset.view === view);
        }
    }

    hideLoading() {
        const loading = byId('loading-screen');
        loading.classList.add('is-done');
        loading.addEventListener('transitionend', () => { loading.hidden = true; }, { once: true });
    }
}

/** Progreso de la pantalla de carga (0–1); se usa antes de crear UIManager. */
export function setLoadingProgress(progress) {
    byId('loading-progress').style.width = `${Math.round(progress * 100)}%`;
}

/** Muestra un error de arranque (por ejemplo, WebGL no disponible). */
export function showStartupError(message) {
    byId('loading-screen').hidden = true;
    byId('startup-error-message').textContent = message;
    byId('startup-error').hidden = false;
}
