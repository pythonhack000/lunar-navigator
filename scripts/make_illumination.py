"""Annual sunlight and permanent-shadow map of the lunar south pole (south of 80° S).

Usage: python3 -I scripts/make_illumination.py <folder with ldem_80s_80m.img> <sun vectors json>

For every map pixel: trace the terrain horizon in 72 directions over the LOLA 80 m map, then run
the Sun through a year of real positions (6-hour steps) and count when it clears the horizon.
Writes public/textures/south_light_512.png:
  R = share of the year in sunlight (0-255), G = 255 where the Sun never shines (permanent shadow,
  where water ice can survive), B = 255 inside the map.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_assets import (  # noqa: E402
    MOON_RADIUS_M,
    PDS_80S,
    POLAR_EDGE_LAT,
    POLAR_MARGIN,
    PUBLIC,
    resample_pds,
    stereo_radius,
)

OUT_PX = 512
HEIGHT_PX = 1024
AZIMUTHS = 72
DISTANCES_KM = np.geomspace(0.3, 150.0, 40)
PDS_ORIENTATION = (True, 1, -1)  # matched by prepare_assets.py against the global LOLA data


def plane_grid(size: int, rho_max: float):
    c = (np.arange(size) + 0.5) / size * 2 * rho_max - rho_max
    x, y = np.meshgrid(c, -c)  # row 0 is +y
    return x, y


def bilinear(grid: np.ndarray, x: np.ndarray, y: np.ndarray, rho_max: float) -> np.ndarray:
    n = grid.shape[0]
    fx = np.clip((x / (2 * rho_max) + 0.5) * n - 0.5, 0, n - 1.001)
    fy = np.clip((0.5 - y / (2 * rho_max)) * n - 0.5, 0, n - 1.001)
    x0 = fx.astype(np.int32)
    y0 = fy.astype(np.int32)
    tx = fx - x0
    ty = fy - y0
    top = grid[y0, x0] * (1 - tx) + grid[y0, x0 + 1] * tx
    bottom = grid[y0 + 1, x0] * (1 - tx) + grid[y0 + 1, x0 + 1] * tx
    return top * (1 - ty) + bottom * ty


def main(src: Path, sun_path: Path) -> None:
    rho_edge = stereo_radius(POLAR_EDGE_LAT)
    rho_max = rho_edge * POLAR_MARGIN
    pds = np.memmap(src / PDS_80S.file, dtype="<i2", mode="r", shape=(PDS_80S.size, PDS_80S.size))
    fallback = np.zeros((HEIGHT_PX, HEIGHT_PX), dtype=np.float32)
    heights = resample_pds(pds, PDS_ORIENTATION, HEIGHT_PX, rho_max, fallback, PDS_80S)

    x, y = plane_grid(OUT_PX, rho_max)
    r = np.hypot(x, y)
    valid = r <= rho_edge
    radial_x = np.where(r > 0, x / np.maximum(r, 1e-12), 1.0)
    radial_y = np.where(r > 0, y / np.maximum(r, 1e-12), 0.0)
    scale = (4 + r * r) / 4  # plane units per radian of ground distance
    h0 = bilinear(heights, x, y, rho_max) + 2.0

    horizon = np.full((AZIMUTHS,) + x.shape, -np.pi / 2, dtype=np.float32)
    for a in range(AZIMUTHS):
        theta = 2 * math.pi * a / AZIMUTHS  # clockwise from north (radially outward)
        dx = math.cos(theta) * radial_x + math.sin(theta) * -radial_y
        dy = math.cos(theta) * radial_y + math.sin(theta) * radial_x
        for d_km in DISTANCES_KM:
            d = d_km * 1000.0
            step = d / MOON_RADIUS_M * scale
            ht = bilinear(heights, x + dx * step, y + dy * step, rho_max)
            elev = np.arctan2(ht - h0 - d * d / (2 * MOON_RADIUS_M), d)
            np.maximum(horizon[a], elev, out=horizon[a])
        print(f"horizon {a + 1}/{AZIMUTHS}", end="\r", flush=True)

    # Local frame of every pixel (Moon-fixed): up, east (increasing longitude), north.
    up = np.stack([4 * x, 4 * y, r * r - 4], axis=-1) / (r * r + 4)[..., None]
    east = np.stack([-up[..., 1], up[..., 0], np.zeros_like(r)], axis=-1)
    east /= np.maximum(np.linalg.norm(east, axis=-1, keepdims=True), 1e-12)
    north = np.cross(up, east)

    suns = np.array(json.loads(sun_path.read_text()), dtype=np.float64)
    lit = np.zeros(x.shape, dtype=np.int32)
    flat_idx = np.arange(x.size)
    for s in suns:
        elev = np.arcsin(np.clip(up @ s, -1, 1))
        az = np.arctan2(east @ s, north @ s) % (2 * math.pi)
        bins = (az / (2 * math.pi) * AZIMUTHS).astype(np.int32) % AZIMUTHS
        hz = horizon.reshape(AZIMUTHS, -1)[bins.ravel(), flat_idx].reshape(x.shape)
        lit += elev > hz
    share = lit / len(suns)
    print(f"\nlit share: max {share[valid].max():.3f}, shadowed pixels {(lit[valid] == 0).mean():.1%}")

    rgb = np.zeros(x.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = np.round(share * 255).astype(np.uint8)
    rgb[..., 1] = np.where(valid & (lit == 0), 255, 0).astype(np.uint8)
    rgb[..., 2] = np.where(valid, 255, 0).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(PUBLIC / "textures/south_light_512.png", optimize=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).expanduser().resolve(), Path(sys.argv[2]).expanduser().resolve())
