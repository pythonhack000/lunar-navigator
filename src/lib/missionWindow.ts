import { horizonAt, type HorizonProfile } from './horizon';
import type { Timeline } from './visibility';

/**
 * Landing windows for a whole mission, not a single day: when can a lander of a given lifetime touch
 * down and get enough sunlight and enough link from the moment it lands until the mission ends?
 */
export interface MissionRequirements {
  durationDays: number;
  /** Share of the mission in sunlight, 0..1. */
  minSunShare: number;
  /** Share of the mission with a direct DSN link, 0..1. */
  minLinkShare: number;
  /** How far the Earth must clear the terrain for the antenna, degrees. */
  antennaMaskDeg: number;
}

export const DEFAULT_REQUIREMENTS: MissionRequirements = { durationDays: 14, minSunShare: 0.8, minLinkShare: 0.3, antennaMaskDeg: 1 };

const UP = 0.5;
const HOUR_MS = 3_600_000;

export interface MissionSeries {
  sun: Uint8Array;
  link: Uint8Array;
}

/** Per sample: is there usable sunlight, and a usable link once the antenna mask is applied? */
export function missionSeries(timeline: Timeline, profile: HorizonProfile, station: Int8Array, maskDeg: number): MissionSeries {
  const n = Math.min(timeline.sun.length, station.length);
  const sun = new Uint8Array(n);
  const link = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    sun[i] = timeline.sun[i] >= UP ? 1 : 0;
    const clearance = timeline.earthElevation[i] - horizonAt(profile, timeline.earthAzimuth[i]);
    link[i] = timeline.earth[i] >= UP && clearance >= maskDeg && station[i] >= 0 ? 1 : 0;
  }
  return { sun, link };
}

export interface MissionWindow {
  /** First and last landing times that meet the requirements. */
  from: number;
  to: number;
  /** The best shares any landing time in this window achieves. */
  sunShare: number;
  linkShare: number;
}

function cumulative(values: Uint8Array): Int32Array {
  const sums = new Int32Array(values.length + 1);
  for (let i = 0; i < values.length; i++) sums[i + 1] = sums[i] + values[i];
  return sums;
}

/** Every stretch of landing times where the mission that follows would meet the requirements. */
export function findWindows(series: MissionSeries, start: number, stepMs: number, req: MissionRequirements): MissionWindow[] {
  const span = Math.max(1, Math.round((req.durationDays * 24 * HOUR_MS) / stepMs));
  const sunSums = cumulative(series.sun);
  const linkSums = cumulative(series.link);
  const windows: MissionWindow[] = [];
  let open: MissionWindow | null = null;
  for (let i = 0; i + span <= series.sun.length; i++) {
    const sunShare = (sunSums[i + span] - sunSums[i]) / span;
    const linkShare = (linkSums[i + span] - linkSums[i]) / span;
    if (sunShare < req.minSunShare || linkShare < req.minLinkShare) {
      open = null;
      continue;
    }
    const time = start + i * stepMs;
    if (open) {
      open = { from: open.from, to: time, sunShare: Math.max(open.sunShare, sunShare), linkShare: Math.max(open.linkShare, linkShare) };
      windows[windows.length - 1] = open;
    } else {
      open = { from: time, to: time, sunShare, linkShare };
      windows.push(open);
    }
  }
  return windows;
}
