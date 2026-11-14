import { describe, expect, test } from 'vitest';
import { computeHorizon, horizonAt } from '../horizon';
import { flatTerrain, type Terrain } from '../terrain';
import { discFractionAbove, sampleTimeline, summarizeTimeline } from '../visibility';

describe('computeHorizon', () => {
  test('dips slightly below level on a smooth sphere because of curvature', () => {
    // Act
    const profile = computeHorizon(flatTerrain, -20, 40, { azimuthSteps: 36 });

    // Assert: a 2 m observer sees the horizon about 0.05° down
    for (const el of profile.elevationsDeg) {
      expect(el).toBeLessThan(0);
      expect(el).toBeGreaterThan(-0.3);
    }
  });

  test('raises the horizon toward a mountain and leaves other directions low', () => {
    // Arrange: a 5 km ridge running north–south, 30 km east of the site at the equator
    const ridgeLon = 30 / 30.32; // ~30.32 km per degree at the equator
    const ridge: Terrain = { heightAt: (_lat, lon) => (Math.abs(lon - ridgeLon) < 0.05 ? 5000 : 0) };

    // Act
    const profile = computeHorizon(ridge, 0, 0, { azimuthSteps: 72, maxDistanceKm: 120 });

    // Assert
    const east = horizonAt(profile, 90);
    const west = horizonAt(profile, 270);
    expect(east).toBeGreaterThan(8);
    expect(east).toBeLessThan(10.5);
    expect(west).toBeLessThan(0);
  });

  test('interpolates between azimuth samples and wraps past north', () => {
    const profile = { elevationsDeg: new Float32Array([0, 10, 20, 30]), stepDeg: 90, siteHeightM: 0 };
    expect(horizonAt(profile, 45)).toBeCloseTo(5);
    expect(horizonAt(profile, 315)).toBeCloseTo(15);
    expect(horizonAt(profile, -45)).toBeCloseTo(15);
  });
});

describe('discFractionAbove', () => {
  test('is half when the horizon crosses the centre of the disc', () => {
    expect(discFractionAbove(1, 1, 0.27)).toBeCloseTo(0.5);
  });

  test('is fully visible or fully hidden beyond one radius', () => {
    expect(discFractionAbove(2, 1, 0.27)).toBe(1);
    expect(discFractionAbove(0, 1, 0.27)).toBe(0);
  });
});

describe('timeline', () => {
  test('gives an equatorial site half of each month in daylight, a ~354 h night and constant Earth view', () => {
    // Arrange: two synodic months so at least one whole night falls inside the window
    const site = { lat: 0, lon: 0, heightM: 0 };
    const profile = computeHorizon(flatTerrain, 0, 0, { azimuthSteps: 36 });

    // Act
    const timeline = sampleTimeline(site, profile, Date.UTC(2026, 10, 14), 2 * 29.53 * 86_400_000, 3_600_000);
    const summary = summarizeTimeline(timeline);

    // Assert
    expect(summary.sunlitShare).toBeGreaterThan(0.45);
    expect(summary.sunlitShare).toBeLessThan(0.55);
    expect(summary.earthShare).toBe(1);
    expect(summary.longestDarkHours).toBeGreaterThan(335);
    expect(summary.longestDarkHours).toBeLessThan(370);
  });
});
