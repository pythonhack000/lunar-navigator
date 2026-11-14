"""Cuts the LOLA 64 px/deg elevation map into 10° tiles the app streams around the camera.

Usage: python3 -I scripts/make_tiles.py <folder with ldem_64_uint.tif>

Writes, for every tile north of 60° S (the polar maps cover the rest):
  public/tiles/h/{j}_{i}.png   heights, 320x320 (32 px/deg), 16 bits packed in R/G like the other maps
  public/tiles/n/{j}_{i}.jpg   relief normals, 640x640 (64 px/deg), east/north/up packed like the others
j counts 10° latitude bands from -90°, i counts 10° longitude bands from -180°.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_assets import (  # noqa: E402  (shared encoders and constants)
    MIN_PIXEL_WIDTH_M,
    MOON_RADIUS_M,
    PUBLIC,
    dem_metres,
    encode_height,
    normals_rgb,
    tiff_array,
)

TILE_DEG = 10
SOURCE_PPD = 64
TILE_PX = TILE_DEG * SOURCE_PPD  # 640
HEIGHT_BLOCK = 2  # heights at 32 px/deg
FIRST_BAND = 3  # bands 0-2 (90°S-60°S) are covered by the polar maps


def tile_normals(block: np.ndarray, lat_top: float) -> np.ndarray:
    """Normals for a tile from heights with a one-pixel border all round."""
    rows = block.shape[0] - 2
    lat = lat_top - (np.arange(rows) + 0.5) / SOURCE_PPD
    dy = np.pi * MOON_RADIUS_M / (180 * SOURCE_PPD)
    dx = np.maximum(2 * np.pi * MOON_RADIUS_M * np.cos(np.radians(lat)) / (360 * SOURCE_PPD), MIN_PIXEL_WIDTH_M)[:, None]
    d_east = (block[1:-1, 2:] - block[1:-1, :-2]) / (2 * dx)
    d_north = (block[:-2, 1:-1] - block[2:, 1:-1]) / (2 * dy)  # rows run north to south
    return normals_rgb(d_east, d_north)


def main(src: Path) -> None:
    manifest = json.loads((PUBLIC / "data/manifest.json").read_text())
    lo, hi = manifest["heightTexture"]["minM"], manifest["heightTexture"]["maxM"]
    raw = tiff_array(src / "ldem_64_uint.tif", "<u2")
    total_rows, total_cols = raw.shape
    out_h = PUBLIC / "tiles/h"
    out_n = PUBLIC / "tiles/n"
    out_h.mkdir(parents=True, exist_ok=True)
    out_n.mkdir(parents=True, exist_ok=True)
    bands = 180 // TILE_DEG
    cols = 360 // TILE_DEG
    for j in range(FIRST_BAND, bands):
        lat_top = -90 + (j + 1) * TILE_DEG
        r0 = (90 - lat_top) * SOURCE_PPD
        rows = np.clip(np.arange(r0 - 1, r0 + TILE_PX + 1), 0, total_rows - 1)
        band = dem_metres(np.asarray(raw[rows]))
        for i in range(cols):
            c0 = i * TILE_PX
            col_idx = np.arange(c0 - 1, c0 + TILE_PX + 1) % total_cols
            block = band[:, col_idx]
            core = block[1:-1, 1:-1]
            heights = core.reshape(TILE_PX // HEIGHT_BLOCK, HEIGHT_BLOCK, TILE_PX // HEIGHT_BLOCK, HEIGHT_BLOCK).mean(axis=(1, 3))
            encode_height(heights, lo, hi).save(out_h / f"{j}_{i}.png", optimize=True)
            Image.fromarray(tile_normals(block, lat_top), "RGB").save(out_n / f"{j}_{i}.jpg", quality=86)
        print(f"band {j} done (lat {lat_top - TILE_DEG}..{lat_top})", flush=True)
    manifest["tiles"] = {
        "deg": TILE_DEG,
        "heightPx": TILE_PX // HEIGHT_BLOCK,
        "normalPx": TILE_PX,
        "firstBand": FIRST_BAND,
        "bands": bands,
        "cols": cols,
    }
    (PUBLIC / "data/manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).expanduser().resolve())
