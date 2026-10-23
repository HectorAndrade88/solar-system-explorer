#!/usr/bin/env python3
"""
Actualiza los datos locales de satélites Starlink:
  js/data/starlink-tle.js       Elementos orbitales (TLE) de todos los satélites en órbita.
  js/data/starlink-launches.js  Historial de lanzamientos (fecha, misión, plataforma, satélites).

Es una herramienta de MANTENIMIENTO que se ejecuta con conexión a Internet.
La aplicación nunca descarga nada: solo lee los archivos generados.

Fuentes (descargadas una sola vez por ejecución):
  - CelesTrak GP (TLE del grupo "starlink").
  - CelesTrak SATCAT (fecha y sitio de lanzamiento, reingresos, órbita).
  - Launch Library 2 de The Space Devs (nombre de misión, hora exacta,
    plataforma, cohete y resultado). Límite gratuito: 15 consultas por hora;
    se usan unas 5. Si falla, el historial se genera solo con SATCAT.

Uso (biblioteca estándar de Python 3.8+):
    python tools/update_satellite_data.py
    python tools/update_satellite_data.py --raw carpeta   # guarda/reutiliza las descargas
"""
import argparse
import csv
import io
import json
import statistics
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TLE_OUTPUT = ROOT / "js" / "data" / "starlink-tle.js"
LAUNCH_OUTPUT = ROOT / "js" / "data" / "starlink-launches.js"

TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"
SATCAT_URL = "https://celestrak.org/pub/satcat.csv"
LAUNCH_LIBRARY_URL = ("https://ll.thespacedevs.com/2.3.0/launches/previous/"
                      "?search=Starlink&limit=100&mode=normal&ordering=net&offset={offset}")
USER_AGENT = "SolarSystemExplorer-data-updater/1.0"

# Plataformas conocidas, usadas también cuando Launch Library no tiene el lanzamiento.
SATCAT_SITES = {"AFETR": "slc-40", "AFWTR": "slc-4e", "TTMTR": "starbase"}
KNOWN_SITES = {
    "slc-40": {"name": "SLC-40, Cabo Cañaveral (Florida)", "latitude": 28.5618, "longitude": -80.5772},
    "lc-39a": {"name": "LC-39A, Centro Espacial Kennedy (Florida)", "latitude": 28.6081, "longitude": -80.6041},
    "slc-4e": {"name": "SLC-4E, Vandenberg (California)", "latitude": 34.632, "longitude": -120.611},
    "starbase": {"name": "Starbase (Texas)", "latitude": 25.9972, "longitude": -97.1561},
}
PAD_KEYS = {
    "Space Launch Complex 40": "slc-40",
    "Launch Complex 39A": "lc-39a",
    "Space Launch Complex 4E": "slc-4e",
    "Orbital Launch Pad 2": "starbase",
}


