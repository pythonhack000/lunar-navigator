import { GeoMoon, Observer, ObserverVector } from 'astronomy-engine';
import { DEG, dot, normalize, sub, type Vec3 } from './vec';

/**
 * NASA's Deep Space Network: three antenna complexes about 120° apart in longitude, so that one of
 * them can always see a spacecraft. A lunar lander has a direct link when the Earth is above its own
 * horizon AND the Moon is above one of these stations' horizons.
 */
export interface DsnStation {
  id: 'goldstone' | 'madrid' | 'canberra';
  name: string;
  /** Geodetic latitude and east longitude of the complex's main 70 m dish, degrees; height in m. */
  lat: number;
  lon: number;
  heightM: number;
  place: { en: string; ru: string };
  nameRu: string;
}

export const DSN_STATIONS: readonly DsnStation[] = [
  { id: 'goldstone', name: 'Goldstone', lat: 35.4267, lon: -116.89, heightM: 1002, place: { en: 'USA', ru: 'США' }, nameRu: 'Голдстоун' },
  { id: 'madrid', name: 'Madrid', lat: 40.4314, lon: -4.2481, heightM: 865, place: { en: 'Spain', ru: 'Испания' }, nameRu: 'Мадрид' },
  { id: 'canberra', name: 'Canberra', lat: -35.4014, lon: 148.9817, heightM: 689, place: { en: 'Australia', ru: 'Австралия' }, nameRu: 'Канберра' },
];

/** Antennas do not track below this elevation (terrain masks, atmosphere). */
export const DSN_MIN_ELEVATION_DEG = 10;

const toVec = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

/** Elevation of the Moon (geocentric position, AU) above a station's horizon, degrees. */
function elevationOf(moonGeo: Vec3, station: DsnStation, date: Date): number {
  const site = toVec(ObserverVector(date, new Observer(station.lat, station.lon, station.heightM), false));
  // The local vertical is taken along the radius; it differs from the ellipsoid normal by < 0.2°.
  const up = normalize(site);
  const toMoon = normalize(sub(moonGeo, site));
  return Math.asin(Math.max(-1, Math.min(1, dot(toMoon, up)))) / DEG;
}

/** Elevation of the Moon's centre above a station's horizon, degrees. */
export function moonElevationDeg(station: DsnStation, date: Date): number {
  return elevationOf(toVec(GeoMoon(date)), station, date);
}

export interface DsnTimeline {
  start: number;
  stepMs: number;
  /** Per station (DSN_STATIONS order), the Moon's elevation at each sample. */
  elevation: Float32Array[];
  /** Index of the station that would carry the link (Moon highest in its sky), or -1 for none. */
  station: Int8Array;
}

/**
 * Which complex can talk to the Moon at each sample. It does not depend on where on the Moon the
 * lander is (seen from the Earth the whole Moon spans half a degree), so one timeline serves every site.
 */
export function sampleDsn(start: number, spanMs: number, stepMs: number): DsnTimeline {
  const n = Math.floor(spanMs / stepMs) + 1;
  const elevation = DSN_STATIONS.map(() => new Float32Array(n));
  const station = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const date = new Date(start + k * stepMs);
    const moon = toVec(GeoMoon(date));
    let best = -1;
    DSN_STATIONS.forEach((s, i) => {
      const el = elevationOf(moon, s, date);
      elevation[i][k] = el;
      if (el >= DSN_MIN_ELEVATION_DEG && (best < 0 || el > elevation[best][k])) best = i;
    });
    station[k] = best;
  }
  return { start, stepMs, elevation, station };
}

/** Earth counts as in view when at least half its disc clears the terrain, as in visibility.ts. */
const EARTH_UP = 0.5;

/**
 * The station carrying a direct link at each sample, or -1: the Earth must be in view from the site
 * and a DSN complex must see the Moon. `earth` and `dsn` must share their start and step.
 */
export function linkSeries(earth: Float32Array, dsn: DsnTimeline): Int8Array {
  const n = Math.min(earth.length, dsn.station.length);
  const out = new Int8Array(n);
  for (let k = 0; k < n; k++) out[k] = earth[k] >= EARTH_UP ? dsn.station[k] : -1;
  return out;
}

/** Share of samples with a link; with `sun`, only those that also have sunlight (power + link). */
export function linkShare(link: Int8Array, sun?: Float32Array): number {
  if (link.length === 0) return 0;
  let count = 0;
  for (let k = 0; k < link.length; k++) if (link[k] >= 0 && (!sun || sun[k] >= EARTH_UP)) count++;
  return count / link.length;
}

/** A station's name in the interface language. */
export const stationName = (s: DsnStation, lang: 'en' | 'ru'): string => (lang === 'ru' ? s.nameRu : s.name);
