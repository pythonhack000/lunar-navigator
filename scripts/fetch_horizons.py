#!/usr/bin/env python3
"""Downloads reference Sun and Earth positions from NASA/JPL Horizons (DE441) for a few lunar sites.

Writes src/data/horizonsReference.json, which the accuracy panel and a unit test compare with this
app's own ephemeris. Heights are zero because Horizons measures from the 1737.4 km reference sphere.

Usage: python3 -I scripts/fetch_horizons.py
"""
import json
import pathlib
import subprocess
import time
import urllib.parse

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "horizonsReference.json"
START, STOP, STEP = "2026-11-01", "2028-11-01", "30 d"
PAUSE_S = 0.5
TIMEOUT_S = 60
BODIES = {"sun": "10", "earth": "399"}
SITES = [
    {"id": "shackleton", "lat": -89.45, "lon": -137.0},
    {"id": "malapert", "lat": -86.0, "lon": 0.0},
    {"id": "apollo11", "lat": 0.674, "lon": 23.473},
    {"id": "apollo15", "lat": 26.132, "lon": 3.634},
]
MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def query(command: str, lat: float, lon: float) -> str:
    params = {
        "format": "text", "COMMAND": f"'{command}'", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC", "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{STEP}'",
        "QUANTITIES": "'4'", "APPARENT": "AIRLESS", "ANG_FORMAT": "DEG", "EXTRA_PREC": "YES", "CSV_FORMAT": "YES",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    # curl uses the system's certificate store, which some Python installs lack.
    done = subprocess.run(["curl", "-sS", "-m", str(TIMEOUT_S), url], capture_output=True, text=True, check=True)
    return done.stdout


def to_iso(stamp: str) -> str:
    """'2026-Nov-15 00:00' to '2026-11-15T00:00:00Z'."""
    date, clock = stamp.strip().split()
    year, month, day = date.split("-")
    return f"{year}-{MONTHS[month]:02d}-{day}T{clock}:00Z"


def parse_rows(text: str) -> list[dict]:
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError(f"Horizons returned no table:\n{text[:400]}")
    table = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in table.strip().splitlines():
        cells = [c.strip() for c in line.split(",")]
        rows.append({"time": to_iso(cells[0]), "az": float(cells[3]), "el": float(cells[4])})
    return rows


def main() -> None:
    samples = []
    for site in SITES:
        for body, command in BODIES.items():
            rows = parse_rows(query(command, site["lat"], site["lon"]))
            samples.append({**site, "body": body, "rows": rows})
            time.sleep(PAUSE_S)
    OUTPUT.write_text(json.dumps({"source": "NASA/JPL Horizons, DE441, airless", "samples": samples}, indent=1) + "\n")
    print(f"Wrote {sum(len(s['rows']) for s in samples)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
