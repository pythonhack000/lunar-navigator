import { describe, expect, test } from 'vitest';
import { bestLandingDays, stationShares } from '../report';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const start = Date.UTC(2026, 10, 1);

describe('bestLandingDays', () => {
  test('ranks days by hours with both sunlight and a DSN link', () => {
    const n = 3 * 24;
    const sun = new Float32Array(n).fill(1);
    const link = new Int8Array(n).fill(-1);
    for (let h = 24; h < 24 + 20; h++) link[h] = 0; // day 2: 20 h
    for (let h = 48; h < 48 + 5; h++) link[h] = 1; // day 3: 5 h
    const days = bestLandingDays({ start, stepMs: HOUR, sun }, link, 2);
    expect(days.map((d) => [d.day, d.hours])).toEqual([[start + DAY, 20], [start + 2 * DAY, 5]]);
  });

  test('skips days with no usable hour', () => {
    const sun = new Float32Array(24).fill(0);
    const link = new Int8Array(24).fill(0);
    expect(bestLandingDays({ start, stepMs: HOUR, sun }, link, 5)).toEqual([]);
  });
});

describe('stationShares', () => {
  test('splits the link time between the stations that carry it', () => {
    const shares = stationShares(Int8Array.from([0, 0, 1, -1, 2, 2, 2, -1]), 3);
    expect(shares).toEqual([2 / 6, 1 / 6, 3 / 6]);
  });
});
