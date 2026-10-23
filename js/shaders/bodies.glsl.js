/**
 * @file bodies.glsl.js
 * Shaders genéricos de cuerpos: atmósfera, superficie lunar y anillos.
 */

/**
 * Atmósfera: esfera ligeramente mayor, renderizada por su cara posterior con
 * mezcla aditiva. Para una capa de radio s (en radios del planeta) vista desde
 * lejos, N·V vale 0 en el borde externo y −√(1 − 1/s²) sobre el limbo del
 * planeta; la intensidad se normaliza con ese valor (uLimb).
 * Se ilumina solo hacia el Sol, con tono rojizo en el terminador.
 */
export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uSunDirection;
    uniform vec3 uColor;
    uniform vec3 uTwilightColor;
    uniform float uIntensity;
    uniform float uLimb;
    uniform float uPower;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vPositionW);
        float depth = clamp(-dot(N, V) / uLimb, 0.0, 1.0);
        float glow = pow(depth, uPower);

        float NdotL = dot(N, normalize(uSunDirection));
        float lit = smoothstep(-0.28, 0.35, NdotL);
        vec3 color = mix(uTwilightColor, uColor, smoothstep(-0.05, 0.4, NdotL));
        gl_FragColor = vec4(color * glow * lit * uIntensity, 1.0);
    }
`;

/**
 * Superficie lunar: mezcla de Lommel-Seeliger (regolito, disco casi plano en
 * Luna llena) y Lambert, luz cenicienta tenue en el lado nocturno y
 * coloración rojiza durante eclipses lunares (uUmbra / uPenumbra).
 */
export const MOON_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uMap;
    uniform vec3 uSunDirection;
    uniform float uSunIntensity;
    uniform float uUmbra;
    uniform float uPenumbra;
    uniform float uEarthshine;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(uSunDirection);
        vec3 V = normalize(cameraPosition - vPositionW);
        float mu0 = max(dot(N, L), 0.0);
        float mu = max(dot(N, V), 0.0);
        float lommelSeeliger = 2.0 * mu0 / (mu0 + mu + 1e-4);
        float shade = mix(lommelSeeliger, mu0, 0.35);

        vec3 albedo = texture2D(uMap, vUv).rgb;
        float penumbraDimming = mix(1.0, 0.45, uPenumbra);
        // En totalidad solo llega luz refractada (rojiza) por la atmósfera terrestre.
        vec3 eclipseTint = mix(vec3(1.0), vec3(0.8, 0.3, 0.12) * 0.32, uUmbra);
        vec3 sunlit = albedo * shade * uSunIntensity * penumbraDimming * eclipseTint;
        vec3 earthshine = albedo * uEarthshine * (1.0 - smoothstep(0.0, 0.15, mu0));
        gl_FragColor = vec4(sunlit + earthshine, 1.0);
    }
`;

/**
 * Anillos: color/transparencia desde la textura radial, sombra analítica del
 * planeta (intersección rayo–esfera hacia el Sol) y brillo distinto en la
 * cara iluminada y en la cara opuesta (luz transmitida).
 */
export const RING_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uRingMap;
    uniform vec3 uSunPosition;
    uniform vec3 uPlanetPosition;
    uniform float uPlanetRadius;
    uniform vec3 uRingNormal;
    uniform float uSunIntensity;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
        vec4 ring = texture2D(uRingMap, vec2(vUv.x, 0.5));
        if (ring.a < 0.01) discard;

        vec3 L = normalize(uSunPosition - vPositionW);
        vec3 V = normalize(cameraPosition - vPositionW);
        vec3 N = normalize(uRingNormal);

        vec3 oc = vPositionW - uPlanetPosition;
        float b = dot(oc, L);
        float h = b * b - (dot(oc, oc) - uPlanetRadius * uPlanetRadius);
        float shadow = (b < 0.0) ? smoothstep(0.0, uPlanetRadius * uPlanetRadius * 0.02, h) : 0.0;

        float sunSide = dot(N, L);
        float viewSide = dot(N, V);
        float frontLit = step(0.0, sunSide * viewSide);
        float transmission = mix(0.18, 0.65, 1.0 - ring.a);
        float lighting = mix(transmission, 1.0, frontLit) * smoothstep(0.0, 0.06, abs(sunSide));

        vec3 color = ring.rgb * uSunIntensity * lighting * (1.0 - 0.92 * shadow);
        gl_FragColor = vec4(color, ring.a * 0.95);
    }
`;

/** Fragmentos inyectados en MeshStandardMaterial para la sombra de los anillos sobre el planeta. */
export const RING_SHADOW_CHUNKS = Object.freeze({
    vertexDeclarations: /* glsl */ `
        varying vec3 vRingWorldPosition;
    `,
    vertexBody: /* glsl */ `
        vRingWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `,
    fragmentDeclarations: /* glsl */ `
        uniform sampler2D uRingShadowMap;
        uniform vec3 uRingShadowSun;
        uniform vec3 uRingShadowCenter;
        uniform vec3 uRingShadowNormal;
        uniform float uRingShadowInner;
        uniform float uRingShadowOuter;
        varying vec3 vRingWorldPosition;

        float ringShadowFactor() {
            vec3 toSun = normalize(uRingShadowSun - vRingWorldPosition);
            float denominator = dot(toSun, uRingShadowNormal);
            if (abs(denominator) < 1e-4) return 1.0;
            float t = dot(uRingShadowCenter - vRingWorldPosition, uRingShadowNormal) / denominator;
            if (t <= 0.0) return 1.0;
            float radius = length(vRingWorldPosition + toSun * t - uRingShadowCenter);
            float u = (radius - uRingShadowInner) / (uRingShadowOuter - uRingShadowInner);
            if (u <= 0.0 || u >= 1.0) return 1.0;
            return 1.0 - texture2D(uRingShadowMap, vec2(u, 0.5)).a * 0.85;
        }
    `,
    fragmentBody: /* glsl */ `
        float ringShadow = ringShadowFactor();
        reflectedLight.directDiffuse *= ringShadow;
        reflectedLight.directSpecular *= ringShadow;
    `
});
