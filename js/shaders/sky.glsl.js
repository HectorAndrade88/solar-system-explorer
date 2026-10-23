/**
 * @file sky.glsl.js
 * Shaders del fondo celeste: estrellas puntuales, cúpula atmosférica y suelo.
 */

/**
 * Estrellas: el tamaño y la opacidad dependen de la magnitud visual.
 * Flujo relativo  F = 10^(−0.4·(m − m_ref)); se comprime con F^0.6 porque la
 * percepción del brillo es aproximadamente logarítmica.
 */
export const STAR_VERTEX_SHADER = /* glsl */ `
    attribute float aMagnitude;
    attribute vec3 aColor;

    uniform float uPixelRatio;
    uniform float uBrightness;
    uniform float uMagnitudeLimit;
    uniform float uSizeScale;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float relative = clamp((uMagnitudeLimit - aMagnitude) / (uMagnitudeLimit + 1.5), 0.0, 1.0);
        float flux = pow(10.0, -0.4 * (aMagnitude - 1.0));
        vAlpha = clamp(pow(flux, 0.6), 0.14, 1.8) * uBrightness * step(aMagnitude, uMagnitudeLimit);
        vColor = aColor;
        gl_PointSize = mix(1.6, 7.5, relative * relative) * uPixelRatio * uSizeScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const STAR_FRAGMENT_SHADER = /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vec2 offset = gl_PointCoord - 0.5;
        float distance2 = dot(offset, offset) * 4.0;
        if (distance2 > 1.0) discard;
        float core = exp(-distance2 * 9.0);
        float halo = exp(-distance2 * 2.5) * 0.25;
        gl_FragColor = vec4(vColor * vAlpha * (core * 1.4 + halo), 1.0);
    }
`;

export const DIRECTION_VERTEX_SHADER = /* glsl */ `
    varying vec3 vDirection;
    void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

/**
 * Cúpula celeste vista desde la superficie: interpolación entre cielo
 * nocturno, crepuscular y diurno según la altura del Sol, con halo de
 * dispersión de Mie alrededor del Sol y horizonte más claro.
 * Marco local: +Y cénit, −Z norte, +X este.
 */
export const SKY_DOME_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uSunDirection;
    uniform float uDaylight;
    uniform float uTwilight;

    varying vec3 vDirection;

    void main() {
        vec3 direction = normalize(vDirection);
        float height = max(direction.y, 0.0);
        float cosSun = dot(direction, normalize(uSunDirection));

        vec3 dayZenith = vec3(0.07, 0.2, 0.55);
        vec3 dayHorizon = vec3(0.5, 0.68, 0.92);
        vec3 dayColor = mix(dayHorizon, dayZenith, pow(height, 0.45));
        vec3 nightColor = mix(vec3(0.010, 0.016, 0.034), vec3(0.002, 0.004, 0.012), pow(height, 0.5));

        vec3 twilightGlow = vec3(1.0, 0.42, 0.14) * pow(max(cosSun, 0.0), 5.0) * pow(1.0 - height, 3.0);
        vec3 twilightBand = vec3(0.32, 0.16, 0.24) * pow(1.0 - height, 4.0);

        vec3 color = mix(nightColor, dayColor, uDaylight);
        color += uTwilight * (twilightGlow * 1.4 + twilightBand * 0.6);
        color += uDaylight * (vec3(1.0, 0.95, 0.85) * pow(max(cosSun, 0.0), 400.0) * 2.0
                            + vec3(0.9, 0.82, 0.65) * pow(max(cosSun, 0.0), 10.0) * 0.22);
        gl_FragColor = vec4(color, 1.0);
    }
`;

/** Suelo opaco bajo el horizonte, más claro de día y con bruma en el borde. */
export const GROUND_FRAGMENT_SHADER = /* glsl */ `
    uniform float uDaylight;
    uniform float uTwilight;

    varying vec3 vDirection;

    void main() {
        vec3 direction = normalize(vDirection);
        float depth = clamp(-direction.y, 0.0, 1.0);
        vec3 nightGround = vec3(0.006, 0.008, 0.010);
        vec3 dayGround = vec3(0.10, 0.12, 0.09);
        vec3 color = mix(nightGround, dayGround, uDaylight);
        vec3 haze = mix(vec3(0.02, 0.03, 0.05), vec3(0.42, 0.52, 0.62), uDaylight) + vec3(0.12, 0.05, 0.02) * uTwilight;
        color = mix(haze, color, smoothstep(0.0, 0.08, depth));
        gl_FragColor = vec4(color, 1.0);
    }
`;
