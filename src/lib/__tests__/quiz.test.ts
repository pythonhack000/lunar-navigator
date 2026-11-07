import { describe, expect, test } from 'vitest';
import { answerIndex, buildRound, QUIZ_OPTIONS } from '../quiz';
import type { TimelineSummary } from '../visibility';

const summary = (sunlitShare: number, earthShare: number, longestDarkHours: number): TimelineSummary => ({
  sunlitShare,
  earthShare,
  bothShare: 0,
  longestDarkHours,
  longestCommsGapHours: 0,
});

const pool = [
  { id: 'a', name: 'A', lat: 1, lon: 1 },
  { id: 'b', name: 'B', lat: 2, lon: 2 },
  { id: 'c', name: 'C', lat: 3, lon: 3 },
  { id: 'd', name: 'D', lat: 4, lon: 4 },
  { id: 'same-as-a', name: 'A again', lat: 1, lon: 1 },
];

const fixedRng = () => {
  let i = 0;
  const values = [0.1, 0.5, 0.9, 0.3, 0.7];
  return () => values[i++ % values.length];
};

describe('answerIndex', () => {
  test('finds the most sun, the most Earth and the shortest night', () => {
    const summaries = [summary(0.2, 0.9, 300), summary(0.8, 0.1, 100), summary(0.5, 0.5, 200)];
    expect(answerIndex(summaries, 'power')).toBe(1);
    expect(answerIndex(summaries, 'comms')).toBe(0);
    expect(answerIndex(summaries, 'night')).toBe(1);
  });
});

describe('buildRound', () => {
  test('offers distinct places and a real answer', () => {
    const sums: Record<string, TimelineSummary> = { a: summary(0.9, 0.9, 10), b: summary(0.5, 0.5, 100), c: summary(0.1, 0.1, 300), d: summary(0.3, 0.3, 200), 'same-as-a': summary(0.9, 0.9, 10) };
    const round = buildRound(pool, (s) => sums[s.id!], fixedRng());
    expect(round).not.toBeNull();
    expect(round!.sites).toHaveLength(QUIZ_OPTIONS);
    expect(new Set(round!.sites.map((s) => `${s.lat},${s.lon}`)).size).toBe(QUIZ_OPTIONS);
    expect(round!.answer).toBe(answerIndex(round!.summaries, round!.goal));
  });

  test('gives up rather than ask a question with no clear winner', () => {
    expect(buildRound(pool, () => summary(0.5, 0.5, 100), fixedRng())).toBeNull();
  });
});
