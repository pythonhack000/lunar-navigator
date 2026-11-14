import { DAY_MS, HOUR_MS } from './format';
import { computeHorizon } from './horizon';
import type { Terrain } from './terrain';
import { sampleTimeline, summarizeTimeline } from './visibility';

/**
 * Published illumination figures for well-studied south-pole sites, to check this tool against.
 * Values are as printed in the papers; their methods differ from ours (finer terrain, longer spans),
 * so they are a yardstick, not an exact target.
 */
export interface Reference {
  siteId: 'connecting-ridge' | 'shackleton';
  metric: 'sunlit' | 'longestDarkDays';
  /** Share 0..1 for 'sunlit', days for 'longestDarkDays'. */
  value: number;
  /** When the paper gives a span ("typically 3-5 days"), anything inside it matches. */
  range?: readonly [number, number];
  source: string;
  /** What exactly the paper measured. */
  note: { en: string; ru: string };
}

export const REFERENCES: readonly Reference[] = [
  {
    siteId: 'connecting-ridge',
    metric: 'sunlit',
    value: 0.9227,
    source: 'Gläser et al. 2014, Icarus 243',
    note: { en: 'best 20 m spot on the ridge, 2 m above ground, 19 years', ru: 'лучшая точка 20 м на хребте, 2 м над грунтом, 19 лет' },
  },
  {
    siteId: 'connecting-ridge',
    metric: 'sunlit',
    value: 0.88,
    source: 'Gläser et al. 2018, Planet. Space Sci.',
    note: { en: 'best ridge region, average, 20 years', ru: 'лучший район хребта, в среднем, 20 лет' },
  },
  {
    siteId: 'connecting-ridge',
    metric: 'longestDarkDays',
    value: 4,
    range: [3, 5],
    source: 'Gläser et al. 2014, Icarus 243',
    note: { en: 'best spots on the ridge: "typically only 3-5 days"', ru: 'лучшие точки хребта: «обычно всего 3–5 суток»' },
  },
  {
    siteId: 'shackleton',
    metric: 'sunlit',
    value: 0.855,
    source: 'Gläser et al. 2018, Planet. Space Sci.',
    note: { en: 'Shackleton crater rim', ru: 'край кратера Шеклтон' },
  },
  {
    siteId: 'shackleton',
    metric: 'longestDarkDays',
    value: 1.5,
    source: 'Mazarico et al. 2011, Icarus 211',
    note: { en: 'best point near the rim, longest night per year', ru: 'лучшая точка у края, самая длинная ночь за год' },
  },
];

export interface YearResult {
  sunlitShare: number;
  longestDarkDays: number;
}

/**
 * The papers report the best spot of each area, so we do the same with our own geometry: the
 * sunniest of rings of points around the pin (eight directions each), then a full year there. Our
 * pins are approximate and the ridges are kilometres long, so the search reaches 3 km.
 */
export const SEARCH_RADII_KM = [0.6, 1.2, 2, 3] as const;
const SEARCH_DIRECTIONS = 8;
const SEARCH_STEP_MS = 12 * HOUR_MS;
const MOON_RADIUS_KM = 1737.4;
const DEG = Math.PI / 180;

/** One year sampled every 6 hours, as in Mazarico et al. (2011). */
const YEAR_MS = 365.25 * DAY_MS;
const YEAR_STEP_MS = 6 * HOUR_MS;

/** Share of a year in sunlight, and the longest night, at a site, from our own terrain and ephemeris. */
export function illuminationOverYear(terrain: Terrain, lat: number, lon: number, start: number, stepMs = YEAR_STEP_MS): YearResult {
  const profile = computeHorizon(terrain, lat, lon);
  const timeline = sampleTimeline({ lat, lon, heightM: profile.siteHeightM }, profile, start, YEAR_MS, stepMs);
  const summary = summarizeTimeline(timeline);
  return { sunlitShare: summary.sunlitShare, longestDarkDays: summary.longestDarkHours / 24 };
}

/** Our value for a reference's metric, in the reference's units. */
export const ourValue = (ref: Reference, result: YearResult): number =>
  ref.metric === 'sunlit' ? result.sunlitShare : result.longestDarkDays;

/** The pin and the ring of points around it searched for the area's best spot. */
export function searchPoints(lat: number, lon: number): { lat: number; lon: number }[] {
  const points = [{ lat, lon }];
  for (const km of SEARCH_RADII_KM) {
    for (let k = 0; k < SEARCH_DIRECTIONS; k++) {
      const a = (2 * Math.PI * k) / SEARCH_DIRECTIONS;
      const dLat = ((km / MOON_RADIUS_KM) * Math.cos(a)) / DEG;
      const dLon = ((km / MOON_RADIUS_KM) * Math.sin(a)) / DEG / Math.max(Math.cos(lat * DEG), 1e-3);
      points.push({ lat: Math.max(-90, lat + dLat), lon: lon + dLon });
    }
  }
  return points;
}

/** Quick year (12-hour steps) used only to rank the search points. */
export const quickYear = (terrain: Terrain, p: { lat: number; lon: number }, start: number): number =>
  illuminationOverYear(terrain, p.lat, p.lon, start, SEARCH_STEP_MS).sunlitShare;

/** Years covered, as in the papers: a full 18.6-year precession cycle of the lunar orbit. */
export const CYCLE_YEARS = 19;
export const yearStart = (first: number, k: number): number => first + k * YEAR_MS;

/** Many years into one figure: the mean sunlit share and the median of each year's longest night. */
export function combineYears(years: readonly YearResult[]): YearResult {
  const nights = years.map((y) => y.longestDarkDays).sort((a, b) => a - b);
  const mid = Math.floor(nights.length / 2);
  return {
    sunlitShare: years.reduce((sum, y) => sum + y.sunlitShare, 0) / years.length,
    longestDarkDays: nights.length % 2 ? nights[mid] : (nights[mid - 1] + nights[mid]) / 2,
  };
}
