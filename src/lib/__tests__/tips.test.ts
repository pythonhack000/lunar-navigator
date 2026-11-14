import { describe, expect, it } from 'vitest';
import { nextTip, tipDelayMs, TIP_ORDER, withTip } from '../tips';

describe('nextTip', () => {
  it('starts with LUNA and clicking the Moon, then goes through the rest in order', () => {
    expect(nextTip([], false)).toBe('luna');
    expect(nextTip(['luna'], false)).toBe('pick');
    expect(nextTip(['luna', 'pick'], false)).toBe('stand');
    expect(nextTip(['luna', 'pick', 'stand', 'time'], false)).toBe('photo');
  });

  it('skips what is already done, whatever the order it was done in', () => {
    expect(nextTip(['stand', 'pick', 'luna', 'photo'], false)).toBe('time');
  });

  it('brings the first two quickly and lets the rest wait', () => {
    expect(tipDelayMs('luna')).toBeLessThan(tipDelayMs('pick'));
    expect(tipDelayMs('pick')).toBeLessThan(tipDelayMs('stand'));
  });

  it('skips tips that cannot be done here (no standing on the surface on the flat map)', () => {
    expect(nextTip(['luna', 'pick'], false, ['stand'])).toBe('time');
  });

  it('stays quiet once everything is done', () => {
    expect(nextTip(TIP_ORDER, false)).toBeNull();
  });

  it('on the surface shows only tips that work there', () => {
    expect(nextTip([], true)).toBeNull();
    expect(nextTip(['luna', 'pick', 'stand'], true)).toBe('time');
  });
});

describe('withTip', () => {
  it('adds a tip once and returns a new list', () => {
    const done = ['pick'] as const;
    const next = withTip(done, 'stand');
    expect(next).toEqual(['pick', 'stand']);
    expect(done).toEqual(['pick']);
    expect(withTip(next, 'stand')).toBe(next);
  });
});
