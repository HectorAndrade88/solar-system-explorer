/**
 * @file ephemeris-service.js
 * Capa intermedia entre el motor astronómico y la visualización.
 *
 * Los cálculos completos (computeEphemeris) no se ejecutan en cada fotograma:
 * se calculan dos instantáneas A y B que encierran el instante simulado y las
 * posiciones se interpolan linealmente entre ellas. La separación entre A y B
 * se adapta a la velocidad para que haya ~10 cálculos por segundo real, con un
 * máximo de 0.1 días simulados (la Luna recorre ~1.3° en ese lapso, por lo que
 * la interpolación lineal es visualmente exacta).
 */
import { computeEphemeris, ROTATING_BODY_IDS, vec3 } from './astronomy.js';
import { PERFORMANCE } from './config.js';

const MS_PER_DAY = 86400000;

/** Interpola dos vectores {x,y,z} escribiendo en `target`. */
function lerpInto(target, a, b, t) {
    target.x = a.x + (b.x - a.x) * t;
    target.y = a.y + (b.y - a.y) * t;
    target.z = a.z + (b.z - a.z) * t;
    return target;
}

export class EphemerisService {
    constructor(settings = PERFORMANCE) {
        this.settings = settings;
        this.previous = null;
        this.next = null;
        this.computations = 0;
        this.state = {
            timeMs: 0,
            /** Días TT desde J2000 en el instante actual (para la rotación). */
            day: 0,
            snapshot: null,
            positions: Object.fromEntries(ROTATING_BODY_IDS.map((id) => [id, vec3()])),
            moonGeocentric: vec3()
        };
    }

    /** Instantánea astronómica calculada (y contabilizada). */
    compute(timeMs) {
        this.computations++;
        return computeEphemeris(new Date(timeMs));
    }

    /** Indica si el intervalo [A, B] actual contiene el instante. */
    covers(timeMs) {
        return this.previous !== null
            && timeMs >= this.previous.time.timeMs
            && timeMs <= this.next.time.timeMs;
    }

    /**
     * Calcula un nuevo par de instantáneas, reutilizando la anterior cuando el
     * tiempo avanza de forma continua (solo se calcula una nueva por ciclo).
     */
    refill(timeMs, spanMs, direction) {
        if (direction >= 0) {
            const reuse = this.next && timeMs >= this.next.time.timeMs && timeMs < this.next.time.timeMs + spanMs;
            this.previous = reuse ? this.next : this.compute(timeMs);
            this.next = this.compute(this.previous.time.timeMs + spanMs);
        } else {
            const reuse = this.previous && timeMs <= this.previous.time.timeMs && timeMs > this.previous.time.timeMs - spanMs;
            this.next = reuse ? this.previous : this.compute(timeMs);
            this.previous = this.compute(this.next.time.timeMs - spanMs);
        }
    }

    /**
     * Estado interpolado para el instante simulado.
     * @param {number} timeMs Instante simulado (ms Unix).
     * @param {number} effectiveScale Velocidad con signo (0 si está en pausa).
     */
    update(timeMs, effectiveScale) {
        const { ephemerisIntervalMs, ephemerisMinSpanMs, ephemerisMaxSpanMs } = this.settings;
        if (!this.covers(timeMs)) {
            const span = Math.min(ephemerisMaxSpanMs,
                Math.max(ephemerisMinSpanMs, Math.abs(effectiveScale) * ephemerisIntervalMs));
            this.refill(timeMs, span, effectiveScale);
        }

        const a = this.previous;
        const b = this.next;
        const t = (timeMs - a.time.timeMs) / (b.time.timeMs - a.time.timeMs);
        const state = this.state;
        state.timeMs = timeMs;
        state.snapshot = t < 0.5 ? a : b;
        state.day = a.time.d + (timeMs - a.time.timeMs) / MS_PER_DAY;
        for (const id of ROTATING_BODY_IDS) {
            lerpInto(state.positions[id], a.bodies[id].position, b.bodies[id].position, t);
        }
        lerpInto(state.moonGeocentric, a.bodies.moon.geocentric, b.bodies.moon.geocentric, t);
        return state;
    }
}
