import { siteSky } from './topocentric';
import { DEG } from './vec';

/** Positions downloaded from NASA/JPL Horizons by scripts/fetch_horizons.py. */
export interface HorizonsSample {
  lat: number;
  lon: number;
  body: string;
  rows: readonly { time: string; az: number; el: number }[];
}

export interface BodyError {
  meanDeg: number;
  maxDeg: number;
}

export interface HorizonsComparison {
  rows: number;
  sun: BodyError;
  earth: BodyError;
}

/** Angle on the sky between two directions given as azimuth and elevation, degrees. */
export function skyAngleDeg(az1: number, el1: number, az2: number, el2: number): number {
  const a = Math.sin(((el2 - el1) * DEG) / 2) ** 2 + Math.cos(el1 * DEG) * Math.cos(el2 * DEG) * Math.sin(((az2 - az1) * DEG) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / DEG;
}

const summarize = (errors: readonly number[]): BodyError => ({
  meanDeg: errors.reduce((sum, e) => sum + e, 0) / Math.max(1, errors.length),
  maxDeg: errors.reduce((max, e) => Math.max(max, e), 0),
});

/** Runs our own ephemeris for every Horizons row. Horizons heights are zero on the reference sphere. */
export function compareWithHorizons(samples: readonly HorizonsSample[]): HorizonsComparison {
  const errors: Record<'sun' | 'earth', number[]> = { sun: [], earth: [] };
  for (const sample of samples) {
    const body = sample.body === 'sun' ? 'sun' : 'earth';
    for (const row of sample.rows) {
      const sky = siteSky({ lat: sample.lat, lon: sample.lon, heightM: 0 }, new Date(row.time));
      errors[body].push(skyAngleDeg(sky[body].azDeg, sky[body].elDeg, row.az, row.el));
    }
  }
  return { rows: errors.sun.length + errors.earth.length, sun: summarize(errors.sun), earth: summarize(errors.earth) };
}
