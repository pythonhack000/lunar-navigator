import { describe, expect, test } from 'vitest';
import { distanceKm } from '../candidates';
import { flatTerrain } from '../terrain';
import { cellMetrics, dateSlips, gridOffsets, offsetPoint, radiusForLat } from '../whatIf';
import { computeHorizon } from '../horizon';

const START = Date.UTC(2027, 0, 1);
const HOUR = 3_600_000;

describe('offsetPoint', () => {
  test('moves the requested distance, even a few kilometres from the pole', () => {
    const from = { lat: -89.45, lon: -137 };
    const to = offsetPoint(from.lat, from.lon, 3, 4);
    expect(distanceKm(from, to)).toBeCloseTo(5, 1);
  });

  test('moving north raises the latitude at mid latitudes, and zero stays put', () => {
    expect(offsetPoint(10, 20, 30, 0).lat).toBeGreaterThan(10);
    expect(offsetPoint(10, 20, 0, 0).lat).toBeCloseTo(10, 6);
    expect(offsetPoint(10, 20, 0, 0).lon).toBeCloseTo(20, 6);
  });
});

describe('gridOffsets', () => {
  test('is a square centred on the site', () => {
    const grid = gridOffsets(5, 5);
    expect(grid).toHaveLength(25);
    expect(grid[12]).toEqual({ kmNorth: 0, kmEast: 0 });
    expect(grid[0]).toEqual({ kmNorth: 5, kmEast: -5 });
    expect(grid[24]).toEqual({ kmNorth: -5, kmEast: 5 });
  });
});

describe('radiusForLat', () => {
  test('widens where the terrain grid is coarser', () => {
    expect(radiusForLat(-89)).toBeLessThan(radiusForLat(-70));
    expect(radiusForLat(-70)).toBeLessThan(radiusForLat(10));
  });
});

describe('cellMetrics', () => {
  test('gives shares between 0 and 1, with no link on the far side', () => {
    const cell = cellMetrics(flatTerrain, { lat: 0, lon: 180 }, START, 29 * 24 * HOUR, 12 * HOUR);
    expect(cell.sun).toBeGreaterThan(0.3);
    expect(cell.sun).toBeLessThan(0.7);
    expect(cell.link).toBe(0);
  });
});

describe('dateSlips', () => {
  test('gives one row per delay, shifting the mission start', () => {
    const profile = computeHorizon(flatTerrain, 0, 0);
    const slips = dateSlips({ lat: 0, lon: 0 }, profile, START, [0, 7, 14], 14);
    expect(slips.map((s) => s.delayDays)).toEqual([0, 7, 14]);
    // Half a lunar month of daylight at the equator: starting a week later changes the sunlit share.
    expect(new Set(slips.map((s) => s.sunShare.toFixed(2))).size).toBeGreaterThan(1);
  });
});
