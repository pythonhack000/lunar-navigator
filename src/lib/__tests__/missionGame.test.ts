import { describe, expect, test } from 'vitest';
import { dateCandidates, freeStars, freeThreshold, MAX_STARS, rankFor, remainingSunHours, starsFor, winners } from '../missionGame';

const HOUR = 3_600_000;
const START = Date.UTC(2027, 0, 1);

/** Ten dark hours, then twenty lit, then dark again. */
const sun = Float32Array.from({ length: 60 }, (_, i) => (i >= 10 && i < 30 ? 1 : 0));

describe('winners', () => {
  test('finds the highest or lowest reading, and accepts a tie', () => {
    expect(winners([0.9, 0.2, 0.5], 'high')).toEqual([0]);
    expect(winners([300, 100, 200], 'low')).toEqual([1]);
    expect(winners([0.93, 0.93, 0.1], 'high')).toEqual([0, 1]);
  });
});

describe('remainingSunHours', () => {
  test('counts the hours until the Sun goes down, and zero in the dark', () => {
    expect(remainingSunHours(sun, 1, 10)).toBe(20);
    expect(remainingSunHours(sun, 1, 25)).toBe(5);
    expect(remainingSunHours(sun, 1, 5)).toBe(0);
  });
});

describe('dateCandidates', () => {
  test('offers sunrise, a late afternoon and a dark date, in time order', () => {
    const times = dateCandidates(sun, START, HOUR);
    expect(times).toHaveLength(3);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const remaining = times.map((t) => remainingSunHours(sun, 1, (t - START) / HOUR));
    expect(Math.max(...remaining)).toBe(20);
    expect(remaining).toContain(0);
    expect(remaining.some((r) => r > 0 && r < 20)).toBe(true);
  });
});

describe('dateCandidates near the end of the search', () => {
  test('still offers a clearly later date when the sunrise comes late', () => {
    // Sunrise at hour 34, just inside the usable part; the Sun then stays up for 22 hours.
    const late = Float32Array.from({ length: 60 }, (_, i) => (i >= 34 && i < 56 ? 1 : 0));
    const remaining = dateCandidates(late, START, HOUR).map((t) => remainingSunHours(late, 1, (t - START) / HOUR));
    expect(Math.max(...remaining)).toBe(22);
    expect(remaining.some((r) => r > 0 && r <= 10)).toBe(true);
  });
});

describe('freeThreshold', () => {
  test('is set so that several places can pass, on a round number', () => {
    expect(freeThreshold([0.52, 0.49, 0.47, 0.4, 0.1])).toBe(0.4);
  });

  test('never asks for less than a real challenge or more than exists', () => {
    expect(freeThreshold([0.05, 0.02])).toBe(0.05);
    expect(freeThreshold([])).toBe(0.2);
  });
});

describe('freeStars', () => {
  test('costs a star per hint, keeps one for finding it, and gives none for being rescued', () => {
    expect(freeStars(0, false)).toBe(3);
    expect(freeStars(1, false)).toBe(2);
    expect(freeStars(4, false)).toBe(1);
    expect(freeStars(0, true)).toBe(0);
  });
});

describe('starsFor and rankFor', () => {
  test('gives a star each for the choice, the reason and not needing a hint', () => {
    expect(starsFor({ isRightPick: true, isRightWhy: true, usedHint: false })).toBe(3);
    expect(starsFor({ isRightPick: true, isRightWhy: false, usedHint: true })).toBe(1);
    expect(starsFor({ isRightPick: false, isRightWhy: false, usedHint: true })).toBe(0);
  });

  test('turns stars into a rank', () => {
    expect(rankFor(MAX_STARS)).toBe('commander');
    expect(rankFor(9)).toBe('navigator');
    expect(rankFor(2)).toBe('cadet');
  });
});
