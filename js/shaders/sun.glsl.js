/**
 * @file sun.glsl.js
 * Shaders del Sol: fotosfera animada y corona.
 * Los colores se emiten en rango HDR (> 1) para que el pase de bloom genere
 * el resplandor; el mapeo tonal final lo aplica OutputPass.
 */
import { SIMPLEX_NOISE } from './common.glsl.js';

export const PHOTOSPHERE_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vLocalPosition;
    varying vec3 vNormalW;
    varying vec3 vViewDirection;

    void main() {
        vUv = uv;
        vLocalPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDirection = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

/**
 * Fotosfera: textura base + granulación procedural (fBm animado) +
 * oscurecimiento del limbo  I(μ) = 1 − u·(1 − μ^α),  μ = cos θ.
 */
export const PHOTOSPHERE_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uMap;
    uniform float uTime;
    uniform float uIntensity;

    varying vec2 vUv;
    varying vec3 vLocalPosition;
    varying vec3 vNormalW;
    varying vec3 vViewDirection;

    ${SIMPLEX_NOISE}

    void main() {
        vec3 base = texture2D(uMap, vUv).rgb;
        float granulation = fbm(vLocalPosition * 5.0 + vec3(0.0, 0.0, uTime * 0.04));
        float cells = snoise(vLocalPosition * 22.0 + vec3(uTime * 0.12));
        float activity = 0.82 + 0.32 * granulation + 0.06 * cells;

        float mu = clamp(dot(normalize(vNormalW), normalize(vViewDirection)), 0.0, 1.0);
        float limbDarkening = 1.0 - 0.62 * (1.0 - pow(mu, 0.75));
        vec3 limbTint = mix(vec3(1.0, 0.52, 0.22), vec3(1.0, 0.96, 0.88), pow(mu, 0.5));

        vec3 color = mix(base, vec3(1.0, 0.82, 0.5), 0.35) * activity * limbDarkening * limbTint;
        gl_FragColor = vec4(color * uIntensity, 1.0);
    }
`;

export const CORONA_VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

/**
 * Corona: plano orientado a la cámara. La intensidad decae como ρ^(−2.4)
 * (ρ en radios solares) y se modula con serpentinas de ruido angular.
 */
export const CORONA_FRAGMENT_SHADER = /* glsl */ `
    uniform float uTime;
    uniform float uExtent;
    uniform float uIntensity;
    uniform vec3 uColor;

    varying vec2 vUv;

    ${SIMPLEX_NOISE}

    void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r >= 1.0) discard;

        float rho = max(r * uExtent, 1.0);
        float angle = atan(p.y, p.x);
        vec3 ringCoordinate = vec3(cos(angle) * 1.6, sin(angle) * 1.6, uTime * 0.03);
        float streamers = 0.55 + 0.45 * snoise(ringCoordinate + vec3(rho * 0.35, 0.0, 0.0));
        streamers *= 0.75 + 0.25 * snoise(ringCoordinate * 3.0 - vec3(0.0, rho * 0.6, uTime * 0.05));

        float falloff = pow(rho, -2.4) * streamers;
        float edgeFade = pow(1.0 - r, 2.0);
        gl_FragColor = vec4(uColor * falloff * edgeFade * uIntensity, 1.0);
    }
`;
