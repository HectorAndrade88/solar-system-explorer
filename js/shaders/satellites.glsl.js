/**
 * @file satellites.glsl.js
 * Shaders de la constelación de satélites.
 *
 * La CPU propaga todos los satélites con SGP4 cada cierto tiempo simulado
 * (posición r₀ y velocidad v₀ en el instante de referencia). Entre dos
 * propagaciones, la GPU avanza cada satélite sobre su órbita con la
 * aproximación circular, exacta para órbitas casi circulares como las de
 * Starlink (e ≈ 0,0001–0,001):
 *     r(Δt) = |r₀|·(cos θ·r̂ + sin θ·t̂),   θ = ω·Δt,   ω = |v_t| / |r₀|
 * donde t̂ es la dirección transversal de la velocidad.
 * Iluminación: un satélite está en sombra si queda detrás de la Tierra
 * respecto al Sol dentro del cilindro de sombra (r·ŝ < 0 y |r − (r·ŝ)ŝ| < R⊕).
 */

const PROPAGATION_CHUNK = /* glsl */ `
    attribute vec3 aVelocity;
    attribute float aVisible;
    attribute float aLaunch;

    uniform float uDt;
    uniform vec3 uSunDirection;
    uniform float uHighlight;
    uniform float uPixelRatio;
    uniform float uSize;

    const float EARTH_RADIUS = 6371.0;

    vec3 propagateCircular(vec3 r0, vec3 v0, float dt) {
        float radius = length(r0);
        vec3 radial = r0 / radius;
        vec3 transverse = v0 - dot(v0, radial) * radial;
        float speed = length(transverse);
        float angle = speed / radius * dt;
        return radius * (cos(angle) * radial + sin(angle) * (transverse / speed));
    }

    float sunlit(vec3 r) {
        float along = dot(r, uSunDirection);
        float distanceToAxis = length(r - along * uSunDirection);
        return (along > 0.0 || distanceToAxis > EARTH_RADIUS) ? 1.0 : 0.0;
    }

    float isHighlighted() {
        return abs(aLaunch - uHighlight) < 0.5 ? 1.0 : 0.0;
    }
`;

export const SATELLITE_SPACE_VERTEX_SHADER = /* glsl */ `
    ${PROPAGATION_CHUNK}

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        if (aVisible < 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
        }
        vec3 r = propagateCircular(position, aVelocity, uDt);
        float light = sunlit(r);
        float highlight = isHighlighted();
        vec3 lit = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.78, 0.32), highlight);
        vec3 shadow = mix(vec3(0.22, 0.26, 0.36), vec3(0.6, 0.42, 0.18), highlight);
        vColor = mix(shadow, lit, light);
        vAlpha = mix(0.55, 1.0, max(light, highlight));
        gl_PointSize = uSize * uPixelRatio * mix(1.0, 2.2, highlight);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(r, 1.0);
    }
`;

/**
 * Vista desde la Tierra: dirección topocéntrica (satélite − observador) en
 * la base horizontal. Solo se ven los satélites iluminados por el Sol, y el
 * cielo diurno los oculta. Brillo aproximado de Starlink:
 *     m ≈ 4,5 + 5·log10(distancia / 550 km).
 */
export const SATELLITE_SKY_VERTEX_SHADER = /* glsl */ `
    ${PROPAGATION_CHUNK}

    uniform vec3 uObserver;
    uniform mat3 uHorizon;
    uniform float uDaylight;
    uniform float uSkyRadius;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec3 r = propagateCircular(position, aVelocity, uDt);
        vec3 relative = r - uObserver;
        float range = length(relative);
        float highlight = isHighlighted();
        float magnitude = 4.5 + 5.0 * log(range / 550.0) / log(10.0) - highlight * 1.0;
        float limiting = mix(6.5, -1.0, uDaylight);
        float visibility = aVisible * sunlit(r) * clamp((limiting - magnitude) / 1.5, 0.0, 1.0);
        if (visibility < 0.02) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
        }
        vColor = mix(vec3(0.92, 0.95, 1.0), vec3(1.0, 0.8, 0.4), highlight);
        vAlpha = visibility;
        gl_PointSize = uSize * uPixelRatio * mix(1.0, 1.6, highlight);
        vec3 direction = uHorizon * (relative / range);
        gl_Position = projectionMatrix * viewMatrix * vec4(direction * uSkyRadius, 1.0);
    }
`;

export const SATELLITE_FRAGMENT_SHADER = /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec2 offset = gl_PointCoord - 0.5;
        float distance2 = dot(offset, offset) * 4.0;
        if (distance2 > 1.0) discard;
        float core = exp(-distance2 * 4.0);
        gl_FragColor = vec4(vColor * core, vAlpha * core);
    }
`;
