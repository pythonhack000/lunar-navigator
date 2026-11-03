import { useMemo } from 'react';
import { DAY_MS, HOUR_MS } from '../lib/format';
import { computeHorizon, type HorizonProfile } from '../lib/horizon';
import type { Terrain } from '../lib/terrain';
import type { Site } from '../lib/topocentric';
import {
  nextTransition,
  sampleTimeline,
  siteState,
  summarizeTimeline,
  type SiteState,
  type Timeline,
  type TimelineSummary,
} from '../lib/visibility';

/** One synodic month: a full lunar day and night. */
export const WINDOW_MS = 29.53 * DAY_MS;
const LOOKBACK_MS = 2 * DAY_MS;

export interface SiteAnalysis {
  site: Site;
  profile: HorizonProfile;
  state: SiteState;
  timeline: Timeline;
  summary: TimelineSummary;
  nextSunChange: number | null;
  nextEarthChange: number | null;
}

/** The timeline window only moves once a day so it is not recomputed every frame while playing. */
export const windowStartFor = (time: number): number => Math.floor(time / DAY_MS) * DAY_MS - LOOKBACK_MS;

export function useHorizon(terrain: Terrain, lat: number, lon: number): { site: Site; profile: HorizonProfile } {
  return useMemo(() => {
    const profile = computeHorizon(terrain, lat, lon);
    return { profile, site: { lat, lon, heightM: profile.siteHeightM } };
  }, [terrain, lat, lon]);
}

export function useTimeline(site: Site, profile: HorizonProfile, windowStart: number): Timeline {
  return useMemo(() => sampleTimeline(site, profile, windowStart, WINDOW_MS, HOUR_MS), [site, profile, windowStart]);
}

export function useSiteAnalysis(terrain: Terrain, lat: number, lon: number, time: number): SiteAnalysis {
  const { site, profile } = useHorizon(terrain, lat, lon);
  const timeline = useTimeline(site, profile, windowStartFor(time));
  const summary = useMemo(() => summarizeTimeline(timeline), [timeline]);
  const state = siteState(site, profile, time);
  return {
    site,
    profile,
    state,
    timeline,
    summary,
    nextSunChange: nextTransition(site, profile, timeline, time, 'sun'),
    nextEarthChange: nextTransition(site, profile, timeline, time, 'earth'),
  };
}
