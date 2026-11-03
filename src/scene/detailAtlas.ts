import { CanvasTexture, DataTexture, LinearFilter, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';

/** Tiling of the LOLA 64 px/deg detail tiles (see scripts/make_tiles.py). */
export interface TileGrid {
  deg: number;
  heightPx: number;
  normalPx: number;
  firstBand: number;
  bands: number;
  cols: number;
}

export interface DetailAtlas {
  /** Tile column and band at the centre of the 3x3 block. */
  key: string;
  heights: DataTexture;
  normals: CanvasTexture;
  /** South-west corner, radians. */
  originLon: number;
  originLat: number;
  spanRad: number;
  heightSize: number;
}

const BLOCK = 3;
const DEG = Math.PI / 180;

export function tileIndex(lonRad: number, latRad: number, grid: TileGrid): { i: number; j: number } {
  const i = Math.floor((lonRad / DEG + 180) / grid.deg);
  const j = Math.floor((latRad / DEG + 90) / grid.deg);
  return { i: ((i % grid.cols) + grid.cols) % grid.cols, j: Math.min(grid.bands - 1, Math.max(0, j)) };
}

const tileUrl = (kind: 'h' | 'n', j: number, i: number, ext: string) => `${import.meta.env.BASE_URL}tiles/${kind}/${j}_${i}.${ext}`;

async function loadBitmap(url: string, raw: boolean): Promise<ImageBitmap | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  // Packed heights must reach the canvas byte for byte: no colour management, no premultiplying.
  return createImageBitmap(await res.blob(), raw ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : {});
}

function canvas2d(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  return ctx;
}

/**
 * Loads the 3x3 tiles around (ci, cj) into one height texture (rows south to north, alpha 255
 * where a tile exists) and one normal texture. Missing tiles (the polar bands) stay transparent,
 * so the shader leaves those areas to the polar maps.
 */
export async function loadAtlas(ci: number, cj: number, grid: TileGrid): Promise<DetailAtlas> {
  const hSize = BLOCK * grid.heightPx;
  const nSize = BLOCK * grid.normalPx;
  const heightCtx = canvas2d(hSize);
  const normalCtx = canvas2d(nSize);

  const jobs: Promise<void>[] = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const j = cj + dj;
      if (j < grid.firstBand || j >= grid.bands) continue;
      const i = (((ci + di) % grid.cols) + grid.cols) % grid.cols;
      // Canvas row 0 is the top (north): the northern band of the block goes first.
      const row = 1 - dj;
      const col = di + 1;
      jobs.push(
        Promise.all([loadBitmap(tileUrl('h', j, i, 'png'), true), loadBitmap(tileUrl('n', j, i, 'jpg'), false)]).then(([h, n]) => {
          if (h) heightCtx.drawImage(h, col * grid.heightPx, row * grid.heightPx);
          if (n) normalCtx.drawImage(n, col * grid.normalPx, row * grid.normalPx);
          h?.close();
          n?.close();
        }),
      );
    }
  }
  await Promise.all(jobs);

  // texelFetch reads row 0 as the bottom, so flip the canvas rows to run south to north.
  const pixels = heightCtx.getImageData(0, 0, hSize, hSize).data;
  const flipped = new Uint8Array(pixels.length);
  const rowBytes = hSize * 4;
  for (let r = 0; r < hSize; r++) flipped.set(pixels.subarray(r * rowBytes, (r + 1) * rowBytes), (hSize - 1 - r) * rowBytes);
  const heights = new DataTexture(flipped, hSize, hSize, RGBAFormat, UnsignedByteType);
  heights.minFilter = heights.magFilter = NearestFilter;
  heights.generateMipmaps = false;
  heights.needsUpdate = true;

  const normals = new CanvasTexture(normalCtx.canvas);
  normals.minFilter = LinearFilter;
  normals.anisotropy = 8;
  normals.needsUpdate = true;

  return {
    key: `${ci},${cj}`,
    heights,
    normals,
    originLon: (-180 + (ci - 1) * grid.deg) * DEG,
    originLat: (-90 + (cj - 1) * grid.deg) * DEG,
    spanRad: BLOCK * grid.deg * DEG,
    heightSize: hSize,
  };
}
