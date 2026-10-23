/**
 * @file textures.js
 * Carga de texturas locales y generación procedural de texturas auxiliares.
 *
 * Todas las rutas son relativas al proyecto (assets/textures/...). Para
 * sustituir una textura basta con reemplazar el archivo o editar su ruta en
 * TEXTURE_MANIFEST.
 */
import * as THREE from 'three';

/**
 * Manifiesto de texturas. `color: true` indica un mapa de color (sRGB);
 * los mapas de datos (normales, máscaras) se leen en espacio lineal.
 */
export const TEXTURE_MANIFEST = Object.freeze({
    sun: { url: 'assets/textures/sun/sun.jpg', color: true },
    mercury: { url: 'assets/textures/mercury/mercury.jpg', color: true },
    venus: { url: 'assets/textures/venus/venus_atmosphere.jpg', color: true },
    earthDay: { url: 'assets/textures/earth/earth_day.jpg', color: true },
    earthNight: { url: 'assets/textures/earth/earth_night.jpg', color: true },
    earthClouds: { url: 'assets/textures/earth/earth_clouds.jpg', color: false },
    earthNormal: { url: 'assets/textures/earth/earth_normal.jpg', color: false },
    earthSpecular: { url: 'assets/textures/earth/earth_specular.jpg', color: false },
    moon: { url: 'assets/textures/moon/moon.jpg', color: true },
    mars: { url: 'assets/textures/mars/mars.jpg', color: true },
    jupiter: { url: 'assets/textures/jupiter/jupiter.jpg', color: true },
    saturn: { url: 'assets/textures/saturn/saturn.jpg', color: true },
    saturnRing: { url: 'assets/textures/saturn/saturn_ring.png', color: true },
    uranus: { url: 'assets/textures/uranus/uranus.jpg', color: true },
    neptune: { url: 'assets/textures/neptune/neptune.jpg', color: true },
    milkyWay: { url: 'assets/textures/stars/milky_way.jpg', color: true }
});

export class TextureLibrary {
    /** @param {THREE.WebGLRenderer} renderer Para conocer la anisotropía máxima. */
    constructor(renderer) {
        this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        this.textures = new Map();
        this.loader = new THREE.TextureLoader();
    }

    /**
     * Carga todas las texturas del manifiesto.
     * @param {object} manifest Manifiesto {clave: {url, color}}.
     * @param {(progress:number) => void} onProgress Progreso entre 0 y 1.
     */
    async loadAll(manifest, onProgress) {
        const entries = Object.entries(manifest);
        let completed = 0;
        await Promise.all(entries.map(async ([key, entry]) => {
            this.textures.set(key, await this.loadOne(entry));
            completed++;
            onProgress(completed / entries.length);
        }));
    }

    /** Carga una textura; si falla, usa un color neutro para no detener la app. */
    async loadOne({ url, color }) {
        try {
            const texture = await this.loader.loadAsync(url);
            texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            texture.anisotropy = this.maxAnisotropy;
            return texture;
        } catch {
            console.warn(`Textura no disponible: ${url}. Se usa un color neutro.`);
            const fallback = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
            fallback.needsUpdate = true;
            return fallback;
        }
    }

    /** Devuelve una textura cargada por su clave del manifiesto. */
    get(key) {
        return this.textures.get(key);
    }
}

/**
 * Textura de resplandor radial generada en un canvas (sin archivos externos).
 * @param {Array<[number, string]>} stops Paradas del degradado [posición, color CSS].
 * @param {number} size Lado del canvas en píxeles.
 */
export function createRadialGlowTexture(stops, size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, colorStop] of stops) gradient.addColorStop(offset, colorStop);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** Resplandor blanco genérico (planetas en el cielo, marcadores). */
export const GLOW_STOPS_SOFT = Object.freeze([
    [0, 'rgba(255,255,255,1)'],
    [0.18, 'rgba(255,255,255,0.75)'],
    [0.45, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0)']
]);

/** Halo cálido del Sol. */
export const GLOW_STOPS_SUN = Object.freeze([
    [0, 'rgba(255,250,235,1)'],
    [0.08, 'rgba(255,236,190,0.9)'],
    [0.22, 'rgba(255,190,110,0.35)'],
    [0.5, 'rgba(255,140,60,0.08)'],
    [1, 'rgba(255,120,40,0)']
]);
