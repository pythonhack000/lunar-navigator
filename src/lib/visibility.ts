import { horizonAt, type HorizonProfile } from './horizon';
import { siteSky, type Site, type SkyBody } from './topocentric';

export interface BodyView extends SkyBody {
  horizonDeg: number;
  /** Share of the disc above the terrain horizon, 0..1. */
  visibleFraction: number;
}

export interface SiteState {
  time: number;
  sun: BodyView;
  earth: BodyView;
}

/**
 * Share of a disc of angular radius `radiusDeg` centred at `elDeg` that lies above a locally flat
 * horizon at `horizonDeg`. A solar panel at the south pole often sees only part of the Sun.
 */
export function discFractionAbove(elDeg: number, horizonDeg: number, radiusDeg: number): number {
  const h = Math.max(-1, Math.min(1, (elDeg - horizonDeg) / radiusDeg));
  return 1 - (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI;
}

function view(body: SkyBody, profile: HorizonProfile): BodyView {
  const horizonDeg = horizonAt(profile, body.azDeg);
  return { ...body, horizonDeg, visibleFraction: discFractionAbove(body.elDeg, horizonDeg, body.radiusDeg) };
}

export function siteState(site: Site, profile: HorizonProfile, time: number): SiteState {
  const sky = siteSky(site, new Date(time));
  return { time, sun: view(sky.sun, profile), earth: view(sky.earth, profile) };
}

export interface Timeline {
  start: number;
  stepMs: number;
  sun: Float32Array;
  earth: Float32Array;
  sunElevation: Float32Array;
  sunAzimuth: Float32Array;
  earthElevation: Float32Array;
  earthAzimuth: Float32Array;
}

export function sampleTimeline(site: Site, profile: HorizonProfile, start: number, spanMs: number, stepMs: number): Timeline {
  const n = Math.floor(spanMs / stepMs) + 1;
  const sun = new Float32Array(n);
  const earth = new Float32Array(n);
  const sunElevation = new Float32Array(n);
  const sunAzimuth = new Float32Array(n);
  const earthElevation = new Float32Array(n);
  const earthAzimuth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = siteState(site, profile, start + i * stepMs);
    sun[i] = s.sun.visibleFraction;
    earth[i] = s.earth.visibleFraction;
    sunElevation[i] = s.sun.elDeg;
    sunAzimuth[i] = s.sun.azDeg;
    earthElevation[i] = s.earth.elDeg;
    earthAzimuth[i] = s.earth.azDeg;
  }
  return { start, stepMs, sun, earth, sunElevation, sunAzimuth, earthElevation, earthAzimuth };
}

export interface TimelineSummary {
  sunlitShare: number;
  earthShare: number;
  bothShare: number;
  longestDarkHours: number;
  longestCommsGapHours: number;
}

/** A body counts as "up" when at least half its disc clears the terrain. */
const UP_THRESHOLD = 0.5;

function longestRun(values: Float32Array, predicate: (v: number) => boolean): number {
  let best = 0;
  let run = 0;
  for (const v of values) {
    run = predicate(v) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function summarizeTimeline(t: Timeline): TimelineSummary {
  const n = t.sun.length;
  let sunlit = 0;
  let earth = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const s = t.sun[i] >= UP_THRESHOLD;
    const e = t.earth[i] >= UP_THRESHOLD;
    if (s) sunlit++;
    if (e) earth++;
    if (s && e) both++;
  }
  const hours = t.stepMs / 3_600_000;
  return {
    sunlitShare: sunlit / n,
    earthShare: earth / n,
    bothShare: both / n,
    longestDarkHours: longestRun(t.sun, (v) => v < UP_THRESHOLD) * hours,
    longestCommsGapHours: longestRun(t.earth, (v) => v < UP_THRESHOLD) * hours,
  };
}

const REFINE_TOLERANCE_MS = 30_000;

/**
 * Next moment the body's visibility crosses the 50% line (sunset when it is up now, sunrise when it is down).
 * Uses the precomputed timeline to find the right hour, then refines it, so it is cheap enough to run every frame.
 * Returns null if nothing changes before the end of the timeline.
 */
export function nextTransition(
  site: Site,
  profile: HorizonProfile,
  timeline: Timeline,
  from: number,
  body: 'sun' | 'earth',
): number | null {
  const isUp = (time: number) => siteState(site, profile, time)[body].visibleFraction >= UP_THRESHOLD;
  const series = timeline[body];
  const startUp = isUp(from);
  const first = Math.max(0, Math.ceil((from - timeline.start) / timeline.stepMs));
  for (let i = first; i < series.length; i++) {
    if (series[i] >= UP_THRESHOLD === startUp) continue;
    let lo = Math.max(from, timeline.start + (i - 1) * timeline.stepMs);
    let hi = timeline.start + i * timeline.stepMs;
    while (hi - lo > REFINE_TOLERANCE_MS) {
      const mid = (lo + hi) / 2;
      if (isUp(mid) === startUp) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  return null;
}
