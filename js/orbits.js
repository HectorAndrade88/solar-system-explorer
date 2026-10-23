/**
 * @file orbits.js
 * Líneas orbitales calculadas con los mismos elementos keplerianos que las
 * posiciones, de modo que cada planeta recorre exactamente su trazo.
 * La órbita lunar es la trayectoria geocéntrica real muestreada durante un
 * mes sidéreo (la órbita de la Luna precesa rápidamente).
 */
import * as THREE from 'three';
import { sampleOrbit, sampleMoonOrbit } from './astronomy.js';
import { BODY_DEFINITIONS, PLANET_ORDER } from './planets.js';

const DEFAULT_OPACITY = 0.38;
const SELECTED_OPACITY = 0.95;

function createLine(color) {
    const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: DEFAULT_OPACITY,
        depthWrite: false
    });
    const line = new THREE.Line(new THREE.BufferGeometry(), material);
    line.frustumCulled = false;
    return line;
}

/** Reemplaza los vértices de una línea a partir de puntos ya convertidos. */
function setLinePoints(line, points) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

export class OrbitLines {
    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'Órbitas';
        this.lines = new Map(PLANET_ORDER.map((id) => [id, createLine(BODY_DEFINITIONS[id].color)]));
        this.moonLine = createLine(BODY_DEFINITIONS.moon.color);
        this.moonGroup = new THREE.Group();
        this.moonGroup.add(this.moonLine);
        this.group.add(...this.lines.values(), this.moonGroup);
        this.planetOrbitsT = NaN;
        this.moonOrbitT = NaN;
        this.highlighted = null;
    }

    /**
     * Regenera las elipses planetarias para el instante T (siglos julianos).
     * @param {number} T Siglos julianos TT.
     * @param {import('./scale.js').ScaleModel} scale Escala visual vigente.
     */
    rebuildPlanetOrbits(T, scale) {
        for (const [id, line] of this.lines) {
            setLinePoints(line, sampleOrbit(id, T, 512).map((p) => scale.heliocentricToScene(p)));
        }
        this.planetOrbitsT = T;
    }

    /**
     * Regenera la trayectoria lunar alrededor de la Tierra.
     * @param {Function} toSceneOffset Convierte un vector geocéntrico (UA) en desplazamiento de escena.
     */
    rebuildMoonOrbit(T, toSceneOffset) {
        setLinePoints(this.moonLine, sampleMoonOrbit(T, 240).map((p) => toSceneOffset(p)));
        this.moonOrbitT = T;
    }

    /** Desplaza la órbita lunar para que acompañe a la Tierra. */
    followEarth(earthPosition) {
        this.moonGroup.position.copy(earthPosition);
    }

    /** Resalta la órbita del cuerpo seleccionado. */
    highlight(id) {
        const previous = this.lineFor(this.highlighted);
        if (previous) previous.material.opacity = DEFAULT_OPACITY;
        const current = this.lineFor(id);
        if (current) current.material.opacity = SELECTED_OPACITY;
        this.highlighted = id;
    }

    lineFor(id) {
        return id === 'moon' ? this.moonLine : this.lines.get(id);
    }

    setVisible(visible) {
        this.group.visible = visible;
    }
}
