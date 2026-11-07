import type { TimelineSummary } from './visibility';

/** "Mission commander": pick the site that best meets the goal. The numbers come from the real analysis. */
export type QuizGoal = 'power' | 'comms' | 'night';

export const QUIZ_GOALS: readonly QuizGoal[] = ['power', 'comms', 'night'];
export const QUIZ_OPTIONS = 3;
export const QUIZ_ROUNDS = 3;
/** The right answer must lead by this much of its measure, so no round turns on a rounding error. */
const CLEAR_LEAD = 0.1;
const MAX_TRIES = 24;

const measure = (s: TimelineSummary, goal: QuizGoal): number => {
  if (goal === 'power') return s.sunlitShare;
  if (goal === 'comms') return s.earthShare;
  return -s.longestDarkHours;
};

export function answerIndex(summaries: readonly TimelineSummary[], goal: QuizGoal): number {
  return summaries.reduce((best, s, i) => (measure(s, goal) > measure(summaries[best], goal) ? i : best), 0);
}

function hasClearWinner(summaries: readonly TimelineSummary[], goal: QuizGoal): boolean {
  const values = summaries.map((s) => measure(s, goal)).sort((a, b) => b - a);
  const scale = goal === 'night' ? Math.max(1, Math.abs(values[values.length - 1])) : 1;
  return (values[0] - values[1]) / scale >= CLEAR_LEAD;
}

interface Place {
  lat: number;
  lon: number;
}

export interface QuizRound<T extends Place> {
  goal: QuizGoal;
  sites: T[];
  summaries: TimelineSummary[];
  answer: number;
}

function pickDistinct<T extends Place>(pool: readonly T[], rng: () => number): T[] {
  const picked: T[] = [];
  for (let guard = 0; guard < pool.length * 8 && picked.length < QUIZ_OPTIONS; guard++) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    if (!picked.some((p) => p.lat === candidate.lat && p.lon === candidate.lon)) picked.push(candidate);
  }
  return picked;
}

/** A question with a clear answer, or null if none turned up in a reasonable number of tries. */
export function buildRound<T extends Place>(pool: readonly T[], summarize: (site: T) => TimelineSummary, rng: () => number = Math.random): QuizRound<T> | null {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const sites = pickDistinct(pool, rng);
    if (sites.length < QUIZ_OPTIONS) continue;
    const goal = QUIZ_GOALS[Math.floor(rng() * QUIZ_GOALS.length)];
    const summaries = sites.map(summarize);
    if (hasClearWinner(summaries, goal)) return { goal, sites, summaries, answer: answerIndex(summaries, goal) };
  }
  return null;
}
