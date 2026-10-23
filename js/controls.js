/**
 * @file controls.js
 * Controles de cámara.
 *
 *  - OrbitCameraController: órbita alrededor de un objetivo que puede moverse
 *    (sigue al cuerpo enfocado), zoom exponencial, desplazamiento lateral,
 *    transiciones animadas ("vuelo") y amortiguación suave.
 *  - SkyLookController: mirada libre desde la superficie terrestre (acimut,
 *    altitud y campo de visión).
 *
 * Entradas soportadas: ratón (arrastrar, botón derecho o Mayús para desplazar),
 * rueda, teclado (flechas/WASD, Q/E, Mayús+flechas) y táctil (un dedo gira,
 * dos dedos pellizcan para zoom y desplazan).
 */
import * as THREE from 'three';

const CLICK_TOLERANCE_PX = 6;
const CLICK_MAX_MS = 450;
/** Constante de amortiguación (1/s): fracción aplicada por fotograma = 1 − e^(−k·dt). */
const SMOOTHING = 12;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Ignora atajos cuando el foco está en un campo editable. */
function isEditableTarget(target) {
    return target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * Base común: rastrea punteros, detecta clics, gestos de dos dedos, rueda y
 * teclas mantenidas. Las subclases implementan onDrag, onPinch, onWheel y update.
 */
class PointerController {
    /**
     * @param {HTMLElement} element Elemento que recibe los eventos (el lienzo).
     * @param {object} callbacks { onSelect(x, y), onDoubleClick(x, y) }
     */
    constructor(element, callbacks = {}) {
        this.element = element;
        this.callbacks = callbacks;
        this.enabled = true;
        this.pointers = new Map();
        this.pressedKeys = new Set();
        this.gesture = null;

        element.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        element.addEventListener('pointermove', (event) => this.handlePointerMove(event));
        element.addEventListener('pointerup', (event) => this.handlePointerUp(event));
        element.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
        element.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
        element.addEventListener('dblclick', (event) => {
            if (this.enabled) this.callbacks.onDoubleClick?.(event.clientX, event.clientY);
        });
        element.addEventListener('contextmenu', (event) => event.preventDefault());
        window.addEventListener('keydown', (event) => {
            if (!isEditableTarget(event.target) && !event.ctrlKey && !event.metaKey) this.pressedKeys.add(event.code);
        });
        window.addEventListener('keyup', (event) => this.pressedKeys.delete(event.code));
        window.addEventListener('blur', () => this.pressedKeys.clear());
    }

    handlePointerDown(event) {
        if (!this.enabled) return;
        // La captura mantiene el arrastre aunque el puntero salga del lienzo; si el
        // navegador la rechaza (puntero ya liberado), el gesto continúa igualmente.
        try {
            this.element.setPointerCapture(event.pointerId);
        } catch {
            /* sin captura: el gesto sigue funcionando dentro del lienzo */
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.gesture = {
            startX: event.clientX,
            startY: event.clientY,
            startTime: performance.now(),
            moved: this.pointers.size > 1,
            pan: event.button === 2 || event.button === 1 || event.shiftKey || event.ctrlKey,
            pinchDistance: this.pinchDistance()
        };
    }

    handlePointerMove(event) {
        const previous = this.pointers.get(event.pointerId);
        if (!this.enabled || !previous || !this.gesture) return;

        if (this.pointers.size >= 2) {
            const midBefore = this.pointerMidpoint();
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const midAfter = this.pointerMidpoint();
            const distance = this.pinchDistance();
            if (this.gesture.pinchDistance > 0) this.onPinch(distance / this.gesture.pinchDistance);
            this.gesture.pinchDistance = distance;
            this.onDrag((midAfter.x - midBefore.x) / this.pointers.size, (midAfter.y - midBefore.y) / this.pointers.size, true);
            this.gesture.moved = true;
            return;
        }

        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (Math.hypot(event.clientX - this.gesture.startX, event.clientY - this.gesture.startY) > CLICK_TOLERANCE_PX) {
            this.gesture.moved = true;
        }
        this.onDrag(dx, dy, this.gesture.pan);
    }

    handlePointerUp(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        const gesture = this.gesture;
        if (this.pointers.size > 0) {
            if (gesture) gesture.pinchDistance = this.pinchDistance();
            return;
        }
        this.gesture = null;
        const isClick = gesture && !gesture.moved && performance.now() - gesture.startTime < CLICK_MAX_MS;
        if (this.enabled && isClick && event.type === 'pointerup') this.callbacks.onSelect?.(event.clientX, event.clientY);
    }

    handleWheel(event) {
        if (!this.enabled) return;
        event.preventDefault();
        const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
        this.onWheel(event.deltaY * scale);
    }

    pinchDistance() {
        if (this.pointers.size < 2) return 0;
        const [a, b] = [...this.pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    pointerMidpoint() {
        let x = 0;
        let y = 0;
        for (const point of this.pointers.values()) {
            x += point.x;
            y += point.y;
        }
        return { x, y };
    }

    /** Valor −1/0/+1 a partir de dos grupos de teclas mantenidas. */
    keyAxis(negativeKeys, positiveKeys) {
        const pressed = (keys) => keys.some((key) => this.pressedKeys.has(key));
        return (pressed(positiveKeys) ? 1 : 0) - (pressed(negativeKeys) ? 1 : 0);
    }

    get shiftPressed() {
        return this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight');
    }
}

/** Cámara orbital que sigue a un objetivo móvil. */
export class OrbitCameraController extends PointerController {
    /**
     * @param {THREE.PerspectiveCamera} camera
     * @param {HTMLElement} element
     * @param {object} callbacks { onSelect, onDoubleClick }
     */
    constructor(camera, element, callbacks) {
        super(element, callbacks);
        this.camera = camera;
        this.spherical = new THREE.Spherical(300, 1.0, 0.6);
        this.target = new THREE.Vector3();
        this.followOffset = new THREE.Vector3();
        const origin = new THREE.Vector3();
        this.getFollowPosition = () => origin;
        this.minDistance = 0.01;
        this.maxDistance = 60000;
        this.pending = { theta: 0, phi: 0, zoom: 0, panX: 0, panY: 0 };
        this.transition = null;
        this.right = new THREE.Vector3();
        this.up = new THREE.Vector3();
        /**
         * Marco de referencia opcional del desplazamiento de la cámara. Para seguir
         * un objeto en órbita baja se usa su vertical local como eje «arriba»
         * (cámara de persecución): así la Tierra queda siempre debajo.
         */
        this.getFrame = null;
        this.frame = new THREE.Quaternion();
        this.maxPhi = Math.PI - 0.02;
        this.offset = new THREE.Vector3();
        this.frameUp = new THREE.Vector3();
    }

    onDrag(dx, dy, pan) {
        if (pan) {
            this.pending.panX += dx;
            this.pending.panY += dy;
        } else {
            const angle = (2 * Math.PI) / this.element.clientHeight;
            this.pending.theta -= dx * angle;
            this.pending.phi -= dy * angle;
        }
    }

    onPinch(ratio) {
        this.pending.zoom -= Math.log(ratio);
    }

    onWheel(deltaY) {
        this.pending.zoom += deltaY * 0.0012;
    }

    /**
     * Vuela hasta un objetivo y queda siguiéndolo.
     * @param {() => THREE.Vector3} getPosition Posición actual del objetivo (se evalúa cada fotograma).
     * @param {object} options { distance, minDistance, theta, phi, duration (s),
     *   getFrame: () => THREE.Quaternion (marco del desplazamiento), maxPhi }
     */
    focusOn(getPosition, { distance, minDistance = 0.01, theta, phi, duration = 1.6, getFrame = null, maxPhi = Math.PI - 0.02 }) {
        this.minDistance = minDistance;
        // Expresa la posición actual de la cámara en el nuevo marco para que el vuelo no dé saltos.
        const frame = getFrame ? getFrame() : new THREE.Quaternion();
        this.offset.copy(this.camera.position).sub(this.target).applyQuaternion(frame.clone().invert());
        if (this.offset.lengthSq() > 0) this.spherical.setFromVector3(this.offset);
        this.getFrame = getFrame;
        this.maxPhi = maxPhi;
        theta ??= this.spherical.theta;
        phi ??= this.spherical.phi;
        let deltaTheta = (theta - this.spherical.theta) % (2 * Math.PI);
        if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
        if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;
        this.transition = {
            elapsed: 0,
            duration,
            getPosition,
            fromTarget: this.target.clone(),
            fromRadius: this.spherical.radius,
            toRadius: THREE.MathUtils.clamp(distance, minDistance, this.maxDistance),
            fromTheta: this.spherical.theta,
            deltaTheta,
            fromPhi: this.spherical.phi,
            toPhi: THREE.MathUtils.clamp(phi, 0.02, maxPhi),
            fromUp: this.camera.up.clone(),
            eased: 0
        };
        Object.keys(this.pending).forEach((key) => { this.pending[key] = 0; });
    }

    /** Avanza la cámara un fotograma. @param {number} dt Segundos reales. */
    update(dt) {
        if (this.enabled) this.applyKeyboard(dt);
        if (this.transition) this.updateTransition(dt);
        else this.applyPendingMotion(dt);

        if (this.getFrame) this.frame.copy(this.getFrame());
        else this.frame.identity();
        this.target.copy(this.getFollowPosition()).add(this.followOffset);
        this.offset.setFromSpherical(this.spherical).applyQuaternion(this.frame);
        this.camera.position.copy(this.target).add(this.offset);
        this.frameUp.set(0, 1, 0).applyQuaternion(this.frame);
        if (this.transition) this.frameUp.lerp(this.transition.fromUp, 1 - this.transition.eased).normalize();
        this.camera.up.copy(this.frameUp);
        this.camera.lookAt(this.target);
    }

    applyKeyboard(dt) {
        const horizontal = this.keyAxis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']);
        const vertical = this.keyAxis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']);
        const zoom = this.keyAxis(['KeyQ', 'PageUp'], ['KeyE', 'PageDown']);
        if (this.shiftPressed) {
            this.pending.panX -= horizontal * 500 * dt;
            this.pending.panY += vertical * 500 * dt;
        } else {
            this.pending.theta += horizontal * 1.6 * dt;
            this.pending.phi -= vertical * 1.2 * dt;
        }
        this.pending.zoom += zoom * 1.8 * dt;
    }

    updateTransition(dt) {
        const transition = this.transition;
        transition.elapsed += dt;
        const t = Math.min(1, transition.elapsed / transition.duration);
        const eased = easeInOutCubic(t);
        transition.eased = eased;
        const destination = transition.getPosition();
        this.followOffset.lerpVectors(transition.fromTarget, destination, eased).sub(destination);
        this.getFollowPosition = transition.getPosition;
        this.spherical.radius = Math.exp(THREE.MathUtils.lerp(Math.log(transition.fromRadius), Math.log(transition.toRadius), eased));
        this.spherical.theta = transition.fromTheta + transition.deltaTheta * eased;
        this.spherical.phi = THREE.MathUtils.lerp(transition.fromPhi, transition.toPhi, eased);
        if (t >= 1) {
            this.followOffset.set(0, 0, 0);
            this.transition = null;
        }
    }

    /** Aplica de forma amortiguada los movimientos acumulados por el usuario. */
    applyPendingMotion(dt) {
        const fraction = 1 - Math.exp(-SMOOTHING * dt);
        const take = (key) => {
            const step = this.pending[key] * fraction;
            this.pending[key] -= step;
            return step;
        };
        this.spherical.theta += take('theta');
        this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi + take('phi'), 0.02, this.maxPhi);
        this.spherical.radius = THREE.MathUtils.clamp(
            this.spherical.radius * Math.exp(take('zoom')), this.minDistance, this.maxDistance
        );

        const panX = take('panX');
        const panY = take('panY');
        if (panX !== 0 || panY !== 0) {
            const worldPerPixel = (2 * this.spherical.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
                / this.element.clientHeight;
            this.right.setFromMatrixColumn(this.camera.matrix, 0);
            this.up.setFromMatrixColumn(this.camera.matrix, 1);
            this.followOffset.addScaledVector(this.right, -panX * worldPerPixel).addScaledVector(this.up, panY * worldPerPixel);
        }
    }

    get distance() {
        return this.spherical.radius;
    }
}

/** Mirada libre desde un punto fijo (vista desde la superficie terrestre). */
export class SkyLookController extends PointerController {
    /**
     * @param {THREE.PerspectiveCamera} camera Cámara situada en el observador.
     * @param {HTMLElement} element
     * @param {object} callbacks { onSelect, onDoubleClick }
     */
    constructor(camera, element, callbacks) {
        super(element, callbacks);
        this.camera = camera;
        this.azimuth = 180;
        this.altitude = 25;
        this.fov = 70;
        this.pending = { azimuth: 0, altitude: 0, zoom: 0 };
        this.transition = null;
        this.enabled = false;
    }

    /** Grados por píxel con el campo de visión actual. */
    get degreesPerPixel() {
        return this.fov / this.element.clientHeight;
    }

    onDrag(dx, dy) {
        this.pending.azimuth -= dx * this.degreesPerPixel;
        this.pending.altitude += dy * this.degreesPerPixel;
    }

    onPinch(ratio) {
        this.pending.zoom -= Math.log(ratio);
    }

    onWheel(deltaY) {
        this.pending.zoom += deltaY * 0.0012;
    }

    /** Gira suavemente la mirada hacia unas coordenadas horizontales. */
    lookAt(azimuth, altitude, duration = 1.2) {
        this.transition = {
            elapsed: 0,
            duration,
            fromAzimuth: this.azimuth,
            deltaAzimuth: ((azimuth - this.azimuth) % 360 + 540) % 360 - 180,
            fromAltitude: this.altitude,
            toAltitude: THREE.MathUtils.clamp(altitude, -89, 89)
        };
        this.pending.azimuth = 0;
        this.pending.altitude = 0;
    }

    update(dt) {
        const fraction = 1 - Math.exp(-SMOOTHING * dt);
        if (this.enabled) {
            const speed = this.fov * 0.9 * dt;
            this.pending.azimuth += this.keyAxis(['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD']) * speed;
            this.pending.altitude += this.keyAxis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']) * speed;
            this.pending.zoom += this.keyAxis(['KeyQ', 'PageUp'], ['KeyE', 'PageDown']) * 1.5 * dt;
        }

        if (this.transition) {
            const transition = this.transition;
            transition.elapsed += dt;
            const t = Math.min(1, transition.elapsed / transition.duration);
            const eased = easeInOutCubic(t);
            this.azimuth = transition.fromAzimuth + transition.deltaAzimuth * eased;
            this.altitude = THREE.MathUtils.lerp(transition.fromAltitude, transition.toAltitude, eased);
            if (t >= 1) this.transition = null;
        } else {
            this.azimuth += this.pending.azimuth * fraction;
            this.altitude = THREE.MathUtils.clamp(this.altitude + this.pending.altitude * fraction, -89, 89);
            this.pending.azimuth *= 1 - fraction;
            this.pending.altitude *= 1 - fraction;
        }
        this.azimuth = ((this.azimuth % 360) + 360) % 360;

        const zoomStep = this.pending.zoom * fraction;
        this.pending.zoom -= zoomStep;
        const fov = THREE.MathUtils.clamp(this.fov * Math.exp(zoomStep), 2, 100);
        if (fov !== this.camera.fov) {
            this.fov = fov;
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }

        // Marco local: −Z norte, +X este, +Y cénit. Orden YXZ: primero altitud, luego acimut.
        this.camera.rotation.set(THREE.MathUtils.degToRad(this.altitude), -THREE.MathUtils.degToRad(this.azimuth), 0, 'YXZ');
    }
}