def download(url: str, raw_dir: Path | None, filename: str) -> bytes:
    """Descarga (o reutiliza desde raw_dir) un recurso."""
    if raw_dir and (raw_dir / filename).exists():
        print(f"  reutilizando {filename}")
        return (raw_dir / filename).read_bytes()
    print(f"  descargando {url}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if raw_dir:
        raw_dir.mkdir(parents=True, exist_ok=True)
        (raw_dir / filename).write_bytes(data)
    return data


def parse_tle(text: str) -> list[tuple[str, str, str]]:
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    satellites = []
    for k in range(0, len(lines) - 2, 3):
        name, line1, line2 = lines[k], lines[k + 1], lines[k + 2]
        if line1.startswith("1 ") and line2.startswith("2 "):
            satellites.append((name.strip(), line1, line2))
    if len(satellites) < 100:
        raise RuntimeError("El archivo TLE descargado parece incompleto.")
    return satellites


def designator_from_tle(line1: str) -> str:
    """'19074B' (columnas 10–17) → '2019-074'."""
    year = int(line1[9:11])
    return f"{1900 + year if year >= 57 else 2000 + year}-{line1[11:14]}"


def load_launch_library(raw_dir: Path | None) -> dict:
    launches = {}
    offset = 0
    while True:
        try:
            payload = json.loads(download(LAUNCH_LIBRARY_URL.format(offset=offset), raw_dir, f"ll_{offset}.json"))
        except Exception as error:  # noqa: BLE001 - se informa y se continúa sin Launch Library
            print(f"  Launch Library no disponible ({error}); se usará solo SATCAT.")
            return launches
        for item in payload["results"]:
            if item.get("launch_designator"):
                launches[item["launch_designator"]] = item
        if not payload.get("next"):
            return launches
        offset += 100
        time.sleep(1.5)


def median(values: list[float], digits: int) -> float | None:
    return round(statistics.median(values), digits) if values else None


def build_launches(satcat_rows: list[dict], library: dict, in_orbit_designators: set[str]) -> tuple[list, dict]:
    groups = defaultdict(list)
    for row in satcat_rows:
        groups[row["OBJECT_ID"][:8]].append(row)

    sites = {}
    launches = []
    for designator in sorted(groups):
        rows = groups[designator]
        payloads = [r for r in rows if r["OBJECT_TYPE"] == "PAY"] or rows
        alive = [r for r in payloads if not r["DECAY_DATE"]]
        reference = alive or payloads
        info = library.get(designator)

        if info:
            pad = info["pad"]
            site_key = PAD_KEYS.get(pad["name"], pad["name"].lower().replace(" ", "-"))
            sites.setdefault(site_key, KNOWN_SITES.get(site_key) or {
                "name": f'{pad["name"]} ({pad["location"]["name"]})',
                "latitude": round(float(pad["latitude"]), 4),
                "longitude": round(float(pad["longitude"]), 4),
            })
            name = info["name"].split("|", 1)[-1].strip()
            net = info["net"].replace("Z", "") + "Z"
            precision = "seconds"
            rocket = info["rocket"]["configuration"]["full_name"]
            status = "success" if info["status"]["abbrev"] == "Success" else "failure"
        else:
            site_key = SATCAT_SITES.get(rows[0]["LAUNCH_SITE"], "slc-40")
            sites.setdefault(site_key, KNOWN_SITES[site_key])
            name = f"Starlink (lanzamiento compartido {designator})"
            net = f"{rows[0]['LAUNCH_DATE']}T00:00:00Z"
            precision = "day"
            rocket = "Falcon 9"
            status = "success"

        launches.append({
            "id": designator,
            "name": name,
            "net": net,
            "precision": precision,
            "rocket": rocket,
            "site": site_key,
            "status": status,
            "satellites": len(payloads),
            "inOrbit": len(alive),
            "tracked": designator in in_orbit_designators,
            "inclination": median([float(r["INCLINATION"]) for r in reference if r["INCLINATION"]], 2),
            "apogee": median([float(r["APOGEE"]) for r in reference if r["APOGEE"]], 0),
            "perigee": median([float(r["PERIGEE"]) for r in reference if r["PERIGEE"]], 0),
        })
    launches.sort(key=lambda launch: launch["net"])
    return launches, sites


def js_value(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(", ", ": "))


def write_tle_module(satellites: list, generated: str) -> None:
    epochs = sorted(line1[18:32] for _, line1, _ in satellites)
    body = "\n".join(f"{name}\n{line1}\n{line2}" for name, line1, line2 in satellites)
    TLE_OUTPUT.write_text(
        "/**\n"
        " * Elementos orbitales (TLE) de los satélites Starlink en órbita.\n"
        " * Fuente: CelesTrak (https://celestrak.org), grupo \"starlink\".\n"
        " * Generado por tools/update_satellite_data.py; no editar a mano.\n"
        " * Formato: bloques de 3 líneas (nombre, línea 1, línea 2).\n"
        " */\n\n"
        f"export const STARLINK_TLE_INFO = {js_value({'generated': generated, 'count': len(satellites), 'medianEpoch': epochs[len(epochs) // 2]})};\n\n"
        f"export const STARLINK_TLE = `\n{body}\n`;\n",
        encoding="utf-8", newline="\n")


def write_launch_module(launches: list, sites: dict, generated: str) -> None:
    rows = ",\n".join(f"    {js_value(launch)}" for launch in launches)
    LAUNCH_OUTPUT.write_text(
        "/**\n"
        " * Historial de lanzamientos de satélites Starlink.\n"
        " * Fuentes: CelesTrak SATCAT (fechas, sitios, reingresos, órbitas) y\n"
        " * Launch Library 2 de The Space Devs (misión, hora exacta, plataforma, resultado).\n"
        " * Generado por tools/update_satellite_data.py; no editar a mano.\n"
        " *\n"
        " * Campos: id (designador COSPAR), name, net (UTC), precision ('seconds' | 'day'),\n"
        " * rocket, site, status ('success' | 'failure'), satellites (lanzados), inOrbit,\n"
        " * tracked (con TLE disponible), inclination (°), apogee / perigee (km, medianas).\n"
        " */\n\n"
        f"export const STARLINK_DATA_GENERATED = {js_value(generated)};\n\n"
        f"export const LAUNCH_SITES = {json.dumps(sites, ensure_ascii=False, indent=4)};\n\n"
        f"export const STARLINK_LAUNCHES = [\n{rows}\n];\n",
        encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", type=Path, help="carpeta donde guardar o reutilizar las descargas")
    args = parser.parse_args()

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print("Elementos orbitales:")
    satellites = parse_tle(download(TLE_URL, args.raw, "starlink.tle").decode("utf-8"))
    print("Catálogo SATCAT:")
    satcat = csv.DictReader(io.StringIO(download(SATCAT_URL, args.raw, "satcat.csv").decode("utf-8")))
    starlink_rows = [row for row in satcat if row["OBJECT_NAME"].startswith("STARLINK")]
    print("Launch Library 2:")
    library = load_launch_library(args.raw)

    in_orbit = {designator_from_tle(line1) for _, line1, _ in satellites}
    launches, sites = build_launches(starlink_rows, library, in_orbit)
    write_tle_module(satellites, generated)
    write_launch_module(launches, sites, generated)
    print(f"Listo: {len(satellites)} satélites, {len(launches)} lanzamientos, {len(sites)} plataformas.")


if __name__ == "__main__":
    sys.exit(main())
