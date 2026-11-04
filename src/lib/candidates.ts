import { linkSeries, linkShare, type DsnTimeline } from './dsn';
import { computeHorizon } from './horizon';
import { annualLightAt, iceDistanceKm, pixelToLatLon, type LightMap } from './lightMap';
import { ICE_FAR_KM, siteScore, SLOPE_MAX_DEG, type SiteScore } from './siteScore';
import { slopeDeg } from './slope';
import type { Terrain } from './terrain';
import { sampleTimeline, summarizeTimeline } from './visibility';

/**
 * Finds the best landing spots on the south polar cap in two passes: a quick sweep of the annual
 * light map (bright, gentle, ice within reach), then the full month of Sun, Earth and DSN link for
 * a shortlist, scored exactly as the site panel scores the selected site.
 */
export interface Spot {
  lat: number;
  lon: number;
  annualLight: number;
  slopeDeg: number;
  iceKm: number;
}

export interface BestSite extends Spot {
  score: SiteScore;
  sunShare: number;
  linkShare: number;
}

/** Spots sunlit less than this share of the year cannot keep a lander alive through the night. */
const MIN_ANNUAL_LIGHT = 0.6;
const SHORTLIST = 36;
const SHORTLIST_SPACING_KM = 3;
/** The final picks are distinct places, not neighbouring pixels of one ridge. */
const FINAL_SPACING_KM = 6;
/** The month is sampled every 3 hours here: plenty for ranking, and three times faster. */
const SAMPLE_EVERY = 3;
const MOON_RADIUS_KM = 1737.4;
const DEG = Math.PI / 180;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const cos =
    Math.sin(a.lat * DEG) * Math.sin(b.lat * DEG) + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.cos((a.lon - b.lon) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, cos))) * MOON_RADIUS_KM;
}

/** Bright, gentle spots with permanent shadow (likely ice) within reach. */
export function prefilter(map: LightMap, terrain: Terrain): Spot[] {
  const spots: Spot[] = [];
  for (let i = 0; i < map.width * map.height; i++) {
    if (map.data[i * 4] < MIN_ANNUAL_LIGHT * 255) continue;
    const { lat, lon } = pixelToLatLon(map, i);
    const annualLight = annualLightAt(map, lat, lon);
    if (annualLight === null) continue;
    const slope = slopeDeg(terrain, lat, lon);
    if (slope > SLOPE_MAX_DEG) continue;
    const iceKm = iceDistanceKm(map, lat, lon, ICE_FAR_KM);
    if (iceKm === null) continue;
    spots.push({ lat, lon, annualLight, slopeDeg: slope, iceKm });
  }
  return spots;
}

/** The best `count` items by `rank`, none closer than `minKm` to one already picked. */
export function pickSpaced<T extends { lat: number; lon: number }>(items: readonly T[], rank: (item: T) => number, count: number, minKm: number): T[] {
  const picked: T[] = [];
  for (const item of [...items].sort((a, b) => rank(b) - rank(a))) {
    if (picked.length >= count) break;
    if (picked.every((p) => distanceKm(p, item) >= minKm)) picked.push(item);
  }
  return picked;
}

function everyNth(dsn: DsnTimeline, n: number): DsnTimeline {
  const station = Int8Array.from({ length: Math.ceil(dsn.station.length / n) }, (_, k) => dsn.station[k * n]);
  return { start: dsn.start, stepMs: dsn.stepMs * n, elevation: [], station };
}

/** Full month analysis of the shortlist; yields to the browser between spots so the page stays live. */
export async function findBestSites(map: LightMap, terrain: Terrain, dsn: DsnTimeline, count = 5): Promise<BestSite[]> {
  const coarse = everyNth(dsn, SAMPLE_EVERY);
  const spanMs = (coarse.station.length - 1) * coarse.stepMs;
  const quick = (s: Spot) => siteScore({ sunShare: s.annualLight, linkShare: 0.5, slopeDeg: s.slopeDeg, iceKm: s.iceKm }).total;
  const shortlist = pickSpaced(prefilter(map, terrain), quick, SHORTLIST, SHORTLIST_SPACING_KM);

  const scored: BestSite[] = [];
  for (const spot of shortlist) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const profile = computeHorizon(terrain, spot.lat, spot.lon);
    const site = { lat: spot.lat, lon: spot.lon, heightM: profile.siteHeightM };
    const timeline = sampleTimeline(site, profile, coarse.start, spanMs, coarse.stepMs);
    const sunShare = summarizeTimeline(timeline).sunlitShare;
    const link = linkShare(linkSeries(timeline.earth, coarse));
    scored.push({ ...spot, sunShare, linkShare: link, score: siteScore({ sunShare, linkShare: link, slopeDeg: spot.slopeDeg, iceKm: spot.iceKm }) });
  }
  return pickSpaced(scored, (s) => s.score.total, count, FINAL_SPACING_KM);
}
