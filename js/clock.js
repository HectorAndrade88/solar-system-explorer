/**
 * @file clock.js
 * Reloj de simulación: mantiene el instante simulado y su velocidad.
 *
 * En modo "tiempo real" el instante se toma directamente de Date.now(), así la
 * simulación coincide siempre con el reloj del sistema (aunque la pestaña haya
 * estado en segundo plano). En los demás modos avanza integrando el tiempo
 * real transcurrido multiplicado por la escala temporal.
 */
import { DATE_LIMITS } from './config.js';

const MIN_TIME_MS = Date.UTC(DATE_LIMITS.minYear, 0, 1);
const MAX_TIME_MS = Date.UTC(DATE_LIMITS.maxYear, 11, 31, 23, 59, 59);

export class SimulationClock {
    /** @param {Date} startDate Instante inicial (por defecto, ahora). */
    constructor(startDate = new Date()) {
        this.timeMs = startDate.getTime();
        this.timeScale = 1;
        this.direction = 1;
        this.playing = true;
        this.realtime = true;
    }

    /** Escala efectiva con signo (negativa al retroceder). */
    get effectiveScale() {
        return this.playing ? this.timeScale * this.direction : 0;
    }

    /** Avanza el reloj según el tiempo real transcurrido (milisegundos). */
    tick(realDeltaMs) {
        if (this.realtime) {
            this.timeMs = Date.now();
            return;
        }
        if (!this.playing) return;
        const next = this.timeMs + realDeltaMs * this.timeScale * this.direction;
        this.timeMs = Math.min(MAX_TIME_MS, Math.max(MIN_TIME_MS, next));
        if (this.timeMs === MIN_TIME_MS || this.timeMs === MAX_TIME_MS) this.playing = false;
    }

    play() {
        this.playing = true;
    }

    pause() {
        this.playing = false;
        this.realtime = false;
    }

    togglePlay() {
        if (this.playing) this.pause();
        else this.play();
    }

    /** Cambia la velocidad; cualquier valor distinto de 1× abandona el tiempo real. */
    setTimeScale(scale) {
        this.timeScale = scale;
        if (scale !== 1) this.realtime = false;
    }

    /** Invierte el sentido del tiempo (avanzar / retroceder). */
    setDirection(direction) {
        this.direction = direction < 0 ? -1 : 1;
        if (this.direction < 0) this.realtime = false;
    }

    /** Fija una fecha concreta; la simulación continúa desde ella. */
    setDate(date) {
        this.timeMs = Math.min(MAX_TIME_MS, Math.max(MIN_TIME_MS, date.getTime()));
        this.realtime = false;
    }

    /** Vuelve a la fecha y hora actuales del sistema, a velocidad 1×. */
    syncToRealTime() {
        this.timeMs = Date.now();
        this.timeScale = 1;
        this.direction = 1;
        this.playing = true;
        this.realtime = true;
    }
}
