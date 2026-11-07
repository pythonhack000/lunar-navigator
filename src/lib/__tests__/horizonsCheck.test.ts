import { describe, expect, test } from 'vitest';
import reference from '../../data/horizonsReference.json';
import { compareWithHorizons, skyAngleDeg } from '../horizonsCheck';

describe('skyAngleDeg', () => {
  test('measures along the sky, so azimuth counts for little near the zenith', () => {
    expect(skyAngleDeg(10, 0, 10, 0)).toBeCloseTo(0, 6);
    expect(skyAngleDeg(0, 0, 90, 0)).toBeCloseTo(90, 6);
    expect(skyAngleDeg(0, 89.99, 180, 89.99)).toBeLessThan(0.03);
  });
});

describe('compareWithHorizons', () => {
  test('our Sun and Earth agree with NASA/JPL Horizons across two years', () => {
    const result = compareWithHorizons(reference.samples);
    expect(result.rows).toBe(200);
    // Measured 0.006° and 0.003°: far below the Sun's own 0.27° radius and the terrain's precision.
    expect(result.sun.maxDeg).toBeLessThan(0.02);
    expect(result.earth.maxDeg).toBeLessThan(0.02);
  });
});
