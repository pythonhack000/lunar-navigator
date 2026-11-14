import { describe, expect, test } from 'vitest';
import { isStruggling } from '../frameRate';

describe('isStruggling', () => {
  test('two measured windows in a row under ~8 fps mean the 3D view is unusable here', () => {
    expect(isStruggling([3, 2])).toBe(true);
    expect(isStruggling([45, 5, 6])).toBe(true);
  });

  test('one slow window is a hiccup (a texture upload, a tab switch), not a verdict', () => {
    expect(isStruggling([4])).toBe(false);
    expect(isStruggling([4, 30, 5])).toBe(false);
  });

  test('a merely modest machine is left alone', () => {
    expect(isStruggling([14, 12, 15])).toBe(false);
  });
});
