import { useMemo, useState } from 'react';
import { linkSeries, linkShare, sampleDsn, type DsnTimeline } from '../lib/dsn';
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
  /** Start of the month on screen (see nextWindowStart). */
  windowStart: number;
  site: Site;
  profile: HorizonProfile;
  state: SiteState;
  timeline: Timeline;
  summary: TimelineSummary;
  nextSunChange: number | null;
  nextEarthChange: number | null;
  /** Which DSN complex can see the Moon over the window (the same for every site). */
  dsn: DsnTimeline;
  /** Station carrying a direct link at each timeline sample (Earth in view + DSN), or -1. */
  link: Int8Array;
  /** Share of the window with a direct link, and with a link and sunlight together. */
  linkShare: number;
  powerLinkShare: number;
  /** Station that would carry the link right now, or -1. */
  linkNow: number;
}

/** The timeline window only moves once a day so it is not recomputed every frame while playing. */
export const windowStartFor = (time: number): number => Math.floor(time / DAY_MS) * DAY_MS - LOOKBACK_MS;

/**
 * The month on screen stays put while the time moves inside it, and moves only once the time has
 * left it (played past the end, or a date picked elsewhere). Re-anchoring it at every new day made
 * the timeline slide under the pointer while dragging, and recomputed the month at each step.
 */
export const nextWindowStart = (current: number, time: number): number =>
  time >= current && time <= current + WINDOW_MS ? current : windowStartFor(time);

function useStickyWindowStart(time: number): number {
  const [start, setStart] = useState(() => windowStartFor(time));
  const next = nextWindowStart(start, time);
  // Adjusting state during render (React's documented pattern for following a prop): no extra frame.
  if (next !== start) setStart(next);
  return next;
}

export function useHorizon(terrain: Terrain, lat: number, lon: number): { site: Site; profile: HorizonProfile } {
  return useMemo(() => {
    const profile = computeHorizon(terrain, lat, lon);
    return { profile, site: { lat, lon, heightM: profile.siteHeightM } };
  }, [terrain, lat, lon]);
}

export function useTimeline(site: Site, profile: HorizonProfile, windowStart: number): Timeline {
  return useMemo(() => sampleTimeline(site, profile, windowStart, WINDOW_MS, HOUR_MS), [site, profile, windowStart]);
}

/** The DSN view of the Moon depends only on time, so it is computed once per window for all sites. */
export function useDsn(windowStart: number): DsnTimeline {
  return useMemo(() => sampleDsn(windowStart, WINDOW_MS, HOUR_MS), [windowStart]);
}

export function useSiteAnalysis(terrain: Terrain, lat: number, lon: number, time: number): SiteAnalysis {
  const { site, profile } = useHorizon(terrain, lat, lon);
  const windowStart = useStickyWindowStart(time);
  const timeline = useTimeline(site, profile, windowStart);
  const summary = useMemo(() => summarizeTimeline(timeline), [timeline]);
  const dsn = useDsn(windowStart);
  const links = useMemo(() => {
    const link = linkSeries(timeline.earth, dsn);
    return { link, linkShare: linkShare(link), powerLinkShare: linkShare(link, timeline.sun) };
  }, [timeline, dsn]);
  const state = siteState(site, profile, time);
  const sample = Math.round((time - timeline.start) / timeline.stepMs);
  const linkNow = state.earth.visibleFraction >= 0.5 ? (dsn.station[sample] ?? -1) : -1;
  return {
    windowStart,
    site,
    profile,
    state,
    timeline,
    summary,
    nextSunChange: nextTransition(site, profile, timeline, time, 'sun'),
    nextEarthChange: nextTransition(site, profile, timeline, time, 'earth'),
    dsn,
    ...links,
    linkNow,
  };
}
