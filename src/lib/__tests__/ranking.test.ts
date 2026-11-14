import { describe, expect, test } from 'vitest';
import { rankSites, rankSitesAsync, scoreFor } from '../ranking';
import { flatTerrain } from '../terrain';

const MONTH = 29.53 * 86_400_000;
const HOUR = 3_600_000;
const START = Date.UTC(2026, 10, 14);
const nearSide = { id: 'near', name: 'Near side', lat: 0, lon: 0 };
const farSide = { id: 'far', name: 'Far side', lat: 0, lon: 180 };

describe('rankSites', () => {
  test('puts a far-side site last for direct-to-Earth communication', () => {
    const ranked = rankSites([farSide, nearSide], flatTerrain, START, 'comms', MONTH, 6 * HOUR);
    expect(ranked.map((r) => r.site.id)).toEqual(['near', 'far']);
    expect(ranked[1].score).toBe(0);
  });

  test('scores each goal from the matching share of the month', () => {
    const summary = { sunlitShare: 0.8, earthShare: 0.5, bothShare: 0.4, longestDarkHours: 10, longestCommsGapHours: 20 };
    expect(scoreFor(summary, 'power')).toBe(0.8);
    expect(scoreFor(summary, 'comms')).toBe(0.5);
    expect(scoreFor(summary, 'both')).toBe(0.4);
  });

  test('gives the same order when computed asynchronously', async () => {
    const sync = rankSites([farSide, nearSide], flatTerrain, START, 'both', MONTH, 6 * HOUR);
    const async = await rankSitesAsync([farSide, nearSide], flatTerrain, START, 'both', MONTH, 6 * HOUR);
    expect(async.map((r) => r.site.id)).toEqual(sync.map((r) => r.site.id));
  });
});
