"""Turns NASA CGI Moon Kit files into the web assets the app loads.

Usage: python3 -I scripts/prepare_assets.py <folder with the downloaded NASA files>

Inputs (https://svs.gsfc.nasa.gov/4720), best available is used:
  lroc_color_poles_16k.tif or lroc_color_poles_8k.tif   LRO colour mosaic
  ldem_64_uint.tif (optional) and ldem_16_uint.tif        LOLA elevation, uint16 half-metres above 1727.4 km
  ldem_4_uint.tif                                         the same at 4 px/deg
  earth.jpg (optional)                                    Blue Marble day map
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MOON_RADIUS_M = 1_737_400.0
UINT_OFFSET_M = 10_000.0  # uint files are relative to 1727.4 km, 10 km below the reference sphere
SOUTH_DETAIL_LAT = -60.0
POLAR_EDGE_LAT = -80.0
POLAR_MARGIN = 1.02  # the polar tile reaches a little past its edge so the seam has data on both sides
POLAR_SIZE = 4096
MIN_PIXEL_WIDTH_M = 200.0  # keeps normals sane where meridians converge at the poles
GLOBAL_HEIGHT_SIZE = (4096, 2048)
GLOBAL_BLOCK = 5  # 64 px/deg averaged 5x5 before resizing: no aliasing, bounded memory
POLAR_HEIGHT_SIZE = 4096
POLAR_NORMAL_SIZE = 6144
CHUNK_ROWS = 512

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"


# ---------- reading ----------

def tiff_array(path: Path, dtype, channels: int = 1) -> np.ndarray:
    """Memory-maps an uncompressed, contiguous TIFF so huge files never load whole; decodes compressed ones."""
    with Image.open(path) as im:
        width, height = im.size
        tags = im.tag_v2
        offsets = tags.get(273)
        compression = tags.get(259, 1)
        if compression != 1:
            return np.asarray(im.convert("RGB") if channels == 3 else im)
    first = offsets[0] if isinstance(offsets, (tuple, list)) else offsets
    shape = (height, width, channels) if channels > 1 else (height, width)
    return np.memmap(path, dtype=dtype, mode="r", offset=first, shape=shape)


def dem_metres(raw: np.ndarray) -> np.ndarray:
    return raw.astype(np.float32) / 2.0 - UINT_OFFSET_M


def first_existing(src: Path, names: list[str]) -> Path:
    for name in names:
        if (src / name).exists():
            return src / name
    raise FileNotFoundError(f"none of {names} in {src}")


# ---------- sampling ----------

def sample_equirect(grid: np.ndarray, lat: np.ndarray, lon: np.ndarray, lat_top: float = 90.0) -> np.ndarray:
    """Bilinear sample of an equirectangular grid whose columns start at -180°."""
    rows, cols = grid.shape[:2]
    ppd = cols / 360.0
    fx = (lon + 180.0) * ppd - 0.5
    fy = np.clip((lat_top - lat) * ppd - 0.5, 0, rows - 1)
    x0 = np.floor(fx).astype(np.int64)
    y0 = np.floor(fy).astype(np.int64)
    tx = (fx - x0).astype(np.float32)
    ty = (fy - y0).astype(np.float32)
    x0 %= cols
    x1 = (x0 + 1) % cols
    y1 = np.minimum(y0 + 1, rows - 1)
    if grid.ndim == 3:
        tx, ty = tx[..., None], ty[..., None]
    top = grid[y0, x0] * (1 - tx) + grid[y0, x1] * tx
    bottom = grid[y1, x0] * (1 - tx) + grid[y1, x1] * tx
    return top * (1 - ty) + bottom * ty


def stereo_radius(lat_deg: float) -> float:
    """Distance from the south pole in the south polar stereographic plane of a unit sphere."""
    lat = math.radians(lat_deg)
    return 2 * math.cos(lat) / (1 - math.sin(lat))


def polar_grid(rows: slice, size: int, rho_max: float):
    """Latitude/longitude of polar tile pixels. Row 0 is +Y; X points to 0°E, Y to 90°E."""
    idx = np.arange(size, dtype=np.float64)
    coords = (idx + 0.5) / size * 2 * rho_max - rho_max
    x = coords[None, :]
    y = -coords[rows][:, None]
    rho = np.hypot(x, y)
    lat = np.degrees(2 * np.arctan(rho / 2)) - 90.0
    lon = np.degrees(np.arctan2(y, x))
    return lat, lon + 0 * x


# ---------- LOLA polar stereographic DEM (PDS) ----------

PDS_POLAR_FILE = "ldem_80s_80m.img"
PDS_POLAR_SIZE = 7600
PDS_POLAR_SCALE_M = 80.0
PDS_POLAR_CENTRE = 3799.5
PDS_DN_TO_M = 0.5
CALIBRATION_SIZE = 256


def pds_sampler(dem: np.ndarray, variant: tuple[bool, int, int]):
    """Bilinear sampler of the PDS grid for tile-plane metres (x toward 0°E, y toward 90°E)."""
    swap, sx, sy = variant

    def sample(x_m: np.ndarray, y_m: np.ndarray) -> np.ndarray:
        a, b = (y_m, x_m) if swap else (x_m, y_m)
        col = sx * a / PDS_POLAR_SCALE_M + PDS_POLAR_CENTRE
        row = sy * b / PDS_POLAR_SCALE_M + PDS_POLAR_CENTRE
        inside = (col >= 0) & (col <= PDS_POLAR_SIZE - 1) & (row >= 0) & (row <= PDS_POLAR_SIZE - 1)
        col = np.clip(col, 0, PDS_POLAR_SIZE - 1.001)
        row = np.clip(row, 0, PDS_POLAR_SIZE - 1.001)
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        tc = (col - c0).astype(np.float32)
        tr = (row - r0).astype(np.float32)
        top = dem[r0, c0] * (1 - tc) + dem[r0, c0 + 1] * tc
        bottom = dem[r0 + 1, c0] * (1 - tc) + dem[r0 + 1, c0 + 1] * tc
        return (top * (1 - tr) + bottom * tr) * PDS_DN_TO_M, inside

    return sample


def tile_metres(size: int, rho_max: float, rows: slice):
    idx = np.arange(size, dtype=np.float64)
    coords = ((idx + 0.5) / size * 2 * rho_max - rho_max) * MOON_RADIUS_M
    return np.broadcast_arrays(coords[None, :], -coords[rows][:, None])


def calibrate_pds(dem: np.ndarray, reference: np.ndarray, rho_max: float):
    """Picks the axis orientation of the PDS grid that best matches the equirectangular LOLA data."""
    ref = np.asarray(Image.fromarray(reference, "F").resize((CALIBRATION_SIZE,) * 2, Image.BILINEAR))
    x_m, y_m = tile_metres(CALIBRATION_SIZE, rho_max, slice(0, CALIBRATION_SIZE))
    best = None
    for swap in (False, True):
        for sx in (1, -1):
            for sy in (1, -1):
                values, inside = pds_sampler(dem, (swap, sx, sy))(x_m, y_m)
                corr = np.corrcoef(values[inside], ref[inside])[0, 1]
                if best is None or corr > best[0]:
                    best = (corr, (swap, sx, sy))
    print(f"PDS orientation {best[1]} correlation {best[0]:.4f}")
    if best[0] < 0.95:
        raise ValueError("could not match the PDS polar grid to the global LOLA data")
    return best[1]


def resample_pds(dem: np.ndarray, variant, size: int, rho_max: float, fallback: np.ndarray) -> np.ndarray:
    """PDS heights on the tile grid; corners outside its coverage keep the equirectangular values."""
    sample = pds_sampler(dem, variant)
    fill = np.asarray(Image.fromarray(fallback, "F").resize((size, size), Image.BILINEAR))
    out = np.empty((size, size), dtype=np.float32)
    for start in range(0, size, CHUNK_ROWS):
        rows = slice(start, start + CHUNK_ROWS)
        x_m, y_m = tile_metres(size, rho_max, rows)
        values, inside = sample(x_m, y_m)
        out[rows] = np.where(inside, values, fill[rows])
    return out


# ---------- albedo ----------

NO_DATA_LUMINANCE = 30  # the LRO mosaic is near-black where permanently shadowed craters were never imaged
FILL_DOWNSCALE = 8
FILL_BLUR_RADIUS = 6


def fill_dark_albedo(rgb: np.ndarray) -> np.ndarray:
    """
    Replaces unimaged (black) pixels with the average colour of the surrounding regolith. The app
    computes shadows itself, so leaving them black would paint a second, wrong shadow into the albedo.
    """
    from PIL import ImageFilter

    valid = rgb.mean(axis=-1) > NO_DATA_LUMINANCE
    if valid.all():
        return rgb
    rows, cols = valid.shape
    small = (max(1, cols // FILL_DOWNSCALE), max(1, rows // FILL_DOWNSCALE))
    blur = ImageFilter.GaussianBlur(FILL_BLUR_RADIUS)
    weight = np.asarray(Image.fromarray((valid * 255).astype(np.uint8), "L").resize(small, Image.BILINEAR).filter(blur), dtype=np.float32)
    channels = []
    for c in range(3):
        masked = Image.fromarray((rgb[..., c] * valid).astype(np.uint8), "L").resize(small, Image.BILINEAR).filter(blur)
        channels.append(np.asarray(masked, dtype=np.float32) * 255 / np.maximum(weight, 1))
    fill_small = np.clip(np.stack(channels, axis=-1), 0, 255).astype(np.uint8)
    fill = np.asarray(Image.fromarray(fill_small, "RGB").resize((cols, rows), Image.BILINEAR))
    return np.where(valid[..., None], rgb, fill)


# ---------- writing ----------

def encode_height(heights: np.ndarray, lo: float, hi: float) -> Image.Image:
    """16-bit heights split over R (high byte) and G (low byte); shaders read them with nearest filtering."""
    q = np.round((np.clip(heights, lo, hi) - lo) / (hi - lo) * 65535).astype(np.uint32)
    rgb = np.zeros(heights.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF
    return Image.fromarray(rgb, "RGB")


def normals_rgb(d_east: np.ndarray, d_north: np.ndarray) -> np.ndarray:
    n = np.stack([-d_east, -d_north, np.ones_like(d_east)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.round((n * 0.5 + 0.5) * 255).astype(np.uint8)


def block_mean(raw: np.ndarray, block: int) -> np.ndarray:
    """Averages `block`x`block` cells of a (memory-mapped) uint16 DEM into metres, a strip at a time."""
    rows, cols = raw.shape[0] // block, raw.shape[1] // block
    out = np.empty((rows, cols), dtype=np.float32)
    strip = 256
    for r in range(0, rows, strip):
        chunk = dem_metres(np.asarray(raw[r * block : (r + strip) * block, : cols * block]))
        n = chunk.shape[0] // block
        out[r : r + n] = chunk.reshape(n, block, cols, block).mean(axis=(1, 3))
    return out


def global_normal_map(heights: np.ndarray) -> Image.Image:
    rows, cols = heights.shape
    lat = 90.0 - (np.arange(rows) + 0.5) * 180.0 / rows
    dy = np.pi * MOON_RADIUS_M / rows
    dx = np.maximum(2 * np.pi * MOON_RADIUS_M * np.cos(np.radians(lat)) / cols, MIN_PIXEL_WIDTH_M)[:, None]
    d_east = (np.roll(heights, -1, axis=1) - np.roll(heights, 1, axis=1)) / (2 * dx)
    d_north = -np.gradient(heights, axis=0) / dy  # rows run north to south
    return Image.fromarray(normals_rgb(d_east, d_north), "RGB")


def polar_normal_map(heights: np.ndarray, rho_max: float) -> Image.Image:
    size = heights.shape[0]
    pixel_m = 2 * rho_max / size * MOON_RADIUS_M  # stereographic scale is within 1% of true here
    g_row, g_col = np.gradient(heights, pixel_m)
    g_x, g_y = g_col, -g_row  # tile +X is east along 0°, +Y is toward 90°E; rows run down
    _, lon = polar_grid(slice(0, size), size, rho_max)
    lam = np.radians(lon)
    # North points away from the south pole (radially outward); east is perpendicular.
    d_north = g_x * np.cos(lam) + g_y * np.sin(lam)
    d_east = -g_x * np.sin(lam) + g_y * np.cos(lam)
    return Image.fromarray(normals_rgb(d_east, d_north), "RGB")


def resample_polar(grid: np.ndarray, rho_max: float, lat_top: float = 90.0, channels: int = 1) -> np.ndarray:
    shape = (POLAR_SIZE, POLAR_SIZE) + ((channels,) if channels > 1 else ())
    out = np.zeros(shape, dtype=np.float32)
    for start in range(0, POLAR_SIZE, CHUNK_ROWS):
        rows = slice(start, start + CHUNK_ROWS)
        lat, lon = polar_grid(rows, POLAR_SIZE, rho_max)
        out[rows] = sample_equirect(grid, lat, lon, lat_top)
    return out


# ---------- main ----------

def south_band(grid: np.ndarray, lat_from: float) -> tuple[np.ndarray, float]:
    """Rows of a global equirectangular grid south of `lat_from`, as an in-memory array."""
    ppd = grid.shape[1] / 360.0
    first = int(math.floor((90.0 - lat_from) * ppd))
    return np.asarray(grid[first:]), 90.0 - first / ppd


def main(src: Path) -> None:
    (PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    tex = PUBLIC / "textures"
    tex.mkdir(parents=True, exist_ok=True)

    color_path = first_existing(src, ["lroc_color_poles_16k.tif", "lroc_color_poles_8k.tif"])
    color = tiff_array(color_path, np.uint8, channels=3)
    print("colour:", color_path.name, color.shape)
    global_color = np.asarray(Image.fromarray(np.asarray(color)).resize((8192, 4096), Image.LANCZOS))
    Image.fromarray(fill_dark_albedo(global_color), "RGB").save(
        tex / "moon_color_8k.jpg", quality=88, optimize=True, progressive=True
    )

    dem16 = dem_metres(np.asarray(tiff_array(src / "ldem_16_uint.tif", "<u2")))
    dem4 = dem_metres(np.asarray(tiff_array(src / "ldem_4_uint.tif", "<u2")))
    lo, hi = float(dem16.min()), float(dem16.max())

    global_normal_map(dem16).save(tex / "moon_normal_6k.jpg", quality=92)
    dem64_path = src / "ldem_64_uint.tif"
    global_source = block_mean(tiff_array(dem64_path, "<u2"), GLOBAL_BLOCK) if dem64_path.exists() else dem16
    height_img = Image.fromarray(global_source, "F").resize(GLOBAL_HEIGHT_SIZE, Image.BILINEAR)
    encode_height(np.asarray(height_img), lo, hi).save(tex / "moon_height_4k.png", optimize=True)

    # South polar tile: the best elevation available, reprojected so the pole has no pinch.
    rho_edge = stereo_radius(POLAR_EDGE_LAT)
    rho_max = rho_edge * POLAR_MARGIN
    band_lat = POLAR_EDGE_LAT + 1.5  # a little north of the tile corners
    dem_hi_path = src / "ldem_64_uint.tif"
    dem_source = tiff_array(dem_hi_path, "<u2") if dem_hi_path.exists() else tiff_array(src / "ldem_16_uint.tif", "<u2")
    raw_band, band_top = south_band(dem_source, band_lat)
    print("polar elevation:", "ldem_64" if dem_hi_path.exists() else "ldem_16", raw_band.shape)
    polar_heights = resample_polar(dem_metres(raw_band), rho_max, band_top)
    pds_path = src / PDS_POLAR_FILE
    if pds_path.exists():
        pds = np.memmap(pds_path, dtype="<i2", mode="r", shape=(PDS_POLAR_SIZE, PDS_POLAR_SIZE))
        variant = calibrate_pds(pds, polar_heights, rho_max)
        detail_heights = resample_pds(pds, variant, POLAR_NORMAL_SIZE, rho_max, polar_heights)
        print("polar detail: LOLA LDEM_80S_80M")
    else:
        detail_heights = np.asarray(Image.fromarray(polar_heights, "F").resize((POLAR_NORMAL_SIZE,) * 2, Image.BILINEAR))
    polar_height_img = Image.fromarray(detail_heights, "F").resize((POLAR_HEIGHT_SIZE,) * 2, Image.BILINEAR)
    encode_height(np.asarray(polar_height_img), lo, hi).save(tex / "south_height_4k.png", optimize=True)
    polar_normal_map(detail_heights, rho_max).save(tex / "south_normal_6k.jpg", quality=90)
    color_band, color_top = south_band(color, band_lat)
    polar_color = resample_polar(color_band.astype(np.float32), rho_max, color_top, channels=3)
    polar_rgb = fill_dark_albedo(np.clip(polar_color, 0, 255).astype(np.uint8))
    Image.fromarray(polar_rgb, "RGB").save(tex / "south_color_4k.jpg", quality=90)

    south_rows = int((90.0 - SOUTH_DETAIL_LAT) * 16)
    manifest = {
        "global": write_grid(dem4, "dem_global_4ppd.bin", 4, 90.0),
        "detailed": [write_grid(dem16[south_rows:], "dem_south_16ppd.bin", 16, SOUTH_DETAIL_LAT)],
        "heightTexture": {"minM": lo, "maxM": hi},
        "polar": {"edgeLat": POLAR_EDGE_LAT, "rhoEdge": rho_edge, "rhoMax": rho_max, "heightSize": POLAR_HEIGHT_SIZE},
        "source": "NASA SVS CGI Moon Kit (LRO LROC colour, LOLA elevation)",
    }
    (PUBLIC / "data/manifest.json").write_text(json.dumps(manifest, indent=2))

    earth = src / "earth.jpg"
    if earth.exists():
        Image.open(earth).convert("RGB").resize((2048, 1024), Image.LANCZOS).save(tex / "earth_2k.jpg", quality=88)

    for stale in ["moon_normal_4k.jpg", "moon_height_2k.png", "south_height_2k.png", "south_normal_4k.jpg", "moon_color_2k.jpg"]:
        (tex / stale).unlink(missing_ok=True)
    print(json.dumps(manifest, indent=2))


def write_grid(heights: np.ndarray, name: str, ppd: int, lat_top: float) -> dict:
    np.round(heights).astype("<i2").tofile(PUBLIC / "data" / name)
    rows, cols = heights.shape
    return {"file": f"data/{name}", "width": cols, "height": rows, "pixelsPerDegree": ppd, "latTop": lat_top}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).expanduser().resolve())
