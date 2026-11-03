import { describe, expect, it } from 'vitest';
import { findSunlitNearIce, findSunniest, type LightMap } from '../lightMap';

function makeMap(size: number, pixels: Record<number, [number, number]>): LightMap {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) data[i * 4 + 2] = 255;
  for (const [index, [lit, shadowed]] of Object.entries(pixels)) {
    data[Number(index) * 4] = lit;
    data[Number(index) * 4 + 1] = shadowed;
  }
  // 1 km per pixel: 2 * rhoMax * 1737.4 / size = 1.
  return { data, width: size, height: size, rhoMax: size / (2 * 1737.4) };
}

describe('light map search', () => {
  const size = 64;
  const at = (col: number, row: number) => row * size + col;
  const map = makeMap(size, {
    [at(5, 5)]: [250, 0], // brightest, but far from ice
    [at(40, 40)]: [0, 255], // permanent shadow
    [at(43, 40)]: [200, 0], // 3 km from the shadow
    [at(52, 40)]: [230, 0], // 12 km away: too far
  });

  it('finds the brightest pixel anywhere', () => {
    const spot = findSunniest(map);
    expect(spot.lat).toBeLessThan(-80);
  });

  it('prefers a bright pixel within reach of permanent shadow', () => {
    const near = findSunlitNearIce(map);
    const brightest = findSunniest(map);
    expect(near).not.toEqual(brightest);
    // Pixel (43, 40) is right of centre and below it: x > 0, y < 0.
    expect(near.lon).toBeLessThan(0);
    expect(near.lon).toBeGreaterThan(-90);
  });
});
