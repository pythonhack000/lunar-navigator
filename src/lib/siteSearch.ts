import { distanceKm } from './candidates';
import { sampleDsn } from './dsn';
import { moonSky } from './ephemeris';
import { computeHorizon, horizonAt, type HorizonProfile } from './horizon';
import { annualLightAt, iceDistanceKm, pixelToLatLon, type LightMap } from './lightMap';
import { ICE_FAR_KM } from './siteScore';
import { slopeDeg } from './slope';
import type { Terrain } from './terrain';
import { siteSkyFrom } from './topocentric';
import type { Vec3 } from './vec';
import { discFractionAbove } from './visibility';

/**
 * The reverse of landing windows: where on the south polar cap do sunlight and the radio link look
 * the way the planner wants? Either on average over a year, or over a stretch of dates (one day
 * when both ends are the same). Spots are spread over the cap, checked hour by hour against the
 * real terrain horizon, and judged against each need, which can be a floor or a ceiling.
 */
export type NeedOp = 'atLeast' | 'atMost';

export interface Need {
  op: NeedOp;
  /** Share, 0..1. */
  value: number;
}

export interface SearchCriteria {
  sun: Need | null;
  link: Need | null;
  /** How far the Earth must clear the terrain for the antenna, degrees. */
  antennaMaskDeg: number;
  maxSlopeDeg: number;
  /** Ice must be within this many km, or null for no limit. */
  maxIceKm: number | null;
}

export type SearchPeriod = { kind: 'year' } | { kind: 'dates'; from: number; to: number };

export interface SearchSpot {
  lat: number;
  lon: number;
  annualLight: number;
  slopeDeg: number;
  /** Nearest permanent shadow, km, or null when none is within reach. */
  iceKm: number | null;
}

export interface SearchHit extends SearchSpot {
  sunShare: number;
  linkShare: number;
  fits: boolean;
  /** The smallest surplus over the needs; negative by how far a near miss falls short. */
  margin: number;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const YEAR_DAYS = 365;
/** A year is sampled every 6 hours, a stretch of dates every hour (every 3 past a month). */
const YEAR_STEP_MS = 6 * HOUR_MS;
const SHORT_STEP_MS = HOUR_MS;
const LONG_STEP_MS = 3 * HOUR_MS;
const LONG_SPAN_DAYS = 31;
/** Every second pixel of the light map is plenty to choose spots a few km apart. */
const PIXEL_STRIDE = 2;
const SPACING_KM = 3;
/** Fewer azimuths than the site panel: plenty to tell a fit from a miss, and twice as fast. */
const SEARCH_AZIMUTHS = 360;
const UP = 0.5;
const NO_NEEDS_MARGIN = 1;

/** A stable pseudo-random rank, so spots without a light need spread evenly over the cap. */
const scatter = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** How well a spot's annual light suits the sunlight need: the order candidates are tried in. */
function lightRank(annualLight: number, need: Need | null, index: number): number {
  if (!need) return scatter(index);
  return need.op === 'atLeast' ? annualLight : 1 - annualLight;
}

/**
 * Spots on the polar cap, at least SPACING_KM apart, gentle enough and with ice in reach when that
 * is asked; tried in the order most likely to meet the sunlight need, up to `count`.
 */
export function searchCandidates(map: LightMap, terrain: Terrain, criteria: SearchCriteria, count: number): SearchSpot[] {
  const pool: { index: number; annualLight: number; rank: number }[] = [];
  for (let row = 0; row < map.height; row += PIXEL_STRIDE) {
    for (let col = 0; col < map.width; col += PIXEL_STRIDE) {
      const index = row * map.width + col;
      if (map.data[index * 4 + 2] <= 127) continue;
      const annualLight = map.data[index * 4] / 255;
      pool.push({ index, annualLight, rank: lightRank(annualLight, criteria.sun, index) });
    }
  }
  pool.sort((a, b) => b.rank - a.rank);

  const picked: SearchSpot[] = [];
  for (const { index } of pool) {
    if (picked.length >= count) break;
    const { lat, lon } = pixelToLatLon(map, index);
    if (picked.some((p) => distanceKm(p, { lat, lon }) < SPACING_KM)) continue;
    const slope = slopeDeg(terrain, lat, lon);
    if (slope > criteria.maxSlopeDeg) continue;
    const iceKm = iceDistanceKm(map, lat, lon, criteria.maxIceKm ?? ICE_FAR_KM);
    if (criteria.maxIceKm !== null && iceKm === null) continue;
    picked.push({ lat, lon, annualLight: annualLightAt(map, lat, lon) ?? 0, slopeDeg: slope, iceKm });
  }
  return picked;
}

/** Surplus over one need: positive when met, negative by how far it falls short. */
export function needMargin(share: number, need: Need): number {
  return need.op === 'atLeast' ? share - need.value : need.value - share;
}

/** Does the spot meet every need, and by how much? */
export function judgeSpot(spot: SearchSpot, sunShare: number, linkShare: number, criteria: SearchCriteria): SearchHit {
  const margins = [criteria.sun && needMargin(sunShare, criteria.sun), criteria.link && needMargin(linkShare, criteria.link)].filter(
    (m): m is number => m !== null,
  );
  const margin = margins.length > 0 ? Math.min(...margins) : NO_NEEDS_MARGIN;
  return { ...spot, sunShare, linkShare, fits: margin >= 0, margin };
}

/** Every fitting spot first, widest margin first; then the near misses, closest first. */
export function rankHits(hits: readonly SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => Number(b.fits) - Number(a.fits) || b.margin - a.margin);
}

