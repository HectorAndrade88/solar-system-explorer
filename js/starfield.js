/**
 * @file starfield.js
 * Esfera celeste: estrellas del catálogo local, Vía Láctea y constelaciones.
 *
 * Todo se construye en coordenadas ecuatoriales J2000 sobre una esfera de
 * radio fijo. Quien la usa solo debe asignar la matriz de orientación:
 *  - Vista del Sistema Solar: ecuatorial → escena (constante); la esfera se
 *    dibuja en un pase de fondo con una cámara sin traslación, por lo que las
 *    estrellas quedan a distancia visualmente infinita.
 *  - Vista desde la Tierra: ecuatorial → horizontal local (cambia con el
 *    tiempo sidéreo y la latitud).
 */
import * as THREE from 'three';
import { STAR_DATA, STAR_STRIDE, NAMED_STARS } from './data/stars.js';
import { CONSTELLATIONS } from './data/constellations.js';
import { vectorFromSpherical, EQUATORIAL_TO_GALACTIC } from './astronomy.js';
import { STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER } from './shaders/sky.glsl.js';

/**
 * Color aproximado de una estrella a partir de su índice B−V.
 * 1) Temperatura (Ballesteros, 2012): T = 4600·(1/(0.92·BV + 1.7) + 1/(0.92·BV + 0.62))
 * 2) Color de cuerpo negro aproximado (ajuste de T. Helland), suavizado hacia
 *    el blanco porque el ojo percibe los colores estelares muy desaturados.
 */
export function starColorFromBV(bv, target = new THREE.Color()) {
    const temperature = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
    const k = temperature / 100;
    let r, g, b;
    if (k <= 66) {
        r = 255;
        g = 99.4708025861 * Math.log(k) - 161.1195681661;
        b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
    } else {
        r = 329.698727446 * (k - 60) ** -0.1332047592;
        g = 288.1221695283 * (k - 60) ** -0.0755148492;
        b = 255;
    }
    const channel = (value) => Math.min(255, Math.max(0, value)) / 255;
    const desaturate = (value) => 0.6 * channel(value) + 0.4;
    return target.setRGB(desaturate(r), desaturate(g), desaturate(b), THREE.SRGBColorSpace);
}

/** Vector de escena (THREE) a partir de AR/Dec en grados sobre una esfera. */
function equatorialPoint(raDeg, decDeg, radius) {
    const v = vectorFromSpherical(raDeg, decDeg, radius);
    return new THREE.Vector3(v.x, v.y, v.z);
}

export class CelestialSphere {
    /**
     * @param {object} options
     * @param {import('./textures.js').TextureLibrary} options.textures
     * @param {number} options.radius Radio de la esfera.
     * @param {number} [options.magnitudeLimit] Magnitud límite visible.
     * @param {number} [options.milkyWayIntensity] Brillo de la Vía Láctea.
     * @param {number} [options.starSize] Factor de tamaño de las estrellas.
     */
    constructor({ textures, radius, magnitudeLimit = 6.5, milkyWayIntensity = 1.4, starSize = 1 }) {
        this.radius = radius;
        this.starSize = starSize;
        this.milkyWayIntensity = milkyWayIntensity;
        this.group = new THREE.Group();
        this.group.matrixAutoUpdate = false;

        this.milkyWay = this.createMilkyWay(textures.get('milkyWay'));
        this.stars = this.createStars(magnitudeLimit);
        this.constellationLines = this.createConstellationLines();
        this.group.add(this.milkyWay, this.stars, this.constellationLines);

        this.constellationLabels = CONSTELLATIONS.map((constellation) => ({
            key: `constellation-${constellation.id}`,
            name: constellation.name,
            position: equatorialPoint(constellation.center[0], constellation.center[1], radius)
        }));
        this.starLabels = NAMED_STARS.filter((star) => star.mag < 1.6).map((star) => ({
            key: `star-${star.name}`,
            name: star.name,
            position: equatorialPoint(star.ra, star.dec, radius)
        }));
    }

    /**
     * Vía Láctea: la textura está en coordenadas galácticas (l = 0 en el
     * centro, l creciente hacia la izquierda, b = −90° en la fila superior).
     * Para la esfera de Three.js eso equivale a ejes locales
     *   x = galáctico X,  y = −galáctico Z,  z = galáctico Y,
     * y se pasa a ecuatoriales con la transpuesta de la matriz galáctica.
     */
    createMilkyWay(texture) {
        const [gx, gy, gz] = EQUATORIAL_TO_GALACTIC.map((row) => new THREE.Vector3(...row));
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        material.color.setScalar(this.milkyWayIntensity);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.02, 96, 48), material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.makeBasis(gx, gz.clone().negate(), gy);
        mesh.renderOrder = 1;
        return mesh;
    }

    /** Estrellas como puntos con tamaño y color según magnitud e índice B−V. */
    createStars(magnitudeLimit) {
        const count = STAR_DATA.length / STAR_STRIDE;
        const positions = new Float32Array(count * 3);
        const magnitudes = new Float32Array(count);
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const [ra, dec, magnitude, bv] = STAR_DATA.slice(i * STAR_STRIDE, (i + 1) * STAR_STRIDE);
            const v = vectorFromSpherical(ra, dec, this.radius);
            positions.set([v.x, v.y, v.z], i * 3);
            magnitudes[i] = magnitude;
            starColorFromBV(bv, color).toArray(colors, i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aMagnitude', new THREE.BufferAttribute(magnitudes, 1));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uPixelRatio: { value: 1 },
                uBrightness: { value: 1 },
                uMagnitudeLimit: { value: magnitudeLimit },
                uSizeScale: { value: this.starSize }
            },
            vertexShader: STAR_VERTEX_SHADER,
            fragmentShader: STAR_FRAGMENT_SHADER,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = 2;
        return points;
    }

    /** Figuras de las 88 constelaciones como segmentos de línea. */
    createConstellationLines() {
        const vertices = [];
        const radius = this.radius * 0.999;
        for (const constellation of CONSTELLATIONS) {
            for (const polyline of constellation.lines) {
                for (let k = 0; k + 3 < polyline.length; k += 2) {
                    const a = vectorFromSpherical(polyline[k], polyline[k + 1], radius);
                    const b = vectorFromSpherical(polyline[k + 2], polyline[k + 3], radius);
                    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(0.25, 0.48, 0.85),
            transparent: true,
            opacity: 0.45,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.frustumCulled = false;
        lines.renderOrder = 3;
        lines.visible = false;
        return lines;
    }

    /** Orienta la esfera (matriz ecuatorial → marco del observador). */
    setFrame(matrix) {
        this.group.matrix.copy(matrix);
        this.group.matrixWorldNeedsUpdate = true;
    }

    /** Atenúa estrellas y Vía Láctea (por ejemplo, de día en la vista terrestre). */
    setBrightness(starBrightness, milkyWayBrightness = starBrightness) {
        this.stars.material.uniforms.uBrightness.value = starBrightness;
        this.milkyWay.material.color.setScalar(this.milkyWayIntensity * milkyWayBrightness);
        this.constellationLines.material.opacity = 0.45 * starBrightness;
    }

    setPixelRatio(pixelRatio) {
        this.stars.material.uniforms.uPixelRatio.value = pixelRatio;
    }

    setMilkyWayVisible(visible) {
        this.milkyWay.visible = visible;
    }

    setConstellationsVisible(visible) {
        this.constellationLines.visible = visible;
    }

    /** Posición en el marco del consumidor de un punto local de la esfera. */
    toWorld(localPosition, target) {
        return target.copy(localPosition).applyMatrix4(this.group.matrix);
    }
}
