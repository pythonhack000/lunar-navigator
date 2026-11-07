import { describe, expect, test } from 'vitest';
import { librationRange, subEarthPoint } from '../libration';

const START = Date.UTC(2027, 0, 1);
const DAY = 86_400_000;

describe('subEarthPoint', () => {
  test('stays within the published libration limits of the near side centre', () => {
    for (let k = 0; k < 40; k++) {
      const p = subEarthPoint(START + k * DAY);
      expect(Math.abs(p.lat)).toBeLessThan(7.5);
      expect(Math.abs(p.lon)).toBeLessThan(8.5);
    }
  });
});

describe('librationRange', () => {
  test('swings by several degrees in both directions over a month', () => {
    const range = librationRange(START, 30 * DAY, DAY);
    expect(range.lats).toHaveLength(31);
    expect(range.maxLat - range.minLat).toBeGreaterThan(8);
    expect(range.maxLon - range.minLon).toBeGreaterThan(6);
  });
});
