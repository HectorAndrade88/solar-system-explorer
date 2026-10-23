# Solar System Explorer

Simulación astronómica 3D del Sistema Solar que se ejecuta íntegramente en el
navegador. Las posiciones del Sol, la Luna y los ocho planetas se **calculan
matemáticamente** para la fecha y hora del computador (`new Date()`) o para
cualquier fecha elegida por el usuario. No usa backend, ni APIs, ni CDN: todo
el código, las librerías, las texturas y los catálogos están dentro del proyecto
y funciona sin conexión a Internet.

---

## Índice

1. [Objetivo](#objetivo)
2. [Ejecución rápida](#ejecución-rápida)
3. [Funcionalidades](#funcionalidades)
4. [Tecnologías](#tecnologías)
5. [Estructura de carpetas](#estructura-de-carpetas)
6. [Arquitectura](#arquitectura)
7. [Fórmulas astronómicas](#fórmulas-astronómicas)
8. [Precisión esperada](#precisión-esperada)
9. [Limitaciones](#limitaciones)
10. [Configuración](#configuración)
11. [Cómo cambiar la velocidad temporal](#cómo-cambiar-la-velocidad-temporal)
12. [Cómo cambiar las texturas](#cómo-cambiar-las-texturas)
13. [Cómo agregar nuevos cuerpos celestes](#cómo-agregar-nuevos-cuerpos-celestes)
14. [Satélites Starlink y lanzamientos](#satélites-starlink-y-lanzamientos)
15. [Pruebas y verificación](#pruebas-y-verificación)
16. [Créditos y licencias](#créditos-y-licencias)

---

## Objetivo

Ofrecer una herramienta educativa, visualmente realista y astronómicamente
coherente para explorar el Sistema Solar en tiempo real:

- Ver dónde está cada planeta **ahora mismo** y cómo se mueve.
- Observar el día y la noche en la Tierra, las fases de la Luna y los eclipses.
- Viajar en el tiempo (hacia delante o hacia atrás) a gran velocidad.
- Mirar el cielo desde cualquier lugar de la Tierra con acimut y altitud de
  cada objeto.

---

## Ejecución rápida

### Opción 1 — Servidor local (recomendada)

Los navegadores no permiten cargar módulos JavaScript desde `file://`, así
que la versión modular se sirve con un servidor local mínimo. Desde la carpeta
del proyecto:

```bash
python -m http.server 8000
```

y abra en el navegador:

```text
http://localhost:8000
```

También puede usar los lanzadores incluidos, que inician el servidor y abren
el navegador:

- Windows: doble clic en `iniciar.bat`.
- Linux / macOS: `./iniciar.sh`.

Cualquier otro servidor estático sirve igual (por ejemplo, la extensión
*Live Server* de VS Code o `npx serve`). Python 3 viene preinstalado en
Linux y macOS, y se instala desde python.org en Windows.

### Opción 2 — Abrir directamente con doble clic (`file://`)

`dist/solar-system-explorer.html` es una versión autónoma de **un solo
archivo** (≈21 MB) que contiene todo el código, Three.js y las texturas
incrustadas. Se abre con doble clic, sin servidor y sin Internet.

Se genera a partir del proyecto modular con:

```bash
python tools/build_standalone.py
```

Vuelva a ejecutarlo si modifica el código o las texturas.

### Requisitos

- Navegador moderno con **WebGL 2**: Chrome/Edge 100+, Firefox 100+, Safari 16.4+.
- Ninguna instalación adicional para usar la aplicación.

---

## Funcionalidades

| Área | Detalle |
|---|---|
| **Tiempo** | Fecha y hora del sistema al abrir (`new Date()`), reloj local, zona horaria IANA, desfase UTC y hora UTC actualizados cada segundo. |
| **Control temporal** | Reproducir, pausar, tiempo real, retroceder (⇄), velocidades de 1× a 1.000.000× (deslizador, botones ◀ ▶ y teclas `+`/`−`). |
| **Fecha personalizada** | Fecha y hora manuales (años 1000–3000) con recálculo inmediato; botón «Usar fecha actual». |
| **Sistema Solar** | Sol, ocho planetas y la Luna en posiciones calculadas; órbitas trazadas con los mismos elementos que las posiciones. |
| **Tierra** | Texturas de día y noche (luces urbanas), océanos con reflejo especular, relieve, nubes con deriva, atmósfera iluminada, inclinación de 23,44° y rotación sidérea real. |
| **Día y noche** | Terminador calculado con la dirección real Tierra→Sol y el tiempo sidéreo; cambia en tiempo real. |
| **Luna** | Órbita real (teoría ELP truncada), fases por iluminación física, rotación sincrónica con libración, distancia, iluminación, edad lunar y eclipses lunares con tono rojizo. |
| **Sol** | Fotosfera animada con granulación y oscurecimiento del limbo, corona procedural, halo y bloom; es la fuente de luz de la escena. |
| **Planetas** | Texturas, tamaño, distancia, periodo orbital (Kepler), rotación IAU, inclinación axial, atmósferas y anillos de Saturno con sombras mutuas. |
| **Información** | Panel con distancias al Sol y a la Tierra, tiempo-luz, velocidad orbital (vis-viva), periodo, inclinación, excentricidad, anomalía verdadera, oblicuidad calculada, magnitud, radio, masa, temperatura y lunas. |
| **Cámara** | Rotación, zoom, desplazamiento, selección con clic, enfoque con doble clic, vuelo animado y seguimiento del objeto. Ratón, rueda, teclado y táctil. |
| **Vistas** | Sistema Solar, Tierra, Luna, Sol, recorrido por planetas, vista desde la Tierra y restablecer cámara. |
| **Vista desde la Tierra** | Cielo diurno, crepuscular y nocturno según la altura del Sol, ~5.000 estrellas reales, Vía Láctea, constelaciones, planetas por magnitud, Luna con su fase, suelo y puntos cardinales. Muestra acimut, altitud, distancia y magnitud. |
| **Escalas** | Escala orbital, tamaño de planetas, tamaño del Sol, distancia Tierra–Luna y modo de distancias lineal o comprimido. |
| **Satélites Starlink** | 10.676 satélites en tiempo real con el modelo SGP4, iluminados o en la sombra de la Tierra, visibles también desde la superficie. Al hacer clic en uno se muestran su órbita, altitud, posición y velocidad. |
| **Historial de lanzamientos** | 426 misiones Starlink (2019–2026) con fecha y hora, plataforma, resultado y satélites lanzados, en órbita o reingresados. Incluye gráfico por año, búsqueda y filtros. |
| **Simulación de lanzamientos** | Recorrido modelado del cohete (ascenso, inserción, órbita de transferencia y despliegue) con reloj de misión, y órbitas reales actuales de los satélites de cada misión. |

### Controles

| Acción | Ratón / táctil | Teclado |
|---|---|---|
| Girar cámara | Arrastrar / un dedo | Flechas o `W` `A` `S` `D` |
| Zoom | Rueda / pellizcar | `Q` / `E` (o `RePág` / `AvPág`) |
| Desplazar | Clic derecho, `Mayús`+arrastrar / dos dedos | `Mayús` + flechas |
| Seleccionar / enfocar | Clic / doble clic, o clic en la etiqueta | `0` Sol, `1`–`8` planetas, `9` Luna, `F` centrar |
| Tiempo | Panel izquierdo | `Espacio` pausa, `+`/`−` velocidad, `T` tiempo real |
| Capas | Panel «Visualización» | `O` órbitas, `L` etiquetas, `C` constelaciones, `X` ejes |
| Satélites | Panel «Satélites Starlink», clic en un satélite | `K` constelación, `U` historial de lanzamientos |
| Vistas | Barra superior | `V` vista desde la Tierra, `R` restablecer, `Esc` salir |
| Interfaz | — | `H` ocultar HUD, `?` ayuda |

---

## Tecnologías

- **HTML5, CSS3 y JavaScript ES2022** con módulos nativos (`import`/`export`) y clases.
- **Three.js r186** (WebGL 2) incluido en `vendor/three/`, resuelto con un
  *import map* local. Se usan además `EffectComposer`, `RenderPass`,
  `UnrealBloomPass` y `OutputPass` para el bloom y el mapeo tonal.
- **Shaders GLSL propios** para la Tierra, nubes, atmósferas, Sol, corona,
  Luna, anillos, estrellas y cielo.
- **Python 3** (solo biblioteca estándar) para el servidor local opcional y
  para generar la versión de un solo archivo.
- **Node.js** (opcional) solo para ejecutar las pruebas del motor astronómico.

No hay referencias a CDN, `fetch` a servidores externos, APIs ni servicios web.

---

## Estructura de carpetas

```text
solar-system-explorer/
├── index.html                 Página principal (HUD + import map local)
├── README.md
├── THIRD_PARTY_NOTICES.md     Licencias de recursos de terceros
├── package.json               Scripts opcionales (pruebas, versión autónoma)
├── iniciar.bat / iniciar.sh   Lanzadores del servidor local
│
├── assets/
│   ├── icon.svg
│   ├── models/                Reservado para modelos 3D locales (no se usan)
│   └── textures/
│       ├── sun/ mercury/ venus/ earth/ moon/
│       ├── mars/ jupiter/ saturn/ uranus/ neptune/
│       └── stars/             Vía Láctea (coordenadas galácticas)
│
├── css/
│   └── styles.css             Tema oscuro del HUD, responsive
│
├── js/
│   ├── main.js                Inicialización, acciones y ciclo principal
│   ├── config.js              CONFIG y constantes de escala, tiempo y rendimiento
│   ├── astronomy.js           Motor astronómico puro (sin Three.js)
│   ├── ephemeris-service.js   Cálculo limitado + interpolación de efemérides
│   ├── clock.js               Reloj de simulación
│   ├── planets.js             Datos de los cuerpos, CelestialBody, Planet, anillos
│   ├── earth.js               Tierra (día/noche, nubes, océanos, atmósfera)
│   ├── moon.js                Luna (fases, libración, eclipses)
│   ├── sun.js                 Sol (fotosfera, corona, halo, luz)
│   ├── solar-system.js        Estado astronómico → posiciones de escena
│   ├── scale.js               Conversión de coordenadas y escalas visuales
│   ├── orbits.js              Trazado de órbitas
│   ├── scene.js               Renderizador, cámaras, bloom y selección
│   ├── starfield.js           Estrellas, Vía Láctea y constelaciones
│   ├── sky-view.js            Vista desde la superficie terrestre
│   ├── controls.js            Cámara orbital y mirada libre
│   ├── labels.js              Etiquetas HTML sobre la escena
│   ├── ui.js                  Interfaz (paneles, reloj, atajos)
│   ├── format.js              Formato numérico y de fechas en español
│   ├── textures.js            Manifiesto y carga de texturas
│   ├── satellites.js          Catálogo Starlink y propagación SGP4 (sin Three.js)
│   ├── launch-trajectory.js   Modelo de ascenso, inserción y despliegue
│   ├── satellite-layer.js     Constelación, órbitas y cohete en la escena
│   ├── launch-history.js      Diálogo del historial de lanzamientos
│   ├── info-rows.js           Contenido del panel de información
│   ├── boot-check.js          Aviso si el navegador no puede cargar módulos
│   ├── shaders/               GLSL (común, Sol, Tierra, cuerpos, cielo)
│   └── data/                  Estrellas, constelaciones, TLE e historial Starlink
│
├── vendor/
│   ├── three/                 Three.js y módulos de posprocesado (MIT)
│   └── satellite.js/          Propagador SGP4/SDP4 (MIT, sin WebAssembly)
│
├── tools/
│   ├── build_standalone.py    Genera dist/solar-system-explorer.html
│   └── update_satellite_data.py  Actualiza TLE e historial (requiere Internet)
├── tests/
│   ├── astronomy.test.mjs     Pruebas del motor astronómico
│   └── satellites.test.mjs    Pruebas de SGP4, catálogo y trayectorias
└── dist/
    └── solar-system-explorer.html   Versión autónoma (file://)
```

---

## Arquitectura

El programa separa en capas el cálculo, la actualización de posiciones, el
renderizado y la interfaz:

```text
 SimulationClock ──► EphemerisService ──► SolarSystem / SkyView ──► SceneManager
 (instante y        (astronomy.js:         (posiciones, rotación,     (WebGL, bloom,
  velocidad)         ~10 cálculos/s +       órbitas, materiales)       render)
                     interpolación)
        ▲                                                                  │
        └──────────────── UIManager (reloj, paneles a 4 Hz, atajos) ◄──────┘
```

1. **`clock.js`**: mantiene el instante simulado. En «tiempo real» lee
   `Date.now()` directamente; en los demás modos integra el tiempo real por la
   escala temporal.
2. **`astronomy.js`**: funciones puras que, dada una fecha, devuelven
   posiciones heliocéntricas y geocéntricas, rotaciones, fases, eclipses y
   magnitudes. No conoce Three.js ni el DOM.
3. **`ephemeris-service.js`**: el cálculo completo **no** se ejecuta en cada
   fotograma. Mantiene dos instantáneas que encierran el instante actual
   (separadas lo necesario para unos 10 cálculos por segundo real, con un
   máximo de 0,1 días simulados) e interpola linealmente las posiciones.
4. **`solar-system.js`** y **`sky-view.js`**: traducen ese estado a la escena,
   aplicando las escalas visuales. La rotación usa
   `W(t) = W₀ + Ẇ·(t − t₀)` entre instantáneas para que sea fluida.
5. **`scene.js`**: renderizador WebGL. Dibuja el fondo estelar en un pase
   aparte con una cámara sin traslación, para que las estrellas queden a
   distancia infinita, y luego el Sistema Solar, el bloom y el mapeo tonal ACES.
6. **`ui.js`**: el reloj solo toca el DOM al cambiar el segundo y los paneles
   se actualizan 4 veces por segundo.
7. **`main.js`**: ensambla todo y ejecuta el ciclo con `requestAnimationFrame`.

### Sistema de coordenadas

- Marco astronómico: **eclíptica y equinoccio J2000** (X hacia el punto vernal,
  Z hacia el polo norte de la eclíptica).
- Escena Three.js (Y hacia arriba): `escena = (x, z, −y)`, una rotación propia
  que conserva la quiralidad.
- Orientación de cada cuerpo: base (meridiano 0°, polo, −este), que coincide
  con la convención de las texturas equirrectangulares (longitud 0° en el
  centro de la imagen).

---

## Fórmulas astronómicas

Todas están implementadas y comentadas en `js/astronomy.js`.

### Escalas de tiempo

- **Fecha juliana**: `JD = ms_Unix / 86 400 000 + 2 440 587,5`.
- **ΔT = TT − UT**: polinomios de Espenak y Meeus (≈ 69 s en 2026).
  `JD_TT = JD_UT + ΔT/86 400`.
- **Siglos julianos**: `T = (JD_TT − 2 451 545,0) / 36 525`.
- **Tiempo sidéreo de Greenwich** (IAU 1982):
  `θ₀ = 280,46061837° + 360,98564736629°·(JD − 2451545) + 0,000387933°·T² − T³/38 710 000`.

### Planetas: elementos keplerianos (JPL, E. M. Standish)

Para cada planeta (la Tierra como baricentro Tierra-Luna) se usan seis
elementos con variación lineal `x(T) = x₀ + ẋ·T`: semieje mayor `a`,
excentricidad `e`, inclinación `i`, longitud media `L`, longitud del perihelio
`ϖ` y longitud del nodo `Ω`. Después:

1. `ω = ϖ − Ω`, `M = L − ϖ`.
2. **Ecuación de Kepler** `M = E − e·sin E`, resuelta por Newton-Raphson.
3. Plano orbital: `x′ = a(cos E − e)`, `y′ = a√(1−e²)·sin E`.
4. Rotación `Rz(Ω)·Rx(i)·Rz(ω)` a la eclíptica J2000.
5. **Anomalía verdadera**: `tan(ν/2) = √((1+e)/(1−e))·tan(E/2)`.
6. **Velocidad orbital** (vis-viva): `v² = GM☉·(2/r − 1/a)`.
7. **Periodo** (tercera ley de Kepler): `P = 365,256 d · a^(3/2)`.
8. Posición de la Tierra: `Tierra = baricentro − Luna/(1 + 81,30056)`.

### Luna (Meeus, cap. 47: ELP-2000/82 truncada)

- Argumentos fundamentales `L′, D, M, M′, F` (polinomios en `T`).
- 60 términos periódicos en longitud y distancia y 60 en latitud, con el factor
  `E = 1 − 0,002516·T − 0,0000074·T²` en los términos que contienen `M`.
- Perturbaciones aditivas de Venus (`A1`), Júpiter (`A2`) y del achatamiento
  terrestre (`A3`).
- `λ = L′ + Σl·10⁻⁶`, `β = Σb·10⁻⁶`, `Δ = 385 000,56 km + Σr·10⁻³`.
- Paso de la eclíptica de la fecha a J2000 restando la precesión general en
  longitud (`5029,0966″` por siglo).

### Sol aparente

- Vector Tierra→Sol = −(posición heliocéntrica de la Tierra).
- Precesión a la fecha y **aberración anual** `−20,4898″/R`.
- Paso a ecuatoriales con la oblicuidad media
  `ε = 23,439291° − 0,013004°·T − …`.

### Fases y eclipses lunares (Meeus, caps. 48 y 54)

- Elongación `ψ` entre Sol y Luna; **ángulo de fase**
  `tan i = R·sin ψ / (Δ − R·cos ψ)`; **fracción iluminada** `k = (1 + cos i)/2`.
- **Edad lunar**: diferencia de longitudes Luna − Sol × 29,53 d / 360°.
- **Sombra terrestre**: `umbra = 1,02·(π☾ + π☉ − s☉)`,
  `penumbra = 1,02·(π☾ + π☉ + s☉)`. La fracción del disco lunar inmersa
  controla el oscurecimiento y el tono rojizo.

### Rotación de los cuerpos (IAU WGCCRE 2015)

- Polo `(α₀, δ₀)` y meridiano principal `W = W₀ + Ẇ·d`. Venus y Urano tienen
  `Ẇ < 0` (retrógrados).
- Base del cuerpo: nodo `Q` en `α₀ + 90°`, meridiano = `Q·cos W + (P×Q)·sin W`.
- La Tierra usa el tiempo sidéreo: `W = GMST − 90°`.
- La Luna incluye el término principal de libración (argumento `E1`), de modo
  que su cara visible apunta a la Tierra con la libración real (~±5°).
- **Oblicuidad calculada**: ángulo entre el polo y la normal orbital (180° −
  ángulo en los rotadores retrógrados).

### Posición aparente desde la Tierra

1. Vector geocéntrico (planeta − Tierra, o el vector lunar).
2. Eclíptica → ecuatorial: rotación de la oblicuidad sobre X.
3. **Paralaje topocéntrico**: se resta la posición del observador sobre el
   elipsoide terrestre (`u = atan(b/a·tan φ)`).
4. Base horizontal con tiempo sidéreo local `TSL = GMST + λ`:
   `este = −cos δ·sin H`, `norte = sin δ·cos φ − cos δ·cos H·sin φ`,
   `cénit = sin δ·sin φ + cos δ·cos H·cos φ`.
   **Acimut** `= atan2(este, norte)` y **altitud** `= asin(cénit)`.

### Magnitudes aparentes (Meeus, cap. 41)

`m = H + 5·log₁₀(r·Δ) + f(i)` con los coeficientes de cada planeta; Saturno
incluye la inclinación de sus anillos vista desde la Tierra.

---

## Precisión esperada

| Magnitud | Precisión aproximada (1800–2050) |
|---|---|
| Longitud del Sol | ≈ 0,01° |
| Planetas interiores y Marte | ≈ 1′ (minutos de arco) |
| Júpiter y Saturno | hasta ≈ 10′ |
| Urano y Neptuno | ≈ 1′ |
| Luna (longitud / latitud) | ≈ 10″ / 4″ ; distancia ± 10 km aprox. |
| Fases y eclipses lunares | instante de luna llena/nueva con error de pocos minutos |
| Tiempo sidéreo | < 1,1 s (sin nutación) |
| Acimut / altitud (vista terrestre) | ≈ 0,3° (sin precesión de estrellas ni refracción) |
| Magnitudes | ± 0,1–0,3 mag |

Es más que suficiente para una visualización educativa, aunque no alcanza la
precisión de un observatorio (que usaría efemérides numéricas como DE440).
Fuera de 1800–2050 la interfaz muestra un aviso: los elementos lineales del JPL
se degradan lentamente (errores de grados en algunos siglos).

---

## Limitaciones

- **Escalas**: los tamaños y la distancia Tierra–Luna están exagerados para que
  todo sea visible. Las direcciones se conservan; las distancias radiales no
  (salvo el modo lineal para las órbitas planetarias).
- **Sombras**: se calculan analíticamente para los anillos de Saturno (y sobre
  ellos) y para los eclipses lunares. No se proyecta la sombra de la Luna sobre
  la Tierra en los eclipses solares (con escalas exageradas no sería
  representativa).
- **Vista terrestre**: no aplica refracción atmosférica (≈0,5° en el horizonte),
  nutación ni la precesión de las estrellas desde J2000. La ubicación se
  introduce a mano (no se usa geolocalización, que podría depender de
  servicios externos).
- **Cuerpos**: no se incluyen satélites de otros planetas, planetas enanos,
  asteroides ni cometas, aunque la arquitectura lo permite (ver más abajo).
- **Texturas**: resolución 2K–4K por tamaño de descarga.
- **`file://`**: la versión modular necesita servidor local; para doble clic use
  `dist/solar-system-explorer.html`.
- **Rendimiento**: requiere WebGL 2 y una GPU integrada moderna. En equipos
  modestos puede desactivar el bloom en «Visualización».

---

## Configuración

`js/config.js` concentra los parámetros:

```javascript
export const CONFIG = {
    planetScale: 200,       // exageración del radio de planetas y Luna
    sunScale: 30,           // exageración del radio del Sol
    orbitScale: 1,          // multiplicador de distancias orbitales (1 UA = 100 unidades)
    moonScale: 40,          // exageración de la distancia Tierra–Luna
    timeScale: 1,           // velocidad inicial (1 = tiempo real)
    distanceMode: 'linear', // 'linear' | 'compressed' (r^0,5)
    showOrbits: true,
    showLabels: true,
    showMilkyWay: true,
    showConstellations: false,
    showAxes: false,
    bloom: true,
    magnifySkyBodies: true  // Sol y Luna ×4 en la vista desde la Tierra
};
```

- Las escalas también se cambian en vivo desde el panel **Escala visual**
  (deslizadores logarítmicos; los límites están en `SCALE_LIMITS`).
- `PERFORMANCE` regula la frecuencia de cálculo de efemérides, el refresco de
  paneles, la frecuencia de recálculo de órbitas y la resolución máxima.
- `OBSERVER_PRESETS` asigna una ciudad por zona horaria para la vista desde la
  Tierra. Si su zona no está, se estima la longitud a partir del desfase UTC.
- `LIGHTING` (en `planets.js`) controla la intensidad del Sol y la luz ambiente.

---

## Cómo cambiar la velocidad temporal

- **En la interfaz**: deslizador «Velocidad», botones ◀ ▶, `+`/`−` del
  teclado, ⇄ para invertir el sentido, ⏸ para pausar y «↺ Tiempo real» (o `T`)
  para volver al reloj del sistema.
- **Velocidades disponibles**: edite `TIME_SCALE_STEPS` en `js/config.js`:

  ```javascript
  export const TIME_SCALE_STEPS = Object.freeze([1, 10, 100, 1000, 10000, 100000, 1000000]);
  ```

- **Velocidad inicial**: `CONFIG.timeScale` (debe ser uno de esos valores).

A velocidades altas, `EphemerisService` aumenta la frecuencia de cálculo para
que la interpolación siga siendo exacta: nunca hay más de 0,1 días simulados
entre dos cálculos completos.

---

## Cómo cambiar las texturas

1. Sustituya el archivo en `assets/textures/<cuerpo>/`, o añada uno nuevo y
   cambie su ruta en `TEXTURE_MANIFEST` (`js/textures.js`).
2. Requisitos: proyección **equirrectangular** (2:1), longitud 0° en el centro
   horizontal y norte arriba. Los anillos usan una tira horizontal RGBA (el eje
   X recorre del borde interior al exterior).
3. Marque `color: true` para mapas de color (sRGB) y `color: false` para mapas
   de datos (normales, máscara especular, nubes).
4. Si cambia el código o las texturas, regenere la versión autónoma con
   `python tools/build_standalone.py`.

Las texturas ausentes no detienen la aplicación: se sustituyen por un color
neutro y se registra un aviso en la consola.

---

## Cómo agregar nuevos cuerpos celestes

Ejemplo: un planeta enano en órbita heliocéntrica.

1. **Elementos orbitales** (`js/astronomy.js`, `PLANET_ELEMENTS`): añada una
   entrada con `a, e, i, L, peri, node`, cada uno como `[valor J2000, tasa por
   siglo]`. `PLANET_IDS` se deriva automáticamente.
2. **Rotación** (`ROTATION_MODELS` en el mismo archivo): polo `ra`, `dec` y
   meridiano `w0`, `rate` (IAU WGCCRE).
3. **Magnitud** (opcional, `apparentMagnitude`): añada un `case` con su
   magnitud absoluta.
4. **Datos físicos y visuales** (`js/planets.js`, `BODY_DEFINITIONS`): nombre,
   símbolo, radio, masa, periodo de rotación, temperatura, textura, color,
   atajo y descripción. Añada el identificador a `BODY_ORDER` y a
   `PLANET_ORDER`.
5. **Textura** (`js/textures.js`, `TEXTURE_MANIFEST`) y archivo en
   `assets/textures/<cuerpo>/`.

Con eso el cuerpo aparece en la escena, en la barra inferior, en las órbitas,
en el panel de información y en la vista desde la Tierra. Un satélite de otro
planeta requiere además un cálculo planetocéntrico análogo a
`moonGeocentric()` y un desplazamiento en `SolarSystem.updatePositions()`.

---

## Satélites Starlink y lanzamientos

### Qué se muestra

- **Constelación en tiempo real.** Cada satélite se propaga con **SGP4/SDP4**,
  el modelo para el que se publican los elementos orbitales (TLE). Su
  implementación es la de satellite.js, verificada con el caso oficial de
  Vallado et al. (2006). SGP4 da la posición en el marco TEME. La Tierra gira
  con el mismo tiempo sidéreo, así que cada satélite pasa sobre el punto
  geográfico correcto (error < 0,2° comprobado en la escena).
- **Iluminación.** Un satélite está en sombra si queda dentro del cilindro de
  sombra terrestre: `r·ŝ < 0` y `|r − (r·ŝ)ŝ| < R⊕`. En la vista desde la
  Tierra solo se ven los iluminados con el cielo oscuro. Su brillo se estima
  como `m ≈ 4,5 + 5·log10(d / 550 km)`.
- **Satélite seleccionado.** Se muestra su órbita completa (una revolución
  SGP4), altitud, latitud y longitud del punto subsatelital, velocidad,
  iluminación, misión y, desde la superficie, acimut, altura y distancia.
- **Historial.** Para cada misión se indica fecha y hora, plataforma, cohete,
  resultado, satélites lanzados, en órbita y reingresados, inclinación y
  altitud. Al elegir una misión se resaltan sus satélites y se dibujan sus
  órbitas actuales.
- **Simulación del lanzamiento.** El reloj se lleva al despegue (a 10×) y la
  cámara sigue al cohete desde arriba, con la Tierra debajo. Las trayectorias
  reales de ascenso no son públicas, así que se modelan:
  1. Rumbo por círculo máximo con el acimut que produce la inclinación objetivo:
     `sin Az = cos i / cos φ`, corregido por la rotación terrestre.
  2. Perfil de altitud y alcance calibrado con valores típicos de Falcon 9:
     MECO ≈ T+2:27 a ~65 km y SECO ≈ T+8:35 a 280 km y ~1.750 km de distancia.
  3. Órbita de transferencia circular desde SECO, con la velocidad inercial
     (relativa + ω×r).
  4. Despliegue a T+1:02 (T+20 min en Starship).

  La inclinación resultante del modelo queda a ~1° de la real.

### Rendimiento

SGP4 para los 10.676 satélites tarda ~5 ms. Por eso solo se ejecuta cuando el
tiempo simulado se aleja más de 120 s del último cálculo
(`PERFORMANCE.satelliteRefreshSeconds`). Entre dos cálculos, la GPU avanza cada
satélite sobre su órbita (`r(Δt) = |r₀|·(cos θ·r̂ + sin θ·t̂)`), lo que es casi
exacto para órbitas tan circulares. Con la constelación visible, la CPU emplea
unos 5 ms por fotograma.

### Precisión y antigüedad de los datos

Los TLE pierden precisión con el tiempo. La sección «Satélites Starlink»
indica la antigüedad respecto a la fecha simulada:

| Antigüedad | Precisión típica |
|---|---|
| < 3 días | ~1 km |
| 3–30 días | decenas de km (resistencia atmosférica, maniobras) |
| > 30 días o fechas pasadas lejanas | solo ilustrativa |

Limitaciones:
- Los satélites ya reingresados no tienen elementos orbitales, así que no
  aparecen al retroceder en el tiempo.
- Los lanzamientos más recientes pueden no tener aún TLE públicos. Se pueden
  simular, pero no ver en vivo.

### Actualizar los datos (opcional, con Internet)

```bash
python tools/update_satellite_data.py
```

Descarga los TLE y el catálogo SATCAT de CelesTrak y el historial de misiones de
Launch Library 2 (≈ 5 consultas). Después regenera `js/data/starlink-tle.js` y
`js/data/starlink-launches.js`. La aplicación nunca se conecta a Internet: solo
lee esos archivos. Después de actualizar, regenere la versión autónoma con
`python tools/build_standalone.py`.

---

## Pruebas y verificación

```bash
node tests/astronomy.test.mjs
node tests/satellites.test.mjs
```

Las 18 comprobaciones astronómicas contrastan el motor con:

- Ejemplos publicados de Meeus: posición de la Luna (47.a) con error < 0,00001°
  y tiempo sidéreo (12.a).
- Equinoccio y solsticio de 2026, oposiciones de Marte, Júpiter y Saturno, y
  máxima elongación de Venus.
- Luna llena y nueva de octubre de 2026 y los eclipses lunares total y parcial
  de 2026.
- Oblicuidades de la Tierra y Urano, y altura del Sol al mediodía en Bogotá.

Las 15 comprobaciones de satélites verifican:

- El caso oficial de SGP4 (satélite 00005 de Vallado et al., 2006) al metro.
- La carga y asociación de los 10.676 satélites con su lanzamiento.
- Altitudes y velocidades de órbita baja y la ausencia de posición antes del
  lanzamiento.
- Acimuts de lanzamiento, e inclinación y altitud de inserción del modelo de
  trayectoria.

Verificaciones realizadas sobre la aplicación en el navegador:

| # | Verificación | Resultado |
|---|---|---|
| 1 | Carga correctamente | Sí, sin errores ni avisos en la consola |
| 2–4 | Sin APIs externas, sin CDN, imports locales | Todas las peticiones de red son locales |
| 5 | Fecha actual automática | `new Date()` al iniciar; modo «Tiempo real» |
| 6 | La posición cambia con la fecha | Comprobado con fechas personalizadas y a 100.000× |
| 7 | La Tierra rota | Punto subsolar calculado coincide con el esperado (±0,2°) |
| 8 | La Luna orbita la Tierra | Trayectoria real y cara visible hacia la Tierra |
| 9 | El Sol ilumina los cuerpos | Luz puntual y shaders con la dirección real del Sol |
| 10–11 | Cambio de fecha y aceleración | Formulario de fecha y velocidades hasta 1.000.000× |
| 12–13 | Cámara y selección | Ratón, rueda, teclado, táctil, clic y etiquetas |
| 14 | Sin Internet | Ningún recurso remoto; versión de un archivo para `file://` |
| 15 | Consola limpia | Sin errores |

---

## Créditos y licencias

- **Three.js** r186: MIT, © three.js authors (`vendor/three/LICENSE`).
- **Texturas**: [Solar System Scope](https://www.solarsystemscope.com/textures/),
  basadas en datos de NASA, licencia **CC BY 4.0**.
- **Catálogo estelar y constelaciones**: [d3-celestial](https://github.com/ofrohn/d3-celestial)
  de Olaf Frohn (BSD-3-Clause), derivado del catálogo Hipparcos.
- **SGP4**: [satellite.js](https://github.com/shashwatak/satellite-js) 7.1.0 (MIT).
- **Elementos orbitales y SATCAT**: [CelesTrak](https://celestrak.org).
- **Historial de misiones**: [Launch Library 2](https://thespacedevs.com/llapi), The Space Devs.
- **Algoritmos**: J. Meeus, *Astronomical Algorithms*; E. M. Standish (JPL),
  *Keplerian Elements for Approximate Positions of the Major Planets*;
  IAU WGCCRE 2015; Espenak y Meeus (ΔT).

Detalle en `THIRD_PARTY_NOTICES.md`. Los enlaces solo documentan el origen:
la aplicación no se conecta a ellos.
