/**
 * @file planets.js
 * Definición de los cuerpos del Sistema Solar y clases visuales genéricas.
 *
 * Los datos físicos (NASA Planetary Fact Sheet) son estáticos y descriptivos;
 * la posición, distancia, velocidad e inclinación instantáneas se calculan en
 * astronomy.js para la fecha simulada.
 */
import * as THREE from 'three';
import { WORLD_VERTEX_SHADER } from './shaders/common.glsl.js';
import { ATMOSPHERE_FRAGMENT_SHADER, RING_FRAGMENT_SHADER, RING_SHADOW_CHUNKS } from './shaders/bodies.glsl.js';

/**
 * Datos físicos por cuerpo.
 *  radiusKm: radio medio · massKg · rotationHours: periodo sidéreo (negativo = retrógrado)
 *  axialTiltDeg: oblicuidad de referencia · meanTemperatureC · orbitalPeriodDays: periodo sidéreo
 *  texture: clave del manifiesto · color: color de órbita y etiqueta
 */
export const BODY_DEFINITIONS = Object.freeze({
    sun: {
        id: 'sun', name: 'Sol', symbol: '☀', type: 'Estrella enana amarilla (G2V)',
        radiusKm: 695700, massKg: 1.989e30, rotationHours: 609.12, axialTiltDeg: 7.25,
        meanTemperatureC: 5505, temperatureLabel: 'Temperatura superficial',
        texture: 'sun', color: '#ffc861', shortcut: '0',
        description: 'Contiene el 99,86 % de la masa del Sistema Solar. Su energía proviene de la fusión de hidrógeno en helio en el núcleo, a unos 15 millones de °C.'
    },
    mercury: {
        id: 'mercury', name: 'Mercurio', symbol: '☿', type: 'Planeta rocoso',
        radiusKm: 2439.7, massKg: 3.301e23, rotationHours: 1407.6, axialTiltDeg: 0.03,
        meanTemperatureC: 167, orbitalPeriodDays: 87.969, moons: 0,
        texture: 'mercury', color: '#b9aea5', roughness: 0.95, shortcut: '1',
        description: 'El planeta más pequeño y cercano al Sol. Su órbita es la más excéntrica y su día solar dura dos de sus años.'
    },
    venus: {
        id: 'venus', name: 'Venus', symbol: '♀', type: 'Planeta rocoso',
        radiusKm: 6051.8, massKg: 4.867e24, rotationHours: -5832.5, axialTiltDeg: 177.36,
        meanTemperatureC: 464, orbitalPeriodDays: 224.701, moons: 0,
        texture: 'venus', color: '#e8c27a', roughness: 1, shortcut: '2',
        atmosphere: { color: '#ffe2a8', twilight: '#ff9a4a', intensity: 0.9, scale: 1.04, power: 1.6 },
        description: 'Cubierto por nubes de ácido sulfúrico y una atmósfera densa de CO₂ que produce un efecto invernadero extremo. Rota en sentido retrógrado.'
    },
    earth: {
        id: 'earth', name: 'Tierra', symbol: '🌎', type: 'Planeta rocoso',
        radiusKm: 6371.0, massKg: 5.972e24, rotationHours: 23.9345, axialTiltDeg: 23.44,
        meanTemperatureC: 15, orbitalPeriodDays: 365.256, moons: 1,
        color: '#5ea8ff', shortcut: '3',
        description: 'El único mundo conocido con vida. El 71 % de su superficie está cubierta por océanos y su atmósfera es rica en nitrógeno y oxígeno.'
    },
    moon: {
        id: 'moon', name: 'Luna', symbol: '☾', type: 'Satélite natural de la Tierra',
        radiusKm: 1737.4, massKg: 7.342e22, rotationHours: 655.72, axialTiltDeg: 6.68,
        meanTemperatureC: -20, orbitalPeriodDays: 27.3217,
        texture: 'moon', color: '#cfd6e0', shortcut: '9',
        description: 'Rota de forma sincrónica: siempre muestra la misma cara a la Tierra. Su gravedad provoca las mareas y estabiliza el eje terrestre.'
    },
    mars: {
        id: 'mars', name: 'Marte', symbol: '♂', type: 'Planeta rocoso',
        radiusKm: 3389.5, massKg: 6.417e23, rotationHours: 24.6229, axialTiltDeg: 25.19,
        meanTemperatureC: -65, orbitalPeriodDays: 686.980, moons: 2,
        texture: 'mars', color: '#ff7a4d', roughness: 0.95, shortcut: '4',
        atmosphere: { color: '#ffb48a', twilight: '#6aa0ff', intensity: 0.35, scale: 1.02, power: 2.5 },
        description: 'El planeta rojo debe su color al óxido de hierro. Alberga el Monte Olimpo, el mayor volcán conocido del Sistema Solar.'
    },
    jupiter: {
        id: 'jupiter', name: 'Júpiter', symbol: '♃', type: 'Gigante gaseoso',
        radiusKm: 69911, massKg: 1.898e27, rotationHours: 9.925, axialTiltDeg: 3.13,
        meanTemperatureC: -110, orbitalPeriodDays: 4332.59, moons: 97,
        texture: 'jupiter', color: '#e3b98f', roughness: 1, shortcut: '5',
        atmosphere: { color: '#f2dcc0', twilight: '#c08a5a', intensity: 0.35, scale: 1.02, power: 2.2 },
        description: 'El planeta más grande: su masa es 2,5 veces la de todos los demás juntos. La Gran Mancha Roja es una tormenta mayor que la Tierra.'
    },
    saturn: {
        id: 'saturn', name: 'Saturno', symbol: '♄', type: 'Gigante gaseoso',
        radiusKm: 58232, massKg: 5.683e26, rotationHours: 10.656, axialTiltDeg: 26.73,
        meanTemperatureC: -140, orbitalPeriodDays: 10759.22, moons: 274,
        texture: 'saturn', color: '#f0d9a0', roughness: 1, shortcut: '6',
        rings: { texture: 'saturnRing', innerKm: 74658, outerKm: 136775 },
        atmosphere: { color: '#f5e3b8', twilight: '#c9a06a', intensity: 0.3, scale: 1.02, power: 2.2 },
        description: 'Famoso por su sistema de anillos de hielo y roca, de apenas decenas de metros de espesor. Su densidad media es menor que la del agua.'
    },
    uranus: {
        id: 'uranus', name: 'Urano', symbol: '♅', type: 'Gigante helado',
        radiusKm: 25362, massKg: 8.681e25, rotationHours: -17.24, axialTiltDeg: 97.77,
        meanTemperatureC: -195, orbitalPeriodDays: 30688.5, moons: 29,
        texture: 'uranus', color: '#9fe3ea', roughness: 1, shortcut: '7',
        atmosphere: { color: '#b8f2ff', twilight: '#7fc6d8', intensity: 0.45, scale: 1.025, power: 2.0 },
        description: 'Gira prácticamente tumbado: su eje está inclinado casi 98°, por lo que sus polos pasan 42 años iluminados y 42 en oscuridad.'
    },
    neptune: {
        id: 'neptune', name: 'Neptuno', symbol: '♆', type: 'Gigante helado',
        radiusKm: 24622, massKg: 1.024e26, rotationHours: 16.11, axialTiltDeg: 28.32,
        meanTemperatureC: -200, orbitalPeriodDays: 60195, moons: 16,
        texture: 'neptune', color: '#5b7cff', roughness: 1, shortcut: '8',
        atmosphere: { color: '#8fb0ff', twilight: '#5a74d8', intensity: 0.45, scale: 1.025, power: 2.0 },
        description: 'El planeta más lejano. Tiene los vientos más rápidos registrados, superiores a 2.000 km/h. Fue descubierto por cálculo matemático en 1846.'
    }
});

