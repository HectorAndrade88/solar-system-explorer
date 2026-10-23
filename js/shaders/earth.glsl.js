/**
 * @file earth.glsl.js
 * Shaders de la superficie terrestre y de la capa de nubes.
 *
 * La iluminación se calcula con la dirección real Tierra→Sol (uniforme
 * uSunDirection, en espacio mundo), de modo que el terminador día/noche
 * corresponde a la geometría astronómica del instante simulado.
 */

/**
 * Superficie terrestre:
 *  - Difusa de Lambert con relieve (normal map en espacio tangente esférico).
 *  - Transición día/noche suave (crepúsculo) en función de N·L.
 *  - Luces urbanas en el lado nocturno.
 *  - Reflejo especular (Blinn-Phong) solo en océanos (máscara especular).
 *  - Sombra aproximada de las nubes y dispersión atmosférica en el limbo.
 */
export const EARTH_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uDayMap;
    uniform sampler2D uNightMap;
    uniform sampler2D uSpecularMap;
    uniform sampler2D uNormalMap;
    uniform sampler2D uCloudMap;
    uniform vec3 uSunDirection;
    uniform vec3 uPole;
    uniform float uSunIntensity;
    uniform float uCloudOffset;
    uniform float uCloudShadow;
    uniform float uNormalStrength;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(uSunDirection);
        vec3 V = normalize(cameraPosition - vPositionW);

        // Base tangente local: este = polo × N, norte = N × este.
        vec3 east = normalize(cross(uPole, N) + vec3(1e-6, 0.0, 0.0));
        vec3 north = cross(N, east);
        vec3 normalSample = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
        vec3 Np = normalize(N + (east * normalSample.x + north * normalSample.y) * uNormalStrength);

        float NdotL = dot(N, L);
        float diffuse = max(dot(Np, L), 0.0);
        float daylight = smoothstep(-0.10, 0.12, NdotL);

        vec3 dayColor = texture2D(uDayMap, vUv).rgb;
        vec3 nightColor = texture2D(uNightMap, vUv).rgb;
        float ocean = texture2D(uSpecularMap, vUv).r;
        float cloud = texture2D(uCloudMap, vUv + vec2(uCloudOffset, 0.0)).r * uCloudShadow;

        // La luz solar se enrojece cerca del terminador (mayor masa de aire).
        vec3 sunColor = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), smoothstep(0.0, 0.35, NdotL));
        vec3 lit = dayColor * diffuse * sunColor * uSunIntensity * (1.0 - 0.5 * cloud);

        vec3 H = normalize(L + V);
        float specular = pow(max(dot(Np, H), 0.0), 48.0) * 0.6
                       + pow(max(dot(Np, H), 0.0), 6.0) * 0.04;
        specular *= ocean * (1.0 - cloud) * smoothstep(0.0, 0.08, NdotL);

        vec3 cityLights = nightColor * vec3(1.0, 0.82, 0.55) * 2.2 * (1.0 - daylight) * (1.0 - 0.75 * cloud);

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 haze = vec3(0.32, 0.58, 1.0) * fresnel * smoothstep(-0.25, 0.45, NdotL) * 0.75;

        vec3 color = lit + specular * sunColor * uSunIntensity + cityLights + haze + dayColor * 0.006;
        gl_FragColor = vec4(color, 1.0);
    }
`;

/** Nubes: opacidad desde la textura y sombreado por la dirección del Sol. */
export const CLOUDS_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D uCloudMap;
    uniform vec3 uSunDirection;
    uniform float uSunIntensity;

    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
        float density = texture2D(uCloudMap, vUv).r;
        vec3 N = normalize(vNormalW);
        float NdotL = dot(N, normalize(uSunDirection));
        vec3 sunColor = mix(vec3(1.0, 0.6, 0.42), vec3(1.0), smoothstep(0.0, 0.4, NdotL));
        vec3 color = vec3(0.96) * max(NdotL, 0.0) * sunColor * uSunIntensity + vec3(0.004);
        float alpha = density * mix(0.25, 0.95, smoothstep(-0.15, 0.2, NdotL));
        gl_FragColor = vec4(color, alpha);
    }
`;
