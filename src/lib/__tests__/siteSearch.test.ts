import { describe, expect, test } from 'vitest';
import { distanceKm } from '../candidates';
import type { LightMap } from '../lightMap';
import { judgeSpot, needMargin, periodSpan, rankHits, searchCandidates, type SearchCriteria, type SearchHit } from '../siteSearch';

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
const DAY = 86_400_000;

const criteria: SearchCriteria = {
  sun: { op: 'atLeast', value: 0.7 },
  link: { op: 'atLeast', value: 0.3 },
  antennaMaskDeg: 1,
  maxSlopeDeg: 15,
  maxIceKm: null,
};

describe('searchCandidates', () => {
  const map = makeMap(size, {
    [at(30, 30)]: [0, 255], // permanent shadow (ice)
    [at(34, 30)]: [230, 0], // bright, 4 km from ice
    [at(6, 6)]: [250, 0], // brightest, ~34 km from ice
    [at(50, 50)]: [20, 0], // nearly always dark
  });

  test('tries the brightest spots first when sunlight is wanted', () => {
    const [first, second] = searchCandidates(map, flat, criteria, 2);
    expect(Math.round(first.annualLight * 255)).toBe(250);
    expect(Math.round(second.annualLight * 255)).toBe(230);
  });

  test('tries the darkest spots first when sunlight must stay low', () => {
    const [first] = searchCandidates(map, flat, { ...criteria, sun: { op: 'atMost', value: 0.2 } }, 1);
    expect(first.annualLight).toBe(0);
  });

  test('keeps spots at least a few km apart', () => {
    const spots = searchCandidates(map, flat, { ...criteria, sun: null }, 40);
    expect(spots.length).toBe(40);
    for (const a of spots) for (const b of spots) if (a !== b) expect(distanceKm(a, b)).toBeGreaterThanOrEqual(3);
  });

  test('a limit on the drive to ice keeps only spots near it', () => {
    const spots = searchCandidates(map, flat, { ...criteria, maxIceKm: 6 }, 5);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(s.iceKm).not.toBeNull();
    for (const s of spots) expect(s.iceKm!).toBeLessThanOrEqual(6);
  });

  test('drops spots steeper than allowed', () => {
    const steep = { heightAt: (lat: number) => lat * 1e6 };
    expect(searchCandidates(map, steep, criteria, 10)).toHaveLength(0);
  });
});

describe('needMargin', () => {
  test('a floor is met by anything above it', () => {
    expect(needMargin(0.9, { op: 'atLeast', value: 0.7 })).toBeCloseTo(0.2, 5);
    expect(needMargin(0.5, { op: 'atLeast', value: 0.7 })).toBeCloseTo(-0.2, 5);
  });

  test('a ceiling is met by anything below it', () => {
    expect(needMargin(0.1, { op: 'atMost', value: 0.3 })).toBeCloseTo(0.2, 5);
    expect(needMargin(0.4, { op: 'atMost', value: 0.3 })).toBeCloseTo(-0.1, 5);
  });
});

describe('judgeSpot', () => {
  const spot = { lat: -89, lon: 0, annualLight: 0.8, slopeDeg: 3, iceKm: 4 };

  test('fits when every need is met, with the smallest surplus as margin', () => {
    const hit = judgeSpot(spot, 0.9, 0.4, criteria);
    expect(hit.fits).toBe(true);
    expect(hit.margin).toBeCloseTo(0.1, 5);
  });

  test('misses when one need falls short, by how much', () => {
    const hit = judgeSpot(spot, 0.95, 0.1, criteria);
    expect(hit.fits).toBe(false);
    expect(hit.margin).toBeCloseTo(-0.2, 5);
  });

  test('a need left as "any" is not judged', () => {
    const hit = judgeSpot(spot, 0.1, 0.9, { ...criteria, sun: null });
    expect(hit.fits).toBe(true);
    expect(hit.margin).toBeCloseTo(0.6, 5);
  });
});

describe('rankHits', () => {
  const hit = (lat: number, fits: boolean, margin: number): SearchHit => ({
    lat, lon: 0, annualLight: 0.8, slopeDeg: 2, iceKm: 3, sunShare: 0.8, linkShare: 0.5, fits, margin,
  });

  test('puts every fitting spot first, widest margin first, then the near misses', () => {
    const ranked = rankHits([hit(-88, false, -0.01), hit(-89, true, 0.05), hit(-87, true, 0.2), hit(-86, false, -0.3)]);
    expect(ranked.map((h) => h.lat)).toEqual([-87, -89, -88, -86]);
  });
});

describe('periodSpan', () => {
  const day = (n: number) => Date.UTC(2026, 10, n);

  test('one date means that whole day', () => {
    expect(periodSpan({ kind: 'dates', from: day(14) + 5 * 3_600_000, to: day(14) }, 0)).toMatchObject({ start: day(14), spanMs: DAY });
  });

  test('a stretch of dates covers both ends, whichever order they come in', () => {
    expect(periodSpan({ kind: 'dates', from: day(20), to: day(14) }, 0)).toMatchObject({ start: day(14), spanMs: 7 * DAY });
  });

  test('a year starts today and is sampled more coarsely', () => {
    const span = periodSpan({ kind: 'year' }, day(14) + 1000);
    expect(span.start).toBe(day(14));
    expect(span.spanMs).toBe(365 * DAY);
    expect(span.stepMs).toBeGreaterThan(periodSpan({ kind: 'dates', from: day(1), to: day(2) }, 0).stepMs);
  });
});