/** Orden de presentación en la barra inferior. */
export const BODY_ORDER = Object.freeze(['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

/** Planetas en orden de distancia al Sol. */
export const PLANET_ORDER = Object.freeze(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

/** Geometría esférica unitaria compartida por todos los cuerpos. */
export const UNIT_SPHERE = new THREE.SphereGeometry(1, 128, 64);

/**
 * Luz solar en la escena. PointLight multiplica por π el término de Lambert
 * en los materiales PBR; los shaders propios usan directamente SUN_INTENSITY.
 */
export const LIGHTING = Object.freeze({ sunIntensity: 1.15, ambientIntensity: 0.035 });

/**
 * Capa atmosférica genérica (esfera por la cara posterior con mezcla aditiva).
 * @param {object} options { color, twilight, intensity, scale, power }
 */
export function createAtmosphereMesh({ color, twilight, intensity, scale, power }) {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
            uColor: { value: new THREE.Color(color) },
            uTwilightColor: { value: new THREE.Color(twilight) },
            uIntensity: { value: intensity },
            uLimb: { value: Math.sqrt(1 - 1 / (scale * scale)) },
            uPower: { value: power }
        },
        vertexShader: WORLD_VERTEX_SHADER,
        fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(UNIT_SPHERE, material);
    mesh.scale.setScalar(scale);
    return mesh;
}

/**
 * Cuerpo celeste visual.
 *  root: grupo posicionado en la escena (no rota).
 *  spin: grupo hijo orientado según el modelo de rotación IAU y escalado al
 *        radio visual; sus hijos usan unidades de "radios del cuerpo".
 */
export class CelestialBody {
    constructor(definition) {
        this.id = definition.id;
        this.definition = definition;
        this.root = new THREE.Group();
        this.root.name = definition.name;
        this.spin = new THREE.Group();
        this.root.add(this.spin);
        this.visualRadius = 1;
        this.pickTargets = [];
        this.atmosphere = null;
        this.axis = this.createAxis();
        this.spin.add(this.axis);
    }

    /** Eje de rotación (oculto por defecto): polo norte en color, sur en gris. */
    createAxis() {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -1.7, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.7, 0)
        ]);
        const color = new THREE.Color(this.definition.color);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, color.r, color.g, color.b], 3));
        const axis = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
        axis.visible = false;
        return axis;
    }

    /** Añade la superficie principal del cuerpo y la registra como seleccionable. */
    addSurface(mesh) {
        mesh.userData.bodyId = this.id;
        this.spin.add(mesh);
        this.pickTargets.push(mesh);
        return mesh;
    }

    /** Añade una atmósfera genérica si la definición la incluye. */
    addAtmosphere(options) {
        this.atmosphere = createAtmosphereMesh(options);
        this.spin.add(this.atmosphere);
    }

    setVisualRadius(radius) {
        this.visualRadius = radius;
        this.spin.scale.setScalar(radius);
    }

    setPosition(position) {
        this.root.position.copy(position);
    }

    setOrientation(matrix) {
        this.spin.quaternion.setFromRotationMatrix(matrix);
    }

    setAxisVisible(visible) {
        this.axis.visible = visible;
    }

    /** Dirección unitaria del cuerpo hacia el Sol (el Sol está en el origen). */
    sunDirection(target) {
        return target.copy(this.root.position).negate().normalize();
    }

    /**
     * Actualización visual por fotograma. Las subclases reciben un contexto
     * { sunPosition, camera, elapsedSeconds, state } y llaman a super.update().
     */
    update() {
        if (this.atmosphere) {
            this.sunDirection(this.atmosphere.material.uniforms.uSunDirection.value);
        }
    }

    /** Posición actual en la escena. */
    get position() {
        return this.root.position;
    }

    /** Radio exterior visible; las subclases con anillos lo amplían. */
    get outerVisualRadius() {
        return this.visualRadius;
    }

    /** Polo norte del cuerpo en coordenadas de escena. */
    poleDirection(target) {
        return target.set(0, 1, 0).applyQuaternion(this.spin.quaternion);
    }

    /** Distancia de la cámara a la superficie (para el plano de recorte). */
    distanceToSurface(camera) {
        return camera.position.distanceTo(this.root.position) - this.visualRadius;
    }
}

