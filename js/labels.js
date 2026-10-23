/**
 * @file labels.js
 * Etiquetas HTML superpuestas al lienzo 3D.
 *
 * En cada fotograma se llama a beginFrame(), luego a place() para las
 * etiquetas visibles y por último a endFrame(), que oculta las que no se
 * colocaron. Los elementos DOM se crean una sola vez y se reutilizan.
 */
import * as THREE from 'three';

const projected = new THREE.Vector3();

/**
 * Proyecta un punto de mundo a píxeles del contenedor.
 * @returns {{x:number, y:number}|null} null si queda detrás de la cámara o fuera de la vista.
 */
export function projectToScreen(worldPosition, camera, width, height) {
    projected.copy(worldPosition).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) return null;
    return { x: (projected.x + 1) * 0.5 * width, y: (1 - projected.y) * 0.5 * height };
}

export class LabelLayer {
    /**
     * @param {HTMLElement} container Capa absoluta sobre el lienzo.
     * @param {(key:string) => void} onSelect Acción al pulsar una etiqueta interactiva.
     */
    constructor(container, onSelect) {
        this.container = container;
        this.onSelect = onSelect;
        this.labels = new Map();
        this.placed = new Set();
    }

    /**
     * Crea (una vez) y devuelve la etiqueta asociada a una clave.
     * @param {string} key Identificador único.
     * @param {string} text Texto visible.
     * @param {object} options { className, color, interactive }
     */
    ensure(key, text, { className = '', color = null, interactive = false } = {}) {
        let label = this.labels.get(key);
        if (!label) {
            const element = document.createElement(interactive ? 'button' : 'div');
            element.className = `scene-label ${className}`;
            if (interactive) {
                element.type = 'button';
                element.addEventListener('click', () => this.onSelect(key));
            }
            element.innerHTML = '<span class="scene-label__dot"></span><span class="scene-label__text"></span>';
            element.querySelector('.scene-label__text').textContent = text;
            if (color) element.style.setProperty('--label-color', color);
            element.hidden = true;
            this.container.appendChild(element);
            label = { element, visible: false, x: NaN, y: NaN, className: '' };
            this.labels.set(key, label);
        }
        return label;
    }

    /** Cambia el texto de una etiqueta existente (solo toca el DOM si cambia). */
    setText(key, text) {
        const label = this.labels.get(key);
        const element = label?.element.querySelector('.scene-label__text');
        if (element && element.textContent !== text) element.textContent = text;
    }

    beginFrame() {
        this.placed.clear();
    }

    /**
     * Coloca una etiqueta en coordenadas de pantalla.
     * @param {string} key Clave creada con ensure().
     * @param {{x:number,y:number}} point Posición en píxeles.
     * @param {string} [stateClass] Clase de estado adicional (p. ej. "is-selected").
     */
    place(key, point, stateClass = '') {
        const label = this.labels.get(key);
        if (!label || !point) return;
        this.placed.add(key);
        if (!label.visible) {
            label.element.hidden = false;
            label.visible = true;
        }
        if (!(Math.abs(point.x - label.x) <= 0.25 && Math.abs(point.y - label.y) <= 0.25)) {
            label.element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
            label.x = point.x;
            label.y = point.y;
        }
        if (label.className !== stateClass) {
            if (label.className) label.element.classList.remove(...label.className.split(' '));
            if (stateClass) label.element.classList.add(...stateClass.split(' '));
            label.className = stateClass;
        }
    }

    endFrame() {
        for (const [key, label] of this.labels) {
            if (label.visible && !this.placed.has(key)) {
                label.element.hidden = true;
                label.visible = false;
            }
        }
    }
}
