import { describe, expect, test } from 'vitest';
import { buildShareQuery, parseShareQuery } from '../shareLink';

const T1 = Date.UTC(2027, 2, 14, 6);
const T2 = Date.UTC(2027, 3, 1, 12);

describe('share links', () => {
  test('round-trips a site, a date and scenarios with dates', () => {
    const query = buildShareQuery({
      lang: 'en',
      site: { id: 'nobile', lat: -85.3, lon: 37 },
      time: T1,
      compare: [{ id: 'nobile', lat: -85.3, lon: 37, at: T2 }, { id: null, lat: 1.5, lon: -2.25 }],
    });
    const parsed = parseShareQuery(query);
    expect(parsed.site).toEqual({ id: 'nobile', lat: -85.3, lon: 37 });
    expect(parsed.time).toBe(T1);
    expect(parsed.compare).toEqual([{ id: 'nobile', lat: -85.3, lon: 37, at: T2 }, { id: null, lat: 1.5, lon: -2.25 }]);
  });

  test('returns nothing for a link without a state', () => {
    expect(parseShareQuery('?lang=ru')).toEqual({ compare: [] });
  });

  test('ignores coordinates that are out of range or not numbers', () => {
    expect(parseShareQuery('?lat=95&lon=10').site).toBeUndefined();
    expect(parseShareQuery('?lat=abc&lon=10').site).toBeUndefined();
    expect(parseShareQuery('?lat=10').site).toBeUndefined();
    expect(parseShareQuery('?lat=&lon=').site).toBeUndefined();
  });

  test('drops an id with unexpected characters but keeps the place', () => {
    expect(parseShareQuery('?lat=10&lon=20&id=<script>').site).toEqual({ id: null, lat: 10, lon: 20 });
  });

  test('ignores an impossible date', () => {
    expect(parseShareQuery('?t=not-a-date').time).toBeUndefined();
    expect(parseShareQuery('?t=9999-01-01T00:00Z').time).toBeUndefined();
  });

  test('keeps at most four valid scenarios and skips broken ones', () => {
    const c = ['1,2', 'x,2', '3,4', '5,6', '7,8', '9,10'].join('|');
    expect(parseShareQuery(`?c=${encodeURIComponent(c)}`).compare.map((s) => s.lat)).toEqual([1, 3, 5, 7]);
  });
});
