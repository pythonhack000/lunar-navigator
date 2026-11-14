import { describe, expect, test } from 'vitest';
import { bundleSample, wantsLightIntro } from '../earlyLink';

const entry = (name: string, transferSize: number, requestStart: number, responseEnd: number) => ({ name, initiatorType: 'script', transferSize, requestStart, responseEnd });

describe('bundleSample', () => {
  test('times the biggest script the page downloaded', () => {
    const sample = bundleSample([entry('/assets/vendor.js', 20_000, 0, 50), entry('/assets/index-abc.js', 460_000, 100, 4_100)]);
    expect(sample).toEqual({ bytes: 460_000, seconds: 4 });
  });

  test('says nothing for a cached bundle or one too small to time', () => {
    expect(bundleSample([entry('/assets/index.js', 0, 0, 5)])).toBeNull();
    expect(bundleSample([entry('/assets/index.js', 30_000, 0, 500)])).toBeNull();
    expect(bundleSample([])).toBeNull();
  });
});

describe('wantsLightIntro', () => {
  test('a link under ~2 Mbit/s gets the light opening textures', () => {
    expect(wantsLightIntro({ bytes: 460_000, seconds: 4 })).toBe(true);
    expect(wantsLightIntro({ bytes: 460_000, seconds: 0.5 })).toBe(false);
  });

  test('with no measurement the opening stays sharp', () => {
    expect(wantsLightIntro(null)).toBe(false);
  });
});
