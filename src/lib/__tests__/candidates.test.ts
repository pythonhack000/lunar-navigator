import { describe, expect, test } from 'vitest';
import { pickSpaced, prefilter } from '../candidates';
import type { LightMap } from '../lightMap';

/** 1 km per pixel; every pixel covered, lit share and shadow set per pixel. */
function makeMap(size: number, pixels: Record<number, [number, number]>): LightMap {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) data[i * 4 + 2] = 255;
  for (const [index, [lit, shadowed]] of Object.entries(pixels)) {
    data[Number(index) * 4] = lit;
    data[Number(index) * 4 + 1] = shadowed;
  }
  return { data, width: size, height: size, rhoMax: size / (2 * 1737.4) };
}

const flat = { heightAt: () => 0 };
const size = 64;
const at = (col: number, row: number) => row * size + col;

describe('prefilter', () => {
  const map = makeMap(size, {
    [at(30, 30)]: [0, 255], // permanent shadow (ice)
    [at(33, 30)]: [230, 0], // bright, 3 km from ice
    [at(36, 30)]: [120, 0], // too dim
    [at(5, 5)]: [250, 0], // bright but ~35 km from ice
  });

  test('keeps only bright spots with ice within reach', () => {
    const spots = prefilter(map, flat);
    expect(spots).toHaveLength(1);
    expect(spots[0].iceKm).toBeCloseTo(3, 0);
    expect(spots[0].annualLight).toBeCloseTo(230 / 255, 2);
  });

  test('drops spots that are too steep to land on', () => {
    const steep = { heightAt: (lat: number) => lat * 1e6 };
    expect(prefilter(map, steep)).toHaveLength(0);
  });
});

describe('pickSpaced', () => {
  const spot = (lat: number, lon: number, rank: number) => ({ lat, lon, rank });

  test('takes the best first and skips any too close to one already taken', () => {
    const picked = pickSpaced([spot(-89, 0, 3), spot(-89.001, 0, 2), spot(-88, 0, 1)], (s) => s.rank, 5, 10);
    expect(picked.map((s) => s.rank)).toEqual([3, 1]);
  });

  test('stops at the requested count', () => {
    const many = Array.from({ length: 20 }, (_, i) => spot(-80 - i * 0.5, 0, i));
    expect(pickSpaced(many, (s) => s.rank, 5, 1)).toHaveLength(5);
  });
});
