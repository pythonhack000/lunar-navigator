import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../lib/format';
import { nextWindowStart, WINDOW_MS, windowStartFor } from '../useSiteAnalysis';

const T0 = Date.UTC(2026, 10, 14, 12);

describe('nextWindowStart', () => {
  const start = windowStartFor(T0);

  it('keeps the month on screen while the time moves inside it, across day boundaries', () => {
    for (const days of [-2, -1, 0, 0.5, 3, 10, 27]) expect(nextWindowStart(start, T0 + days * DAY_MS)).toBe(start);
  });

  it('moves the month once the time leaves it, either way', () => {
    const later = T0 + 40 * DAY_MS;
    expect(nextWindowStart(start, later)).toBe(windowStartFor(later));
    const earlier = start - DAY_MS;
    expect(nextWindowStart(start, earlier)).toBe(windowStartFor(earlier));
  });

  it('counts both ends of the month as inside', () => {
    expect(nextWindowStart(start, start)).toBe(start);
    expect(nextWindowStart(start, start + WINDOW_MS)).toBe(start);
  });
});
