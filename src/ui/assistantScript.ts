import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { formatDeg, formatDuration, formatHours, formatPercent } from '../lib/format';
import type { RankedSite, RankGoal } from '../lib/ranking';

export interface TourStep {
  /** `data-tour` value of the element to spotlight, or null for a centred message. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR: readonly TourStep[] = [
  {
    target: null,
    title: "Hi, I'm LUNA",
    body:
      "I help mission planners pick where and when to land near the lunar south pole. A lander there needs two things: sunlight on its solar panels, and Earth above the horizon to talk to us directly. Mountains and crater rims block both. Let me show you around.",
  },
  {
    target: 'sites',
    title: 'Pick a landing site',
    body: 'Choose a south pole target, an Apollo site or a robotic lander here. Or type coordinates, or just click anywhere on the Moon.',
  },
  {
    target: 'camera',
    title: 'Fly around in 3D',
    body: 'Drag to move over the ground, right-drag or Shift-drag to turn and tilt toward the horizon, scroll to zoom. Relief 3× exaggerates heights for your eyes; every number uses true heights.',
  },
  {
    target: 'readouts',
    title: 'Sun and Earth right now',
    body: 'How high the Sun and Earth stand, how high the terrain is in that direction, and how long until sunset or Earthset. At the pole the Sun skims the horizon, so a ridge a few degrees high is enough to cause night.',
  },
  {
    target: 'horizon',
    title: 'The real horizon',
    body: 'This is the 360° skyline around the site, traced from NASA LOLA laser altimetry. The Sun (amber) and Earth (blue) paths show exactly when they slip behind terrain. Dashed circles mark a body hidden below the ridge line.',
  },
  {
    target: 'timeline',
    title: 'A whole lunar month',
    body: 'Amber means sunlight, blue means Earth is in view. Drag to scrub through time, or press play to watch shadows sweep across the craters.',
  },
  {
    target: 'month',
    title: 'Compare sites',
    body: 'These totals summarise the month. Press Compare to add sites side by side — or ask me to find the best site for power or communication.',
  },
];

export const QUICK_GOALS: { goal: RankGoal; label: string }[] = [
  { goal: 'power', label: 'Best site for solar power' },
  { goal: 'comms', label: 'Best site for Earth link' },
  { goal: 'both', label: 'Best for power + link' },
];

const GOAL_WORDS: Record<RankGoal, string> = {
  power: 'sunlight',
  comms: 'Earth in view',
  both: 'sunlight and Earth together',
};

/** A plain-language briefing on the selected site, built from the live analysis. */
export function explainSite(name: string, a: SiteAnalysis): string[] {
  const { state, summary, nextSunChange, nextEarthChange } = a;
  const now = state.time;
  const sunUp = state.sun.visibleFraction >= 0.5;
  const earthUp = state.earth.visibleFraction >= 0.5;
  const lines: string[] = [];

  lines.push(
    sunUp
      ? `☀ The Sun is up at ${name}, ${formatDeg(state.sun.elDeg)} above the horizon${
          nextSunChange ? ` — it sets behind terrain in ${formatDuration(nextSunChange - now)}` : ' and stays up all month'
        }.`
      : `☾ It is night at ${name}: the Sun is ${formatDeg(state.sun.elDeg - state.sun.horizonDeg)} below the local ridge line${
          nextSunChange ? `, rising in ${formatDuration(nextSunChange - now)}` : ''
        }.`,
  );
  lines.push(
    earthUp
      ? `🛰 Earth is visible, so a lander could radio home directly${
          nextEarthChange ? ` for another ${formatDuration(nextEarthChange - now)}` : ''
        }.`
      : `🛰 Earth is hidden${nextEarthChange ? ` for ${formatDuration(nextEarthChange - now)}` : ' all month'} — a relay satellite would be needed.`,
  );
  lines.push(
    `Over the next lunar month: ${formatPercent(summary.sunlitShare)} sunlight, ${formatPercent(summary.earthShare)} Earth in view, ${formatPercent(
      summary.bothShare,
    )} both at once.`,
  );
  if (summary.longestDarkHours > 0) {
    lines.push(`The longest night lasts ${formatHours(summary.longestDarkHours)} — batteries or heaters must survive that.`);
  }
  if (summary.sunlitShare > 0.8) lines.push('That is excellent for solar power: this spot sits high enough to see over most ridges.');
  else if (summary.sunlitShare < 0.3) lines.push('Power would be scarce here; a nearby ridge or rim usually does much better.');
  return lines;
}

export function describeRanking(goal: RankGoal, ranked: readonly RankedSite[]): string {
  const best = ranked[0];
  if (!best) return 'I could not rank any sites.';
  return `For ${GOAL_WORDS[goal]}, ${best.site.name} wins with ${formatPercent(best.score)} of the next month. Here are the top picks:`;
}