/** First moment, length and sampling step of a search period. */
export function periodSpan(period: SearchPeriod, now: number): { start: number; spanMs: number; stepMs: number } {
  if (period.kind === 'year') return { start: Math.floor(now / DAY_MS) * DAY_MS, spanMs: YEAR_DAYS * DAY_MS, stepMs: YEAR_STEP_MS };
  const start = Math.floor(Math.min(period.from, period.to) / DAY_MS) * DAY_MS;
  const end = Math.floor(Math.max(period.from, period.to) / DAY_MS) * DAY_MS + DAY_MS;
  const spanMs = end - start;
  return { start, spanMs, stepMs: spanMs > LONG_SPAN_DAYS * DAY_MS ? LONG_STEP_MS : SHORT_STEP_MS };
}

interface SharedSky {
  sun: Vec3[];
  earth: Vec3[];
  station: Int8Array;
}

/** Sun, Earth and DSN for every sample: the same for every spot, so worked out once. */
function shareSky(start: number, spanMs: number, stepMs: number): SharedSky {
  const n = Math.floor(spanMs / stepMs);
  const sun: SharedSky['sun'] = [];
  const earth: SharedSky['earth'] = [];
  for (let i = 0; i < n; i++) {
    const sky = moonSky(new Date(start + i * stepMs));
    sun.push(sky.sun);
    earth.push(sky.earth);
  }
  return { sun, earth, station: sampleDsn(start, spanMs - stepMs, stepMs).station };
}

/** Share of samples with the Sun up, and with a usable direct link, at one spot. */
function sharesAt(spot: SearchSpot, profile: HorizonProfile, sky: SharedSky, maskDeg: number): { sun: number; link: number } {
  const site = { lat: spot.lat, lon: spot.lon, heightM: profile.siteHeightM };
  let sunUp = 0;
  let linkUp = 0;
  const n = sky.sun.length;
  for (let i = 0; i < n; i++) {
    const view = siteSkyFrom(site, { sun: sky.sun[i], earth: sky.earth[i] });
    const sunHorizon = horizonAt(profile, view.sun.azDeg);
    if (discFractionAbove(view.sun.elDeg, sunHorizon, view.sun.radiusDeg) >= UP) sunUp++;
    const earthHorizon = horizonAt(profile, view.earth.azDeg);
    const earthUp = discFractionAbove(view.earth.elDeg, earthHorizon, view.earth.radiusDeg) >= UP;
    if (earthUp && view.earth.elDeg - earthHorizon >= maskDeg && sky.station[i] >= 0) linkUp++;
  }
  return { sun: sunUp / Math.max(1, n), link: linkUp / Math.max(1, n) };
}

export interface SearchRun {
  candidates: number;
  now: number;
  /** Called once with how many spots will be checked. */
  onCount?: (count: number) => void;
  /** Called after each spot, with every result so far. */
  onProgress: (hits: SearchHit[]) => void;
  isCancelled: () => boolean;
}

/** Checks each candidate over the period, yielding to the browser between spots; stops when cancelled. */
export async function searchSites(
  map: LightMap,
  terrain: Terrain,
  criteria: SearchCriteria,
  period: SearchPeriod,
  { candidates, now, onCount, onProgress, isCancelled }: SearchRun,
): Promise<SearchHit[]> {
  const spots = searchCandidates(map, terrain, criteria, candidates);
  onCount?.(spots.length);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { start, spanMs, stepMs } = periodSpan(period, now);
  const sky = shareSky(start, spanMs, stepMs);
  const hits: SearchHit[] = [];
  for (const spot of spots) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (isCancelled()) return hits;
    const profile = computeHorizon(terrain, spot.lat, spot.lon, { azimuthSteps: SEARCH_AZIMUTHS });
    const shares = sharesAt(spot, profile, sky, criteria.antennaMaskDeg);
    hits.push(judgeSpot(spot, shares.sun, shares.link, criteria));
    onProgress([...hits]);
  }
  return hits;
}
