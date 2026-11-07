import { describe, expect, test } from 'vitest';
import type { SiteAnalysis } from '../../hooks/useSiteAnalysis';
import { DEFAULT_POWER } from '../../lib/power';
import { groundAnswer, groundLines, GROUND_QUESTIONS } from '../groundLines';

const HOUR = 3_600_000;
const NOW = Date.UTC(2027, 0, 1);

function analysisWith(sunUp: boolean, earthUp: boolean): SiteAnalysis {
  return {
    state: {
      time: NOW,
      sun: { elDeg: sunUp ? 2 : -3, visibleFraction: sunUp ? 1 : 0, azDeg: 0, distanceKm: 1, radiusDeg: 0.26, horizonDeg: 0 },
      earth: { elDeg: earthUp ? 4 : -5, visibleFraction: earthUp ? 1 : 0, azDeg: 0, distanceKm: 1, radiusDeg: 1, horizonDeg: 0 },
    },
    nextSunChange: NOW + 5 * HOUR,
    nextEarthChange: NOW + 7 * HOUR,
    linkNow: earthUp ? 0 : -1,
    site: { lat: -89, lon: 0, heightM: 0 },
  } as unknown as SiteAnalysis;
}

describe('groundAnswer', () => {
  const context = { analysis: analysisWith(true, true), score: { score: { total: 70, parts: { sun: 1, link: 1, slope: 1, ice: 1 } }, slopeDeg: 3, iceKm: 2 }, site: { id: null, name: 'Here', lat: -89, lon: 0 }, power: DEFAULT_POWER, lang: 'en' as const };

  test('points the right way when asked where the Sun or Earth is', () => {
    expect(groundAnswer('sun', context)[0].point).toBe('sun');
    expect(groundAnswer('earth', context)[0].point).toBe('earth');
  });

  test('has an answer for every question', () => {
    const full = { ...context, analysis: { ...context.analysis, timeline: { sunElevation: Float32Array.of(2), earthElevation: Float32Array.of(4) }, summary: { sunlitShare: 0.5, earthShare: 0.5, bothShare: 0.5, longestDarkHours: 10, longestCommsGapHours: 10 }, linkShare: 0.5, powerLinkShare: 0.5 } as never };
    for (const key of GROUND_QUESTIONS) expect(groundAnswer(key, full).length).toBeGreaterThan(0);
  });
});

describe('groundLines', () => {
  test('starts by inviting you to fly down together', () => {
    expect(groundLines(analysisWith(true, true), DEFAULT_POWER, 'en')[0].text).toContain('together');
  });

  test('points at the Sun and the Earth when talking about them', () => {
    const lines = groundLines(analysisWith(true, true), DEFAULT_POWER, 'en');
    expect(lines.find((l) => l.point === 'sun')?.text).toContain('sets in');
    expect(lines.find((l) => l.point === 'earth')?.text).toContain('Goldstone');
  });

  test('says when it is night and when the Earth is hidden', () => {
    const lines = groundLines(analysisWith(false, false), DEFAULT_POWER, 'ru');
    expect(lines.find((l) => l.point === 'sun')?.text).toContain('ночь');
    expect(lines.find((l) => l.point === 'earth')?.text).toContain('ретранслятор');
  });

  test('compares flat and upright panels with real numbers', () => {
    const line = groundLines(analysisWith(true, true), DEFAULT_POWER, 'en').find((l) => l.text.includes('flat'));
    expect(line?.text).toMatch(/\d+ W.*\d/);
  });
});
