import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import { describe, expect, test } from 'vitest';
import { DSN_MIN_ELEVATION_DEG, DSN_STATIONS, linkSeries, linkShare, moonElevationDeg, sampleDsn } from '../dsn';
import { HOUR_MS, DAY_MS } from '../format';

const START = Date.UTC(2026, 10, 1);

describe('moonElevationDeg', () => {
  test('matches astronomy-engine topocentric altitude within a fraction of a degree', () => {
    for (const station of DSN_STATIONS) {
      for (const hours of [0, 7, 13, 21]) {
        const date = new Date(START + hours * HOUR_MS);
        const observer = new Observer(station.lat, station.lon, station.heightM);
        const eq = Equator(Body.Moon, date, observer, true, false);
        const reference = Horizon(date, observer, eq.ra, eq.dec).altitude;
        expect(Math.abs(moonElevationDeg(station, date) - reference)).toBeLessThan(0.5);
      }
    }
  });
});

describe('sampleDsn', () => {
  const month = sampleDsn(START, 30 * DAY_MS, HOUR_MS);

  test('each station tracks the Moon for a good part, but not all, of the month', () => {
    DSN_STATIONS.forEach((_, i) => {
      let up = 0;
      for (let k = 0; k < month.elevation[i].length; k++) if (month.elevation[i][k] >= DSN_MIN_ELEVATION_DEG) up++;
      const share = up / month.elevation[i].length;
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.7);
    });
  });

  test('the three complexes together cover nearly the whole month', () => {
    let covered = 0;
    for (const s of month.station) if (s >= 0) covered++;
    expect(covered / month.station.length).toBeGreaterThan(0.85);
  });

  test('picks the station with the Moon highest in its sky, or none below the minimum', () => {
    for (let k = 0; k < month.station.length; k++) {
      const elevations = DSN_STATIONS.map((_, i) => month.elevation[i][k]);
      const best = Math.max(...elevations);
      if (best < DSN_MIN_ELEVATION_DEG) expect(month.station[k]).toBe(-1);
      else expect(elevations[month.station[k]]).toBe(best);
    }
  });
});

describe('linkSeries', () => {
  const dsn = { start: 0, stepMs: 1, elevation: [], station: Int8Array.from([0, 1, -1, 2, 2]) };

  test('carries a station only while the Earth is in view from the site', () => {
    const earth = Float32Array.from([1, 0.2, 1, 0.6, 0]);
    expect(Array.from(linkSeries(earth, dsn))).toEqual([0, -1, -1, 2, -1]);
  });

  test('measures the share of time with a link, alone or together with sunlight', () => {
    const link = Int8Array.from([0, -1, 1, 2]);
    expect(linkShare(link)).toBeCloseTo(0.75);
    expect(linkShare(link, Float32Array.from([1, 1, 0, 1]))).toBeCloseTo(0.5);
  });
});
