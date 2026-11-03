import { describe, expect, it } from 'vitest';
import { DAY_MS, formatDuration, HOUR_MS } from '../format';

describe('formatDuration', () => {
  it('carries rounded hours over to the next day', () => {
    expect(formatDuration(DAY_MS + 23.7 * HOUR_MS, 'ru')).toBe('2 д 0 ч');
  });

  it('carries rounded minutes over to the next hour', () => {
    expect(formatDuration(HOUR_MS + 59.8 * 60_000)).toBe('2 h 0 min');
  });

  it('shows minutes for short spans and never goes negative', () => {
    expect(formatDuration(18 * 60_000)).toBe('18 min');
    expect(formatDuration(-5000)).toBe('0 min');
  });
});
