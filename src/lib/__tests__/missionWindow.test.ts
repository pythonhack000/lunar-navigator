import { describe, expect, test } from 'vitest';
import type { HorizonProfile } from '../horizon';
import { DEFAULT_REQUIREMENTS, findWindows, missionSeries } from '../missionWindow';
import type { Timeline } from '../visibility';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2027, 0, 1);

const bits = (values: number[]) => Uint8Array.from(values);
const req = { ...DEFAULT_REQUIREMENTS, durationDays: 2, minSunShare: 1, minLinkShare: 0.5 };

describe('findWindows', () => {
  test('merges neighbouring valid landing times into one window', () => {
    // Twelve daily samples: a sunny stretch on days 2-7, the link up throughout.
    const sun = bits([0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    const link = bits(Array(12).fill(1));
    const windows = findWindows({ sun, link }, START, DAY, req);
    expect(windows).toHaveLength(1);
    expect(windows[0].from).toBe(START + 2 * DAY);
    expect(windows[0].to).toBe(START + 6 * DAY);
    expect(windows[0].sunShare).toBe(1);
  });

  test('finds nothing when the requirement cannot be met', () => {
    const none = bits(Array(12).fill(0));
    expect(findWindows({ sun: none, link: none }, START, DAY, req)).toEqual([]);
  });

  test('keeps separate windows apart, and rejects a span running past the data', () => {
    const sun = bits([1, 1, 1, 0, 0, 1, 1]);
    const link = bits(Array(7).fill(1));
    const windows = findWindows({ sun, link }, START, DAY, req);
    expect(windows.map((w) => w.from)).toEqual([START, START + 5 * DAY]);
  });

  test('checks the link share as well as the sun', () => {
    const sun = bits(Array(8).fill(1));
    const link = bits([0, 0, 0, 0, 1, 1, 1, 1]);
    const windows = findWindows({ sun, link }, START, DAY, { ...req, minLinkShare: 1 });
    expect(windows[0].from).toBe(START + 4 * DAY);
  });

  test('returns nothing for a duration longer than the data', () => {
    const ones = bits([1, 1]);
    expect(findWindows({ sun: ones, link: ones }, START, DAY, { ...req, durationDays: 30 })).toEqual([]);
  });
});

describe('missionSeries', () => {
  const profile: HorizonProfile = { elevationsDeg: new Float32Array(720).fill(2), siteHeightM: 0, stepDeg: 0.5 };
  const timeline: Timeline = {
    start: START,
    stepMs: HOUR,
    sun: Float32Array.of(1, 0),
    earth: Float32Array.of(1, 1),
    sunElevation: Float32Array.of(5, -1),
    sunAzimuth: Float32Array.of(0, 0),
    earthElevation: Float32Array.of(5, 2.5),
    earthAzimuth: Float32Array.of(0, 0),
  };

  test('needs the Earth clear of the terrain by the antenna mask, and a DSN station', () => {
    const withStation = missionSeries(timeline, profile, Int8Array.of(0, 0), 1);
    expect([...withStation.sun]).toEqual([1, 0]);
    expect([...withStation.link]).toEqual([1, 0]);
    expect([...missionSeries(timeline, profile, Int8Array.of(-1, 0), 0).link]).toEqual([0, 1]);
  });
});
