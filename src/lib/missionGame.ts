/**
 * "Mission commander": the player scouts real sites, reads the real panels, compares what they wrote
 * down, chooses, then explains why. Nothing here is scripted: every answer comes from the analysis.
 */
export type MissionKind = 'power' | 'comms' | 'night' | 'dates' | 'free';
export type Rank = 'cadet' | 'navigator' | 'commander';

export const MISSION_COUNT = 5;
export const STARS_PER_MISSION = 3;
export const MAX_STARS = MISSION_COUNT * STARS_PER_MISSION;
const COMMANDER_STARS = 12;
const NAVIGATOR_STARS = 7;
/** Readings this close count as a tie: nobody should lose a star to rounding. */
const TIE_TOLERANCE = 0.005;

/** Which candidates hold the best reading; a tie gives more than one right answer. */
export function winners(values: readonly number[], better: 'high' | 'low'): number[] {
  const best = better === 'high' ? Math.max(...values) : Math.min(...values);
  const margin = Math.max(Math.abs(best), 1) * TIE_TOLERANCE;
  return values.flatMap((v, i) => (Math.abs(v - best) <= margin ? [i] : []));
}

const UP = 0.5;

export function remainingSunHours(sun: Float32Array, stepHours: number, index: number): number {
  let i = index;
  while (i < sun.length && sun[i] >= UP) i++;
  return (i - index) * stepHours;
}

/** Only the first part of the month is offered, so the Sun's whole run fits in the data. */
const USABLE_SHARE = 0.6;
const LATE_SHARE = 0.3;

/** Three landing dates to scout: at sunrise, late in the day, and in the dark. In time order. */
export function dateCandidates(sun: Float32Array, start: number, stepMs: number): number[] {
  const usable = Math.max(1, Math.floor(sun.length * USABLE_SHARE));
  const hours = stepMs / 3_600_000;
  const remaining = Array.from({ length: usable }, (_, i) => remainingSunHours(sun, hours, i));
  const sunrise = remaining.indexOf(Math.max(...remaining));
  const wanted = remaining[sunrise] * LATE_SHARE;
  let late = sunrise;
  // The late date may fall past the usable part: only the sunrise needs its whole run ahead of it.
  for (let i = sunrise; i < sun.length && sun[i] >= UP; i++) {
    if (Math.abs(remainingSunHours(sun, hours, i) - wanted) < Math.abs(remainingSunHours(sun, hours, late) - wanted)) late = i;
  }
  const dark = Math.max(0, remaining.indexOf(0));
  return [...new Set([sunrise, late, dark])].sort((a, b) => a - b).map((i) => start + i * stepMs);
}

const THRESHOLD_STEP = 0.05;
const FALLBACK_THRESHOLD = 0.2;
const PLACES_THAT_SHOULD_PASS = 4;

/** The target for the open search: hard enough to need looking, with several real places passing. */
export function freeThreshold(shares: readonly number[]): number {
  if (shares.length === 0) return FALLBACK_THRESHOLD;
  const sorted = [...shares].sort((a, b) => b - a);
  const reachable = sorted[Math.min(PLACES_THAT_SHOULD_PASS, sorted.length) - 1];
  const rounded = Math.floor(reachable / THRESHOLD_STEP + 1e-9) * THRESHOLD_STEP;
  return Number(Math.max(THRESHOLD_STEP, rounded).toFixed(2));
}

const FREE_MISSION_STARS = 3;

/** The open search: each hint costs a star but finding it yourself always earns one; LUNA's rescue earns none. */
export function freeStars(hintsUsed: number, isRescued: boolean): number {
  if (isRescued) return 0;
  return Math.max(1, FREE_MISSION_STARS - hintsUsed);
}

export function starsFor(result: { isRightPick: boolean; isRightWhy: boolean; usedHint: boolean }): number {
  if (!result.isRightPick) return result.isRightWhy ? 1 : 0;
  return 1 + (result.isRightWhy ? 1 : 0) + (result.usedHint ? 0 : 1);
}

export function rankFor(stars: number): Rank {
  if (stars >= COMMANDER_STARS) return 'commander';
  return stars >= NAVIGATOR_STARS ? 'navigator' : 'cadet';
}
