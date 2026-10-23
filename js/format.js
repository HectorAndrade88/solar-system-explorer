/**
 * @file format.js
 * Formato de números, magnitudes físicas y fechas para la interfaz (español).
 */

const LOCALE = 'es-CO';
const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const SUPERSCRIPT_DIGITS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const numberFormatters = new Map();

/**
 * Número con separadores locales (miles con punto, decimales con coma).
 * Los formateadores Intl se reutilizan por precisión.
 */
export function formatNumber(value, decimals = 0) {
    if (!Number.isFinite(value)) return '—';
    let formatter = numberFormatters.get(decimals);
    if (!formatter) {
        formatter = new Intl.NumberFormat(LOCALE, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: 'always'
        });
        numberFormatters.set(decimals, formatter);
    }
    return formatter.format(value).replace('-', '−');
}

/** Distancia en km, expresada en millones de km cuando es grande. */
export function formatDistanceKm(km) {
    if (km >= 1e9) return `${formatNumber(km / 1e9, 3)} mil millones de km`;
    if (km >= 1e6) return `${formatNumber(km / 1e6, 1)} millones de km`;
    return `${formatNumber(km, 0)} km`;
}

export function formatAU(au) {
    return `${formatNumber(au, au < 10 ? 4 : 3)} UA`;
}

export function formatSpeed(kmPerSecond) {
    return `${formatNumber(kmPerSecond, 2)} km/s`;
}

/** Periodo de rotación: horas y minutos, o días si es largo. Negativo = retrógrado. */
export function formatRotation(hours) {
    const absolute = Math.abs(hours);
    const suffix = hours < 0 ? ' (retrógrada)' : '';
    if (absolute >= 48) return `${formatNumber(absolute / 24, 2)} días${suffix}`;
    const wholeHours = Math.floor(absolute);
    const minutes = Math.round((absolute - wholeHours) * 60);
    return `${wholeHours} h ${String(minutes).padStart(2, '0')} min${suffix}`;
}

/** Periodo orbital en días, con equivalencia en años si supera dos años. */
export function formatOrbitalPeriod(days) {
    if (days >= 730) return `${formatNumber(days, 0)} días (${formatNumber(days / 365.25, 2)} años)`;
    return `${formatNumber(days, 2)} días`;
}

export function formatDegrees(degrees, decimals = 2) {
    return `${formatNumber(degrees, decimals)}°`;
}

export function formatTemperature(celsius) {
    return `${formatNumber(celsius, 0)} °C`;
}

export function formatPercent(fraction, decimals = 0) {
    return `${formatNumber(fraction * 100, decimals)} %`;
}

/** Masa en notación científica: 5,97 × 10²⁴ kg. */
export function formatMass(kg) {
    const exponent = Math.floor(Math.log10(kg));
    const mantissa = kg / 10 ** exponent;
    const superscript = String(exponent).split('').map((digit) => SUPERSCRIPT_DIGITS[digit]).join('');
    return `${formatNumber(mantissa, 2)} × 10${superscript} kg`;
}

export function formatMagnitude(magnitude) {
    return formatNumber(magnitude, 1);
}

/** Acimut con el punto cardinal más próximo (rosa de 16 rumbos). */
export function formatAzimuth(degrees) {
    const point = COMPASS_POINTS[Math.round(degrees / 22.5) % 16];
    return `${formatNumber(degrees, 1)}° (${point})`;
}

/** Tiempo de viaje de la luz: segundos, minutos u horas. */
export function formatLightTime(seconds) {
    if (seconds < 120) return `${formatNumber(seconds, 1)} s`;
    if (seconds < 7200) return `${formatNumber(seconds / 60, 1)} min`;
    return `${formatNumber(seconds / 3600, 2)} h`;
}

/** Velocidad de simulación: "1×", "10.000×". */
export function formatTimeScale(scale) {
    return `${formatNumber(scale, 0)}×`;
}

/** Equivalencia legible de la velocidad: cuánto tiempo simulado pasa por segundo real. */
export function describeTimeScale(scale) {
    const seconds = scale;
    if (seconds < 60) return `1 s real = ${formatNumber(seconds, 0)} s simulados`;
    if (seconds < 3600) return `1 s real = ${formatNumber(seconds / 60, 1)} min simulados`;
    if (seconds < 86400) return `1 s real = ${formatNumber(seconds / 3600, 1)} h simuladas`;
    return `1 s real = ${formatNumber(seconds / 86400, 1)} días simulados`;
}

/* ------------------------------------------------------------------------ */
/* Fechas (zona horaria local del navegador)                                 */
/* ------------------------------------------------------------------------ */

const pad = (value, length = 2) => String(value).padStart(length, '0');

/** Zona horaria IANA del sistema (por ejemplo, America/Bogota). */
export function localTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
}

/** 04/10/2026 */
export function formatDate(date) {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** 12:50:32 */
export function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 04 OCT 2026 */
export function formatHeaderDate(date) {
    return `${pad(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** 17:50:32 (UTC) */
export function formatUtcTime(date) {
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** UTC−05:00 (desfase de la zona local en esa fecha, incluido horario de verano). */
export function formatUtcOffset(date) {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes < 0 ? '−' : '+';
    const absolute = Math.abs(offsetMinutes);
    return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** Valores para <input type="date"> y <input type="time" step="1">. */
export function toDateInputValue(date) {
    return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInputValue(date) {
    return formatTime(date);
}

/**
 * Interpreta fecha (AAAA-MM-DD) y hora (HH:MM[:SS]) en la zona local.
 * @returns {Date|null} null si los valores no forman una fecha válida.
 */
export function parseLocalDateTime(dateText, timeText) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText);
    if (!dateMatch || !timeMatch) return null;
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const [hours, minutes, seconds = 0] = timeMatch.slice(1).map((part) => Number(part ?? 0));
    const date = new Date(2000, 0, 1, hours, minutes, seconds);
    date.setFullYear(year, month - 1, day);
    const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return valid ? date : null;
}

/** Reloj de misión: T+00:08:35 o T−00:05:00. */
export function formatMissionClock(seconds) {
    const sign = seconds < 0 ? '−' : '+';
    const total = Math.floor(Math.abs(seconds));
    return `T${sign}${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Intervalo en días expresado en horas, días o años según su tamaño. */
export function formatElapsedDays(days) {
    const absolute = Math.abs(days);
    const prefix = days < 0 ? 'faltan ' : '';
    if (absolute < 1) return `${prefix}${formatNumber(absolute * 24, 1)} h`;
    if (absolute < 730) return `${prefix}${formatNumber(absolute, 1)} días`;
    return `${prefix}${formatNumber(absolute / 365.25, 1)} años`;
}
