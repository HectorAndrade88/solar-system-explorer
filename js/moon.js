/**
 * @file moon.js
 * Representación visual de la Luna.
 *
 * Las fases no se dibujan con texturas: surgen de iluminar una esfera con la
 * dirección real del Sol. La rotación sincrónica procede del modelo IAU (con
 * el término principal de libración), de modo que la cara visible apunta a la
 * Tierra. Durante un eclipse lunar el disco se oscurece y enrojece según la
 * fracción en umbra/penumbra calculada por el motor astronómico.
 */
import * as THREE from 'three';
import { CelestialBody, UNIT_SPHERE, LIGHTING } from './planets.js';
import { WORLD_VERTEX_SHADER } from './shaders/common.glsl.js';
import { MOON_FRAGMENT_SHADER } from './shaders/bodies.glsl.js';

/**
 * Material lunar reutilizable (también lo usa la vista desde la Tierra).
 * @param {THREE.Texture} texture Mapa de albedo lunar.
 */
export function createMoonMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: texture },
            uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
            uSunIntensity: { value: LIGHTING.sunIntensity },
            uUmbra: { value: 0 },
            uPenumbra: { value: 0 },
            uEarthshine: { value: 0.012 }
        },
        vertexShader: WORLD_VERTEX_SHADER,
        fragmentShader: MOON_FRAGMENT_SHADER
    });
}

/** Copia el estado de eclipse de una instantánea a las uniformes del material. */
export function applyLunarEclipse(material, lunarEclipse) {
    material.uniforms.uUmbra.value = lunarEclipse.umbral;
    material.uniforms.uPenumbra.value = lunarEclipse.penumbral;
}

export class Moon extends CelestialBody {
    /**
     * @param {object} definition BODY_DEFINITIONS.moon
     * @param {import('./textures.js').TextureLibrary} textures
     */
    constructor(definition, textures) {
        super(definition);
        this.material = createMoonMaterial(textures.get(definition.texture));
        this.addSurface(new THREE.Mesh(UNIT_SPHERE, this.material));
    }

    /** @param {object} context Usa state.snapshot.lunarEclipse. */
    update(context) {
        super.update();
        this.sunDirection(this.material.uniforms.uSunDirection.value);
        applyLunarEclipse(this.material, context.state.snapshot.lunarEclipse);
    }
}
