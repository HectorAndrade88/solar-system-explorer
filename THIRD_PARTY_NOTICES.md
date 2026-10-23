# Avisos de terceros

Todos los recursos de terceros están incluidos localmente en el proyecto.

| Recurso | Ubicación | Autor / origen | Licencia |
|---|---|---|---|
| Three.js r186 (núcleo y módulos de posprocesado) | `vendor/three/` | three.js authors | MIT (`vendor/three/LICENSE`) |
| Texturas de planetas, Sol, Luna y Vía Láctea | `assets/textures/` | [Solar System Scope](https://www.solarsystemscope.com/textures/), basadas en datos de NASA | CC BY 4.0 |
| Catálogo estelar, figuras y nombres de constelaciones | `js/data/` | [d3-celestial](https://github.com/ofrohn/d3-celestial) de Olaf Frohn, derivado de Hipparcos | BSD-3-Clause (`js/data/LICENSE-d3-celestial.txt`) |
| satellite.js 7.1.0 (subconjunto SGP4/SDP4, sin WebAssembly) | `vendor/satellite.js/` | Shashwat Kandadai y colaboradores | MIT (`vendor/satellite.js/LICENSE.md`) |
| Elementos orbitales (TLE) y catálogo SATCAT de Starlink | `js/data/starlink-tle.js`, `js/data/starlink-launches.js` | [CelesTrak](https://celestrak.org), T. S. Kelso (datos de la Fuerza Espacial de EE. UU.) | Datos públicos; se cita la fuente según su política de uso |
| Historial de misiones (nombre, hora, plataforma, resultado) | `js/data/starlink-launches.js` | [Launch Library 2](https://thespacedevs.com/llapi), The Space Devs | Uso gratuito con atribución |

Las texturas se redimensionaron y convirtieron de formato (TIFF a JPEG,
8K a 4K) para reducir el tamaño de descarga. Las URL anteriores solo
documentan el origen: la aplicación no se conecta a ellas.
