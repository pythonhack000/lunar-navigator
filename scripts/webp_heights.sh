#!/bin/sh
# Re-encodes every height map (textures/*_height_*.png and tiles/h/*.png) as lossless WebP, which the
# app loads instead: about 25% smaller and, with -exact, byte-identical once decoded. Run it after
# prepare_assets.py, make_previews.py or make_tiles.py. Needs cwebp (brew install webp).
set -eu
cd "$(dirname "$0")/../public"
for png in textures/*_height_*.png tiles/h/*.png; do
  webp="${png%.png}.webp"
  if [ ! -f "$webp" ] || [ "$png" -nt "$webp" ]; then
    cwebp -quiet -lossless -z 9 -exact "$png" -o "$webp"
  fi
done
