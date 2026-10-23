/**
 * @file config.js
 * Configuración global de Solar System Explorer.
 *
 * Las distancias reales del Sistema Solar son enormes comparadas con el tamaño
 * de los cuerpos, por eso se separan dos escalas independientes:
 *  - Escala orbital: cuántas unidades de escena equivalen a 1 UA.
 *  - Escala de tamaño: cuánto se exagera el radio de cada cuerpo.
 * Las posiciones angulares calculadas por el motor astronómico no se alteran:
 * solo cambia la distancia radial con que se dibujan.
 */

/** Unidades de escena que equivalen a 1 UA cuando orbitScale = 1. */
export const SCENE_UNITS_PER_AU = 100;

/** Valores iniciales modificables desde la interfaz (panel "Escala visual"). */
export const CONFIG = {
    /** Exageración del radio de planetas y Luna respecto a la escala orbital. */
    planetScale: 200,
    /** Exageración del radio del Sol (separada para que no engulla a Mercurio). */
    sunScale: 30,
    /** Multiplicador de las distancias orbitales. */
    orbitScale: 1,
    /** Exageración de la distancia Tierra–Luna. */
    moonScale: 40,
    /**
     * Velocidad inicial de la simulación (segundos simulados por segundo real).
     * Debe ser uno de los valores de TIME_SCALE_STEPS; 1 = tiempo real.
     */
    timeScale: 1,
    /** 'linear' conserva las proporciones reales; 'compressed' usa r^0.5. */
    distanceMode: 'linear',

    showOrbits: true,
    showLabels: true,
    showMilkyWay: true,
    showConstellations: false,
    showAxes: false,
    /** Constelación Starlink (posiciones SGP4 en tiempo real). */
    showSatellites: true,
    bloom: true,
    /** En la vista desde la Tierra, amplía Sol y Luna para que se aprecien. */
    magnifySkyBodies: true
};

/** Límites de los controles deslizantes de escala. */
export const SCALE_LIMITS = Object.freeze({
    planetScale: { min: 1, max: 2000, logarithmic: true },
    sunScale: { min: 1, max: 100, logarithmic: true },
    orbitScale: { min: 0.25, max: 4, logarithmic: true },
    moonScale: { min: 1, max: 200, logarithmic: true }
});

/** Exponente aplicado a la distancia en el modo comprimido. */
export const COMPRESSED_DISTANCE_EXPONENT = 0.5;

/** Velocidades disponibles en el control de tiempo (multiplicadores). */
export const TIME_SCALE_STEPS = Object.freeze([1, 10, 100, 1000, 10000, 100000, 1000000]);

/** Parámetros de rendimiento: separación entre cálculo, actualización y UI. */
export const PERFORMANCE = Object.freeze({
    /** Intervalo real aproximado entre dos cálculos completos de efemérides. */
    ephemerisIntervalMs: 100,
    /** Ventana simulada mínima/máxima entre dos instantáneas (interpolación). */
    ephemerisMinSpanMs: 1000,
    ephemerisMaxSpanMs: 0.1 * 86400000,
    /** Frecuencia de refresco de paneles de información. */
    uiRefreshMs: 250,
    /** Recalcular la trayectoria lunar cuando el tiempo avanza más que esto. */
    moonOrbitRefreshDays: 0.5,
    /** Recalcular las órbitas planetarias cuando el tiempo avanza más que esto. */
    planetOrbitRefreshDays: 3650,
    /**
     * Segundos simulados entre dos propagaciones SGP4 completas de los
     * satélites; entre ellas la GPU extrapola cada órbita.
     */
    satelliteRefreshSeconds: 120,
    /** Distancia (en radios terrestres) a partir de la cual se ocultan los satélites. */
    satelliteMaxEarthRadii: 120,
    maxPixelRatio: 2
});

/** Años en que se permite fijar la fecha (fuera de 1800–2050 baja la precisión). */
export const DATE_LIMITS = Object.freeze({ minYear: 1000, maxYear: 3000 });

/**
 * Ubicaciones de observador por zona horaria, para la vista desde la Tierra.
 * No se usa geolocalización (podría consultar servicios externos).
 */
export const OBSERVER_PRESETS = Object.freeze({
    'America/Bogota': { name: 'Bogotá', latitude: 4.711, longitude: -74.072 },
    'America/Mexico_City': { name: 'Ciudad de México', latitude: 19.433, longitude: -99.133 },
    'America/Lima': { name: 'Lima', latitude: -12.046, longitude: -77.043 },
    'America/Guayaquil': { name: 'Guayaquil', latitude: -2.170, longitude: -79.922 },
    'America/Caracas': { name: 'Caracas', latitude: 10.481, longitude: -66.904 },
    'America/Panama': { name: 'Ciudad de Panamá', latitude: 8.983, longitude: -79.517 },
    'America/Santiago': { name: 'Santiago de Chile', latitude: -33.449, longitude: -70.669 },
    'America/Argentina/Buenos_Aires': { name: 'Buenos Aires', latitude: -34.604, longitude: -58.382 },
    'America/Montevideo': { name: 'Montevideo', latitude: -34.901, longitude: -56.164 },
    'America/Sao_Paulo': { name: 'São Paulo', latitude: -23.551, longitude: -46.633 },
    'America/La_Paz': { name: 'La Paz', latitude: -16.500, longitude: -68.150 },
    'America/Asuncion': { name: 'Asunción', latitude: -25.264, longitude: -57.576 },
    'America/Costa_Rica': { name: 'San José', latitude: 9.928, longitude: -84.091 },
    'America/Guatemala': { name: 'Guatemala', latitude: 14.634, longitude: -90.507 },
    'America/Havana': { name: 'La Habana', latitude: 23.113, longitude: -82.366 },
    'America/Santo_Domingo': { name: 'Santo Domingo', latitude: 18.486, longitude: -69.931 },
    'America/Puerto_Rico': { name: 'San Juan', latitude: 18.466, longitude: -66.106 },
    'America/New_York': { name: 'Nueva York', latitude: 40.713, longitude: -74.006 },
    'America/Chicago': { name: 'Chicago', latitude: 41.878, longitude: -87.630 },
    'America/Denver': { name: 'Denver', latitude: 39.739, longitude: -104.990 },
    'America/Los_Angeles': { name: 'Los Ángeles', latitude: 34.052, longitude: -118.244 },
    'Europe/Madrid': { name: 'Madrid', latitude: 40.417, longitude: -3.704 },
    'Europe/London': { name: 'Londres', latitude: 51.507, longitude: -0.128 },
    'Europe/Paris': { name: 'París', latitude: 48.857, longitude: 2.352 },
    'Europe/Berlin': { name: 'Berlín', latitude: 52.520, longitude: 13.405 },
    'Europe/Rome': { name: 'Roma', latitude: 41.903, longitude: 12.496 },
    'Asia/Tokyo': { name: 'Tokio', latitude: 35.676, longitude: 139.650 },
    'Australia/Sydney': { name: 'Sídney', latitude: -33.869, longitude: 151.209 },
    UTC: { name: 'Greenwich', latitude: 51.478, longitude: 0.0 }
});
