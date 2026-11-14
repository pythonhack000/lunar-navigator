"""Small first-load versions of the 3D textures, plus 2k height maps for the CPU horizon grids.

The full textures weigh ~90 MB; on a slow connection that is minutes before the Moon appears.
The app shows these previews first (a few MB) and swaps in the full set in the background.
Heights are packed as 16 bits in R (high) and G (low), so they are decoded, averaged and repacked:
resampling the bytes directly would corrupt them.
"""
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TEX = Path(__file__).resolve().parent.parent / "public" / "textures"
JPEG_QUALITY = 82
# Preview heights in ~5 m steps: invisible at preview resolution, and the files shrink severalfold.
PREVIEW_QUANTUM = 16


def downsample_heights(src: str, dst: str, factor: int, quantum: int = 1) -> None:
    """`quantum` rounds heights to steps of that many units (~0.3 m each) so the PNG compresses."""
    rgb = np.asarray(Image.open(TEX / src).convert("RGB")).astype(np.uint32)
    h, w, _ = rgb.shape
    packed = (rgb[..., 0] << 8) | rgb[..., 1]
    blocks = packed.reshape(h // factor, factor, w // factor, factor).astype(np.float64)
    mean = (np.rint(blocks.mean(axis=(1, 3)) / quantum) * quantum).clip(0, 65535).astype(np.uint32)
    blue = rgb[::factor, ::factor, 2]
    out = np.stack([mean >> 8, mean & 0xFF, blue], axis=-1).astype(np.uint8)
    Image.fromarray(out, "RGB").save(TEX / dst, optimize=True)


def downsample_image(src: str, dst: str, size: tuple[int, int]) -> None:
    Image.open(TEX / src).convert("RGB").resize(size, Image.LANCZOS).save(TEX / dst, quality=JPEG_QUALITY, optimize=True)


def main() -> None:
    downsample_image("moon_color_8k.jpg", "moon_color_2k.jpg", (2048, 1024))
    downsample_image("moon_normal_8k.jpg", "moon_normal_2k.jpg", (2048, 1024))
    downsample_heights("moon_height_4k.png", "moon_height_1k.png", 4, PREVIEW_QUANTUM)
    for name in ("south", "south60"):
        downsample_image(f"{name}_color_4k.jpg", f"{name}_color_1k.jpg", (1024, 1024))
        downsample_image(f"{name}_normal_6k.jpg", f"{name}_normal_1k.jpg", (1536, 1536))
        downsample_heights(f"{name}_height_4k.png", f"{name}_height_1k.png", 4, PREVIEW_QUANTUM)
        downsample_heights(f"{name}_height_4k.png", f"{name}_height_2k.png", 2)
    for f in sorted(TEX.glob("*_[12]k.*")):
        print(f"{f.name:28s} {f.stat().st_size / 1e6:6.2f} MB")


if __name__ == "__main__":
    main()
