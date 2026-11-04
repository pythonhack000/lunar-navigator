import { describe, expect, test } from 'vitest';
import { iceFactor, siteScore, slopeFactor, SLOPE_SAFE_DEG, SLOPE_MAX_DEG } from '../siteScore';
import { slopeDeg } from '../slope';
import type { Terrain } from '../terrain';

const MOON_RADIUS_M = 1_737_400;
const DEG = Math.PI / 180;

/** A plane rising northward at `deg` degrees around 89°S. */
const tilted = (deg: number): Terrain => ({
  heightAt: (lat) => (lat + 89) * DEG * MOON_RADIUS_M * Math.tan(deg * DEG),
});

describe('slopeDeg', () => {
  test('reads a flat surface as level', () => {
    expect(slopeDeg({ heightAt: () => 1234 }, -89, 40)).toBeCloseTo(0, 6);
  });

  test('recovers the tilt of an inclined plane, whatever the longitude', () => {
    for (const lon of [-170, -45, 0, 90]) expect(slopeDeg(tilted(10), -89, lon)).toBeCloseTo(10, 1);
  });
});

describe('score factors', () => {
  test('slope is fully safe up to the lander limit and unusable past the maximum', () => {
    expect(slopeFactor(0)).toBe(1);
    expect(slopeFactor(SLOPE_SAFE_DEG)).toBe(1);
    expect(slopeFactor((SLOPE_SAFE_DEG + SLOPE_MAX_DEG) / 2)).toBeCloseTo(0.5);
    expect(slopeFactor(SLOPE_MAX_DEG + 5)).toBe(0);
  });

  test('ice counts most when close and not at all when out of reach', () => {
    expect(iceFactor(0.5)).toBe(1);
    expect(iceFactor(30)).toBe(0);
    expect(iceFactor(null)).toBe(0);
    expect(iceFactor(5)).toBeGreaterThan(iceFactor(10));
  });
});

describe('siteScore', () => {
  test('a perfect site scores 100 and a hopeless one 0', () => {
    expect(siteScore({ sunShare: 1, linkShare: 1, slopeDeg: 2, iceKm: 1 }).total).toBe(100);
    expect(siteScore({ sunShare: 0, linkShare: 0, slopeDeg: 30, iceKm: null }).total).toBe(0);
  });

  test('weighs power most, then link and terrain, then ice', () => {
    const base = { sunShare: 0.5, linkShare: 0.5, slopeDeg: 5, iceKm: 3 };
    const more = (patch: Partial<typeof base>) => siteScore({ ...base, ...patch }).total;
    expect(more({ sunShare: 1 })).toBeGreaterThan(more({ linkShare: 1 }));
    expect(more({ linkShare: 1 })).toBeGreaterThan(siteScore(base).total);
  });

  test('reports each part on a 0..1 scale', () => {
    const { parts } = siteScore({ sunShare: 0.8, linkShare: 0.4, slopeDeg: 12, iceKm: 8 });
    for (const v of Object.values(parts)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
