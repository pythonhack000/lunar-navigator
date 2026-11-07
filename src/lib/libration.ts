import { moonSky } from './ephemeris';
import { unitToLatLon } from './vec';

/**
 * Libration: the Moon keeps one face to the Earth only on average. Its slightly oval orbit and tilted
 * axis make the point directly below the Earth wander, which at the pole lifts the Earth in and out
 * of view over a month. The ephemeris already includes it; this makes it visible.
 */
export const subEarthPoint = (time: number): { lat: number; lon: number } => unitToLatLon(moonSky(new Date(time)).earth);

export interface LibrationRange {
  lats: Float32Array;
  lons: Float32Array;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function librationRange(start: number, spanMs: number, stepMs: number): LibrationRange {
  const n = Math.floor(spanMs / stepMs) + 1;
  const lats = new Float32Array(n);
  const lons = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const point = subEarthPoint(start + i * stepMs);
    lats[i] = point.lat;
    lons[i] = point.lon;
  }
  return { lats, lons, minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}
