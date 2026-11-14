import { describe, expect, test } from 'vitest';
import { analyzePeriod, PERIOD_DAYS, periodRange } from '../periodReport';
import { DAY_MS, HOUR_MS } from '../format';
import { computeHorizon } from '../horizon';

const flat = { heightAt: () => 0 };
const NOW = Date.UTC(2026, 10, 4, 10);
const SITE = { lat: -89.5, lon: 0 };
const PROFILE = computeHorizon(flat, SITE.lat, SITE.lon);

describe('periodRange', () => {
  test('presets start today and run their length', () => {
    const r = periodRange('month', NOW, '', '');
    expect(r.start).toBe(Date.UTC(2026, 10, 4));
    expect(r.spanMs).toBeCloseTo(PERIOD_DAYS.month * DAY_MS);
  });

  test('custom dates may come in either order and last at least a day', () => {
    const r = periodRange('custom', NOW, '2026-12-10', '2026-12-01');
    expect(r.start).toBe(Date.UTC(2026, 11, 1));
    expect(r.spanMs).toBe(9 * DAY_MS);
    expect(periodRange('custom', NOW, '2026-12-01', '2026-12-01').spanMs).toBe(DAY_MS);
  });

  test('unreadable custom dates fall back to a month from today', () => {
    const r = periodRange('custom', NOW, 'nonsense', '');
    expect(r.start).toBe(Date.UTC(2026, 10, 4));
    expect(r.spanMs).toBeCloseTo(PERIOD_DAYS.month * DAY_MS);
  });
});

describe('analyzePeriod', () => {
  test('samples hourly for short periods and every 3 hours for long ones', () => {
    const week = analyzePeriod(SITE, PROFILE, { start: NOW, spanMs: 7 * DAY_MS });
    const quarter = analyzePeriod(SITE, PROFILE, { start: NOW, spanMs: 90 * DAY_MS });
    expect(week.timeline.stepMs).toBe(HOUR_MS);
    expect(quarter.timeline.stepMs).toBe(3 * HOUR_MS);
    expect(week.link.length).toBe(week.timeline.sun.length);
  });

  test('reports shares between 0 and 1', () => {
    const r = analyzePeriod(SITE, PROFILE, { start: NOW, spanMs: 7 * DAY_MS });
    for (const v of [r.summary.sunlitShare, r.linkShare, r.powerLinkShare]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
