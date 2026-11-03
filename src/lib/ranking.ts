import { computeHorizon } from './horizon';
import type { Terrain } from './terrain';
import { sampleTimeline, summarizeTimeline, type TimelineSummary } from './visibility';

export type RankGoal = 'power' | 'comms' | 'both';

export interface Candidate {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
}

export interface RankedSite {
  site: Candidate;
  summary: TimelineSummary;
  score: number;
}

/** Share of the month that matters for each goal: sunlight, Earth in view, or both at once. */
export function scoreFor(summary: TimelineSummary, goal: RankGoal): number {
  if (goal === 'power') return summary.sunlitShare;
  if (goal === 'comms') return summary.earthShare;
  return summary.bothShare;
}

export function summarizeSite(site: Candidate, terrain: Terrain, start: number, spanMs: number, stepMs: number): TimelineSummary {
  const profile = computeHorizon(terrain, site.lat, site.lon);
  const timeline = sampleTimeline({ lat: site.lat, lon: site.lon, heightM: profile.siteHeightM }, profile, start, spanMs, stepMs);
  return summarizeTimeline(timeline);
}

/** Best first; ties go to the site with the shorter longest night. */
function byScore(a: RankedSite, b: RankedSite): number {
  return b.score - a.score || a.summary.longestDarkHours - b.summary.longestDarkHours;
}

export function rankSites(
  sites: readonly Candidate[],
  terrain: Terrain,
  start: number,
  goal: RankGoal,
  spanMs: number,
  stepMs: number,
): RankedSite[] {
  return sites
    .map((site) => {
      const summary = summarizeSite(site, terrain, start, spanMs, stepMs);
      return { site, summary, score: scoreFor(summary, goal) };
    })
    .sort(byScore);
}

/** Same as rankSites, yielding to the browser between sites so the page stays responsive. */
export async function rankSitesAsync(
  sites: readonly Candidate[],
  terrain: Terrain,
  start: number,
  goal: RankGoal,
  spanMs: number,
  stepMs: number,
): Promise<RankedSite[]> {
  const ranked: RankedSite[] = [];
  for (const site of sites) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const summary = summarizeSite(site, terrain, start, spanMs, stepMs);
    ranked.push({ site, summary, score: scoreFor(summary, goal) });
  }
  return ranked.sort(byScore);
}
