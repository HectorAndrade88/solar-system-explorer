/**
 * @file sun.js
 * El Sol: fuente principal de luz de la escena.
 *
 * Se compone de:
 *  - Fotosfera con shader animado (granulación y oscurecimiento del limbo).
 *  - Corona con serpentinas procedurales en un plano orientado a la cámara.
 *  - Halo (sprite con degradado generado en canvas).
 *  - PointLight sin atenuación que ilumina los materiales PBR de los planetas.
 * La emisión HDR alimenta el pase de bloom.
 */
import * as THREE from 'three';
import { CelestialBody, UNIT_SPHERE, LIGHTING } from './planets.js';
import { createRadialGlowTexture, GLOW_STOPS_SUN } from './textures.js';
import {
    PHOTOSPHERE_VERTEX_SHADER, PHOTOSPHERE_FRAGMENT_SHADER,
    CORONA_VERTEX_SHADER, CORONA_FRAGMENT_SHADER
} from './shaders/sun.glsl.js';

/** Extensión de la corona y del halo, en radios solares. */
const CORONA_EXTENT = 4;
const HALO_EXTENT = 7;
/** Distancias (en radios solares) entre las que el halo pasa de invisible a visible. */
const HALO_FADE_START = 10;
const HALO_FADE_END = 40;

export class Sun extends CelestialBody {
    /**
     * @param {object} definition BODY_DEFINITIONS.sun
     * @param {import('./textures.js').TextureLibrary} textures
     */
    constructor(definition, textures) {
        super(definition);
        this.photosphere = this.addSurface(new THREE.Mesh(UNIT_SPHERE, new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: textures.get(definition.texture) },
                uTime: { value: 0 },
                uIntensity: { value: 1.8 }
            },
            vertexShader: PHOTOSPHERE_VERTEX_SHADER,
            fragmentShader: PHOTOSPHERE_FRAGMENT_SHADER
        })));

        this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uExtent: { value: CORONA_EXTENT },
                uIntensity: { value: 0.9 },
                uColor: { value: new THREE.Color(1.0, 0.8, 0.55) }
            },
            vertexShader: CORONA_VERTEX_SHADER,
            fragmentShader: CORONA_FRAGMENT_SHADER,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        }));
        this.root.add(this.corona);

        this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: createRadialGlowTexture(GLOW_STOPS_SUN),
            color: new THREE.Color(0.55, 0.42, 0.3),
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        }));
        this.root.add(this.halo);

        this.light = new THREE.PointLight(0xfff5e6, LIGHTING.sunIntensity * Math.PI, 0, 0);
        this.root.add(this.light);
    }

    setVisualRadius(radius) {
        super.setVisualRadius(radius);
        this.corona.scale.setScalar(radius * CORONA_EXTENT);
        this.halo.scale.setScalar(radius * HALO_EXTENT);
    }

    /** @param {object} context Usa camera y elapsedSeconds (animación de la superficie). */
    update(context) {
        // El halo representa el deslumbramiento visto desde lejos; de cerca se desvanece.
        const distanceInRadii = context.camera.position.distanceTo(this.root.position) / this.visualRadius;
        this.halo.material.opacity = THREE.MathUtils.smoothstep(distanceInRadii, HALO_FADE_START, HALO_FADE_END);
        this.corona.quaternion.copy(context.camera.quaternion);
        this.photosphere.material.uniforms.uTime.value = context.elapsedSeconds;
        this.corona.material.uniforms.uTime.value = context.elapsedSeconds;
    }
}
