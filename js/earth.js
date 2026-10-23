/**
 * @file earth.js
 * Representación visual de la Tierra.
 *
 * La orientación (inclinación axial de ~23,44° y rotación diaria) la fija
 * SolarSystem a partir del tiempo sidéreo de Greenwich calculado por el motor
 * astronómico; esta clase solo se ocupa del aspecto: superficie día/noche,
 * nubes, océanos especulares y atmósfera iluminada por el Sol.
 */
import * as THREE from 'three';
import { CelestialBody, UNIT_SPHERE, LIGHTING } from './planets.js';
import { WORLD_VERTEX_SHADER } from './shaders/common.glsl.js';
import { EARTH_FRAGMENT_SHADER, CLOUDS_FRAGMENT_SHADER } from './shaders/earth.glsl.js';

/** Altura relativa de las nubes y velocidad de deriva respecto a la superficie. */
const CLOUD_LAYER_SCALE = 1.006;
const CLOUD_DRIFT_RADIANS_PER_DAY = 0.15;

export class Earth extends CelestialBody {
    /**
     * @param {object} definition BODY_DEFINITIONS.earth
     * @param {import('./textures.js').TextureLibrary} textures
     */
    constructor(definition, textures) {
        super(definition);
        this.sunDirectionWorld = new THREE.Vector3(1, 0, 0);
        this.poleWorld = new THREE.Vector3(0, 1, 0);

        this.surfaceMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uDayMap: { value: textures.get('earthDay') },
                uNightMap: { value: textures.get('earthNight') },
                uSpecularMap: { value: textures.get('earthSpecular') },
                uNormalMap: { value: textures.get('earthNormal') },
                uCloudMap: { value: textures.get('earthClouds') },
                uSunDirection: { value: this.sunDirectionWorld },
                uPole: { value: this.poleWorld },
                uSunIntensity: { value: LIGHTING.sunIntensity },
                uCloudOffset: { value: 0 },
                uCloudShadow: { value: 1 },
                uNormalStrength: { value: 0.6 }
            },
            vertexShader: WORLD_VERTEX_SHADER,
            fragmentShader: EARTH_FRAGMENT_SHADER
        });
        this.addSurface(new THREE.Mesh(UNIT_SPHERE, this.surfaceMaterial));

        this.clouds = new THREE.Mesh(UNIT_SPHERE, new THREE.ShaderMaterial({
            uniforms: {
                uCloudMap: { value: textures.get('earthClouds') },
                uSunDirection: { value: this.sunDirectionWorld },
                uSunIntensity: { value: LIGHTING.sunIntensity }
            },
            vertexShader: WORLD_VERTEX_SHADER,
            fragmentShader: CLOUDS_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false
        }));
        this.clouds.scale.setScalar(CLOUD_LAYER_SCALE);
        this.spin.add(this.clouds);

        this.addAtmosphere({ color: '#5aa2ff', twilight: '#ff7a3c', intensity: 1.35, scale: 1.035, power: 1.6 });
    }

    /** Muestra u oculta la capa de nubes (la sombra de nubes se desactiva con ella). */
    setCloudsVisible(visible) {
        this.clouds.visible = visible;
        this.surfaceMaterial.uniforms.uCloudShadow.value = visible ? 1 : 0;
    }

    /**
     * @param {object} context Contexto del fotograma: usa state.day para la
     *   deriva de las nubes respecto a la superficie.
     */
    update(context) {
        super.update();
        this.sunDirection(this.sunDirectionWorld);
        this.poleDirection(this.poleWorld);

        // Al girar la capa de nubes un ángulo a sobre el eje Y local, la
        // longitud de textura vista desde la superficie se desplaza −a/2π.
        const driftAngle = (context.state.day * CLOUD_DRIFT_RADIANS_PER_DAY) % (2 * Math.PI);
        this.clouds.rotation.y = driftAngle;
        this.surfaceMaterial.uniforms.uCloudOffset.value = -driftAngle / (2 * Math.PI);
    }
}
