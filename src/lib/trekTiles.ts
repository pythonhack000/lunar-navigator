import type { TilePixels } from './moonTrek';

/** A Moon Trek tile that has not arrived by then counts as unreachable. */
const TILE_TIMEOUT_MS = 15_000;

const bitmaps = new Map<string, Promise<ImageBitmap>>();
const pixels = new Map<string, Promise<TilePixels>>();

/** Each tile is downloaded once per visit; a failed one is retried the next time it is asked for. */
function once<T>(cache: Map<string, Promise<T>>, url: string, make: () => Promise<T>): Promise<T> {
  let entry = cache.get(url);
  if (!entry) {
    entry = make().catch((err: unknown) => {
      cache.delete(url);
      throw err;
    });
    cache.set(url, entry);
  }
  return entry;
}

export function loadTileBitmap(url: string): Promise<ImageBitmap> {
  return once(bitmaps, url, async () => {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(TILE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Moon Trek tile: HTTP ${res.status}`);
    return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  });
}

/** The tile's raw pixel values, for reading data layers. */
export function loadTilePixels(url: string): Promise<TilePixels> {
  return once(pixels, url, async () => {
    const bitmap = await loadTileBitmap(url);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width };
  });
}
