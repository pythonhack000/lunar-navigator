import { describe, expect, it } from 'vitest';
import { metresPerPixel, TILE_PX, TREK_LAYERS, trekPixel, trekPixelNorth, trekShare, type TilePixels } from '../moonTrek';

/** A tile whose every pixel is the given grey and alpha. */
function flatTile(grey: number, alpha = 255): TilePixels {
  const data = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  for (let i = 0; i < data.length; i += 4) data.set([grey, grey, grey, alpha], i);
  return { data, width: TILE_PX };
}

describe('trekPixel', () => {
  it('puts the pole at the centre of the grid', () => {
    const { x, y } = trekPixel(-90, 0, 5);
    expect(x).toBeCloseTo(TILE_PX * 2 ** 5 / 2, 6);
    expect(y).toBeCloseTo(TILE_PX * 2 ** 5 / 2, 6);
  });

  it('finds the Shackleton rim in the tile Moon Trek serves for it', () => {
    // Checked against the live WAC illumination tile 5/16/15, pixel (213, 45).
    const { x, y } = trekPixel(-89.45, -137, 5);
    expect(Math.floor(y / TILE_PX)).toBe(16);
    expect(Math.floor(x / TILE_PX)).toBe(15);
    expect(x % TILE_PX).toBeCloseTo(213.5, 0);
    expect(y % TILE_PX).toBeCloseTo(45.6, 0);
  });

  it('puts longitude 0 below the pole and 90°E to its right', () => {
    const pole = trekPixel(-90, 0, 6);
    const prime = trekPixel(-89, 0, 6);
    const east = trekPixel(-89, 90, 6);
    expect(prime.y).toBeLessThan(pole.y);
    expect(prime.x).toBeCloseTo(pole.x, 6);
    expect(east.x).toBeGreaterThan(pole.x);
  });

  it('halves the pixel size with each zoom level', () => {
    expect(metresPerPixel(6)).toBeCloseTo(metresPerPixel(5) / 2, 9);
  });
});

describe('trekShare', () => {
  it('reads the grey level as a share and asks for the right tile', async () => {
    const urls: string[] = [];
    const share = await trekShare(TREK_LAYERS.sunlight, -89.45, -137, async (url) => {
      urls.push(url);
      return flatTile(227);
    });
    expect(share).toBeCloseTo(227 / 255, 6);
    expect(urls).toEqual(['https://trek.nasa.gov/tiles/Moon/SP/WAC_POLE_ILL_PCT_SOUTH_100M/1.0.0/default/default028mm/5/16/15.png']);
  });

  it('returns null for a transparent (no data) pixel', async () => {
    await expect(trekShare(TREK_LAYERS.sunlight, -89, 0, async () => flatTile(90, 0))).resolves.toBeNull();
  });

  it('returns null north of the layer without downloading anything', async () => {
    let called = false;
    const share = await trekShare(TREK_LAYERS.sunlight, -87, 0, async () => {
      called = true;
      return flatTile(255);
    });
    expect(share).toBeNull();
    expect(called).toBe(false);
  });

  it('passes a failed download on to the caller', async () => {
    await expect(trekShare(TREK_LAYERS.sunlight, -89, 0, () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  });
});

describe('trekPixelNorth', () => {
  it('mirrors the south: longitude 0 lies below the north pole, 90°E to its right', () => {
    const pole = trekPixelNorth(90, 0, 6);
    expect(pole.x).toBeCloseTo(TILE_PX * 2 ** 6 / 2, 6);
    expect(trekPixelNorth(89, 0, 6).y).toBeGreaterThan(pole.y);
    expect(trekPixelNorth(89, 90, 6).x).toBeGreaterThan(pole.x);
  });
});
