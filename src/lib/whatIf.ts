import { linkSeries, linkShare, sampleDsn } from './dsn';
import { DAY_MS } from './format';
import { computeHorizon, type HorizonProfile } from './horizon';
import { analyzePeriod } from './periodReport';
import type { Terrain } from './terrain';
import { sampleTimeline, summarizeTimeline } from './visibility';
import { add, cross, latLonToUnit, length, normalize, scale, unitToLatLon, type Vec3 } from './vec';

/**
 * "What if we land a bit further or a bit later?": the two questions a schedule slip or a hazard map
 * raises, answered by moving the same calculation across the ground or along the calendar.
 */
const MOON_RADIUS_KM = 1737.4;

export interface LatLon {
  lat: number;
  lon: number;
}

/** The point `kmNorth` and `kmEast` from a site, along the surface. Safe right next to the pole. */
export function offsetPoint(lat: number, lon: number, kmNorth: number, kmEast: number): LatLon {
  const distance = Math.hypot(kmNorth, kmEast);
  if (distance === 0) return { lat, lon };
  const up = latLonToUnit(lat, lon);
  const rawEast = cross([0, 0, 1], up);
  const east: Vec3 = length(rawEast) < 1e-9 ? [0, 1, 0] : normalize(rawEast);
  const north = cross(up, east);
  const direction = normalize(add(scale(north, kmNorth), scale(east, kmEast)));
  const angle = distance / MOON_RADIUS_KM;
  return unitToLatLon(add(scale(up, Math.cos(angle)), scale(direction, Math.sin(angle))));
}

export interface GridOffset {
  kmNorth: number;
  kmEast: number;
}

/** A size × size square of offsets, north at the top, west on the left, the site in the middle. */
export function gridOffsets(radiusKm: number, size: number): GridOffset[] {
  const step = (2 * radiusKm) / (size - 1);
  const axis = Array.from({ length: size }, (_, i) => -radiusKm + i * step);
  return [...axis].reverse().flatMap((kmNorth) => axis.map((kmEast) => ({ kmNorth, kmEast })));
}

const POLAR_CAP_LAT = -80;
const SOUTH_GRID_LAT = -60;
const POLAR_RADIUS_KM = 5;
const SOUTH_RADIUS_KM = 15;
const GLOBAL_RADIUS_KM = 50;

/**
 * How far the map reaches: it must not show differences finer than the elevation grid under it
 * (about 300 m at the pole, about 1.9 km south of 60° S and 7.6 km elsewhere).
 */
export function radiusForLat(lat: number): number {
  if (lat <= POLAR_CAP_LAT) return POLAR_RADIUS_KM;
  return lat <= SOUTH_GRID_LAT ? SOUTH_RADIUS_KM : GLOBAL_RADIUS_KM;
}

export interface CellMetrics {
  sun: number;
  link: number;
  both: number;
}

/** A place's share of a period in sunlight, with a direct link, and with both. */
export function cellMetrics(terrain: Terrain, point: LatLon, start: number, spanMs: number, stepMs: number): CellMetrics {
  const profile = computeHorizon(terrain, point.lat, point.lon);
  const timeline = sampleTimeline({ ...point, heightM: profile.siteHeightM }, profile, start, spanMs, stepMs);
  const link = linkSeries(timeline.earth, sampleDsn(start, spanMs, stepMs));
  return { sun: summarizeTimeline(timeline).sunlitShare, link: linkShare(link), both: linkShare(link, timeline.sun) };
}

export interface DateSlip {
  delayDays: number;
  start: number;
  sunShare: number;
  linkShare: number;
  bothShare: number;
  longestDarkHours: number;
}

/** The same mission started later: how much light and link it gets for each delay. */
export function dateSlips(site: LatLon, profile: HorizonProfile, start: number, delaysDays: readonly number[], missionDays: number): DateSlip[] {
  return delaysDays.map((delayDays) => {
    const from = start + delayDays * DAY_MS;
    const period = analyzePeriod(site, profile, { start: from, spanMs: missionDays * DAY_MS });
    return {
      delayDays,
      start: from,
      sunShare: period.summary.sunlitShare,
      linkShare: period.linkShare,
      bothShare: period.powerLinkShare,
      longestDarkHours: period.summary.longestDarkHours,
    };
  });
}
