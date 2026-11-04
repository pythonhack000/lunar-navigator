import { describe, expect, test } from 'vitest';
import { distanceKm } from '../candidates';
import { combineYears, illuminationOverYear, ourValue, REFERENCES, searchPoints } from '../validation';

const flat = { heightAt: () => 0 };
const START = Date.UTC(2026, 0, 1);

describe('illuminationOverYear', () => {
  const result = illuminationOverYear(flat, -89.5, 0, START);

  test('on a flat pole the Sun skims the horizon: up roughly half the year', () => {
    expect(result.sunlitShare).toBeGreaterThan(0.3);
    expect(result.sunlitShare).toBeLessThan(0.7);
  });

  test('with no mountains to stand on, nights last weeks, not hours', () => {
    expect(result.longestDarkDays).toBeGreaterThan(7);
  });

  test('reads each reference metric in its own units', () => {
    const sunlit = REFERENCES.find((r) => r.metric === 'sunlit')!;
    const dark = REFERENCES.find((r) => r.metric === 'longestDarkDays')!;
    expect(ourValue(sunlit, result)).toBe(result.sunlitShare);
    expect(ourValue(dark, result)).toBe(result.longestDarkDays);
  });
});

describe('REFERENCES', () => {
  test('every published value is in range and cites its source', () => {
    for (const r of REFERENCES) {
      expect(r.source).toMatch(/\d{4}/);
      if (r.metric === 'sunlit') expect(r.value).toBeGreaterThan(0.5);
      if (r.metric === 'sunlit') expect(r.value).toBeLessThanOrEqual(1);
    }
  });
});

describe('searchPoints', () => {
  test('rings the pin at the search radii', () => {
    const points = searchPoints(-89.3, -113);
    expect(points[0]).toEqual({ lat: -89.3, lon: -113 });
    expect(points).toHaveLength(1 + 4 * 8);
    for (const p of points.slice(1)) {
      const km = distanceKm(points[0], p);
      expect(km).toBeGreaterThan(0.5);
      expect(km).toBeLessThan(3.1);
    }
  });
});

describe('combineYears', () => {
  test('averages the sunlit share and takes the median longest night', () => {
    const years = [
      { sunlitShare: 0.8, longestDarkDays: 3 },
      { sunlitShare: 0.9, longestDarkDays: 10 },
      { sunlitShare: 0.7, longestDarkDays: 4 },
    ];
    const combined = combineYears(years);
    expect(combined.sunlitShare).toBeCloseTo(0.8);
    expect(combined.longestDarkDays).toBe(4);
  });
});
