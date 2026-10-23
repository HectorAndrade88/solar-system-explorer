#!/usr/bin/env python3
"""
Genera dist/solar-system-explorer.html: una versión autónoma de un solo
archivo que funciona abriéndola directamente (file://), sin servidor.

Los navegadores bloquean desde file:// la carga de módulos ES y el uso de
imágenes locales en WebGL. Esta herramienta evita ambas restricciones:
  1. Cada módulo JavaScript (propio y de Three.js) se incrusta como URL
     data:text/javascript;base64 dentro de un import map.
  2. Las importaciones relativas ('./x.js') y 'three' se reescriben a
     especificadores únicos '@sse/<ruta>' resueltos por ese import map.
  3. Las texturas del manifiesto se incrustan como URL data:image/...;base64.
  4. CSS, script de arranque y favicon se incrustan en el HTML.

Uso (solo biblioteca estándar de Python 3.8+):
    python tools/build_standalone.py

El proyecto original no se modifica; vuelva a ejecutar el script tras
cambiar el código o las texturas.
"""
import base64
import json
import posixpath
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist" / "solar-system-explorer.html"
PREFIX = "@sse/"
ENTRY_MODULE = "js/main.js"
MODULE_DIRECTORIES = ["js", "vendor/three", "vendor/satellite.js"]
# Script clásico (no módulo): se incrusta aparte en el HTML.
CLASSIC_SCRIPTS = {"js/boot-check.js"}
MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml"}

# from './a.js' · from "../b.js" · from 'three' · from 'three/addons/c.js'
IMPORT_PATTERN = re.compile(r"""(\bfrom\s*|\bimport\s*)(['"])((?:\.{1,2}/|three)[^'"]*)\2""")
TEXTURE_PATTERN = re.compile(r"""(['"])(assets/textures/[^'"]+)\1""")


def data_url(mime: str, payload: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def resolve_specifier(specifier: str, module_path: str) -> str:
    """Convierte un especificador (relativo o 'three') en una clave '@sse/<ruta>'."""
    if specifier == "three":
        return PREFIX + "vendor/three/three.module.js"
    if specifier.startswith("three/addons/"):
        return PREFIX + "vendor/three/addons/" + specifier[len("three/addons/"):]
    base_directory = posixpath.dirname(module_path)
    return PREFIX + posixpath.normpath(posixpath.join(base_directory, specifier))


def embed_textures(source: str) -> str:
    """Sustituye las rutas de textura por su contenido en base64."""
    def replace(match: re.Match) -> str:
        path = ROOT / match.group(2)
        mime = MIME_TYPES[path.suffix.lower()]
        return f"{match.group(1)}{data_url(mime, path.read_bytes())}{match.group(1)}"
    return TEXTURE_PATTERN.sub(replace, source)


def build_import_map() -> dict:
    imports = {}
    for directory in MODULE_DIRECTORIES:
        for file in sorted((ROOT / directory).rglob("*.js")):
            module_path = file.relative_to(ROOT).as_posix()
            if module_path in CLASSIC_SCRIPTS:
                continue
            source = file.read_text(encoding="utf-8")
            source = IMPORT_PATTERN.sub(
                lambda m: f"{m.group(1)}{m.group(2)}{resolve_specifier(m.group(3), module_path)}{m.group(2)}", source
            )
            if module_path == "js/textures.js":
                source = embed_textures(source)
            imports[PREFIX + module_path] = data_url("text/javascript", source.encode("utf-8"))
    return imports


def build_html(imports: dict) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    boot_check = (ROOT / "js" / "boot-check.js").read_text(encoding="utf-8")
    icon = data_url("image/svg+xml", (ROOT / "assets" / "icon.svg").read_bytes())
    import_map = json.dumps({"imports": imports}, separators=(",", ":"))

    replacements = [
        (re.compile(r'<link rel="icon"[^>]*>'), f'<link rel="icon" href="{icon}" type="image/svg+xml">'),
        (re.compile(r'<link rel="stylesheet" href="css/styles.css">'), f"<style>\n{styles}\n</style>"),
        (re.compile(r'<script type="importmap">.*?</script>', re.S), f'<script type="importmap">{import_map}</script>'),
        (re.compile(r'<script src="js/boot-check.js"></script>'), f"<script>\n{boot_check}\n</script>"),
        (re.compile(r'<script type="module" src="js/main.js"></script>'),
         f'<script type="module">import "{PREFIX}{ENTRY_MODULE}";</script>'),
    ]
    for pattern, replacement in replacements:
        html, count = pattern.subn(lambda _m, r=replacement: r, html)
        if count != 1:
            raise RuntimeError(f"No se encontró el bloque esperado en index.html: {pattern.pattern}")
    return html


def main() -> None:
    imports = build_import_map()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build_html(imports), encoding="utf-8")
    size_mb = OUTPUT.stat().st_size / 1_048_576
    print(f"Generado {OUTPUT.relative_to(ROOT).as_posix()} ({len(imports)} modulos, {size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
