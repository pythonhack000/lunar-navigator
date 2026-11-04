import { linkSeries, linkShare, sampleDsn } from './dsn';
import { DAY_MS, HOUR_MS } from './format';
import type { HorizonProfile } from './horizon';
import { sampleTimeline, summarizeTimeline, type Timeline, type TimelineSummary } from './visibility';

/** Report periods offered in the dialog; 'custom' takes two dates. */
export type ReportPeriod = 'week' | 'month' | 'quarter' | 'custom';
export const PERIOD_DAYS = { week: 7, month: 29.53, quarter: 90 } as const;
/** Past this length the report samples every 3 hours: the shares barely change, the wait does. */
const LONG_DAYS = 45;

export interface PeriodRange {
  start: number;
  spanMs: number;
}

const startOfDay = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
const parseDay = (value: string): number | null => {
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
};

/** The period a choice stands for: presets start today (UTC); custom dates may be in either order. */
export function periodRange(period: ReportPeriod, now: number, from: string, to: string): PeriodRange {
  if (period !== 'custom') return { start: startOfDay(now), spanMs: PERIOD_DAYS[period] * DAY_MS };
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === null || b === null) return { start: startOfDay(now), spanMs: PERIOD_DAYS.month * DAY_MS };
  return { start: Math.min(a, b), spanMs: Math.max(DAY_MS, Math.abs(b - a)) };
}

export interface PeriodAnalysis {
  timeline: Timeline;
  summary: TimelineSummary;
  link: Int8Array;
  linkShare: number;
  powerLinkShare: number;
}

/** Sun, Earth and DSN link at a site over any period, as the panels compute them for a month. */
export function analyzePeriod(site: { lat: number; lon: number }, profile: HorizonProfile, range: PeriodRange): PeriodAnalysis {
  const { lat, lon } = site;
  const stepMs = range.spanMs > LONG_DAYS * DAY_MS ? 3 * HOUR_MS : HOUR_MS;
  const timeline = sampleTimeline({ lat, lon, heightM: profile.siteHeightM }, profile, range.start, range.spanMs, stepMs);
  const link = linkSeries(timeline.earth, sampleDsn(range.start, range.spanMs, stepMs));
  return {
    timeline,
    summary: summarizeTimeline(timeline),
    link,
    linkShare: linkShare(link),
    powerLinkShare: linkShare(link, timeline.sun),
  };
}