/**
 * Anillos planetarios con sombra mutua analítica:
 *  - El planeta proyecta sombra sobre los anillos (shader del anillo).
 *  - Los anillos proyectan sombra sobre el planeta (fragmento inyectado en el
 *    MeshStandardMaterial del planeta).
 */
class PlanetRings {
    constructor(body, ringDefinition, texture, planetMaterial) {
        this.body = body;
        this.innerRatio = ringDefinition.innerKm / body.definition.radiusKm;
        this.outerRatio = ringDefinition.outerKm / body.definition.radiusKm;
        this.texture = texture;
        this.mesh = this.createMesh();
        body.spin.add(this.mesh);
        this.shadowUniforms = this.patchPlanetMaterial(planetMaterial);
        this.normal = new THREE.Vector3();
    }

    /** Anillo plano en el ecuador con coordenada U radial (0 interior, 1 exterior). */
    createMesh() {
        const geometry = new THREE.RingGeometry(this.innerRatio, this.outerRatio, 256, 1);
        const position = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        for (let i = 0; i < position.count; i++) {
            const radius = Math.hypot(position.getX(i), position.getY(i));
            uv.setXY(i, (radius - this.innerRatio) / (this.outerRatio - this.innerRatio), 0.5);
        }
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uRingMap: { value: this.texture },
                uSunPosition: { value: new THREE.Vector3() },
                uPlanetPosition: { value: new THREE.Vector3() },
                uPlanetRadius: { value: 1 },
                uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
                uSunIntensity: { value: LIGHTING.sunIntensity }
            },
            vertexShader: WORLD_VERTEX_SHADER,
            fragmentShader: RING_FRAGMENT_SHADER,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    /** Inyecta la sombra de los anillos en el material estándar del planeta. */
    patchPlanetMaterial(material) {
        const uniforms = {
            uRingShadowMap: { value: this.texture },
            uRingShadowSun: { value: new THREE.Vector3() },
            uRingShadowCenter: { value: new THREE.Vector3() },
            uRingShadowNormal: { value: new THREE.Vector3(0, 1, 0) },
            uRingShadowInner: { value: 1 },
            uRingShadowOuter: { value: 2 }
        };
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\n${RING_SHADOW_CHUNKS.vertexDeclarations}`)
                .replace('#include <project_vertex>', `#include <project_vertex>\n${RING_SHADOW_CHUNKS.vertexBody}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${RING_SHADOW_CHUNKS.fragmentDeclarations}`)
                .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${RING_SHADOW_CHUNKS.fragmentBody}`);
        };
        return uniforms;
    }

    /** Sincroniza las uniformes con la posición, el tamaño y la orientación actuales. */
    update(sunPosition) {
        const body = this.body;
        body.poleDirection(this.normal);
        const ringUniforms = this.mesh.material.uniforms;
        ringUniforms.uSunPosition.value.copy(sunPosition);
        ringUniforms.uPlanetPosition.value.copy(body.position);
        ringUniforms.uPlanetRadius.value = body.visualRadius;
        ringUniforms.uRingNormal.value.copy(this.normal);

        const shadow = this.shadowUniforms;
        shadow.uRingShadowSun.value.copy(sunPosition);
        shadow.uRingShadowCenter.value.copy(body.position);
        shadow.uRingShadowNormal.value.copy(this.normal);
        shadow.uRingShadowInner.value = this.innerRatio * body.visualRadius;
        shadow.uRingShadowOuter.value = this.outerRatio * body.visualRadius;
    }
}

/** Planeta con material PBR texturizado, atmósfera y anillos opcionales. */
export class Planet extends CelestialBody {
    /**
     * @param {object} definition Entrada de BODY_DEFINITIONS.
     * @param {import('./textures.js').TextureLibrary} textures
     */
    constructor(definition, textures) {
        super(definition);
        const material = new THREE.MeshStandardMaterial({
            map: textures.get(definition.texture),
            roughness: definition.roughness ?? 0.9,
            metalness: 0
        });
        this.addSurface(new THREE.Mesh(UNIT_SPHERE, material));
        if (definition.atmosphere) this.addAtmosphere(definition.atmosphere);
        this.rings = definition.rings
            ? new PlanetRings(this, definition.rings, textures.get(definition.rings.texture), material)
            : null;
    }

    /** Radio exterior visible (incluye anillos), útil para encuadrar la cámara. */
    get outerVisualRadius() {
        return this.visualRadius * (this.rings ? this.rings.outerRatio : 1);
    }

    update(context) {
        super.update();
        this.rings?.update(context.sunPosition);
    }
}
