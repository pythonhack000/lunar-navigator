import { describe, expect, test } from 'vitest';
import { isWeakGpu, judgeLink, textureQuality } from '../textureQuality';

describe('isWeakGpu', () => {
  test('flags software renderers and old integrated graphics', () => {
    expect(isWeakGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 16384)).toBe(true);
    expect(isWeakGpu('llvmpipe (LLVM 15.0.7, 256 bits)', 16384)).toBe(true);
    expect(isWeakGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)', 16384)).toBe(true);
    expect(isWeakGpu('ANGLE (Intel, Intel(R) HD Graphics 520)', 16384)).toBe(true);
  });

  test('flags any GPU that cannot hold an 8K texture', () => {
    expect(isWeakGpu('ANGLE (NVIDIA GeForce RTX 3060)', 4096)).toBe(true);
  });

  test('keeps capable GPUs, and unknown ones, on the full set', () => {
    expect(isWeakGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 16384)).toBe(false);
    expect(isWeakGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', 32768)).toBe(false);
    expect(isWeakGpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', 16384)).toBe(false);
    expect(isWeakGpu('', 16384)).toBe(false);
  });
});

describe('judgeLink', () => {
  const slowSample = { bytes: 3_000_000, seconds: 20 };
  const fastSample = { bytes: 3_000_000, seconds: 2 };
  // A returning visitor: everything came from cache, so nothing was measured on the network.
  const cachedSample = { bytes: 0, seconds: 0.1 };

  test('judges the link by a real download: slow below ~6 Mbit/s', () => {
    expect(judgeLink({ sample: slowSample })).toBe('slow');
    expect(judgeLink({ sample: fastSample })).toBe('fast');
  });

  test('a very fast real download is fast, never mistaken for a cache, whatever the browser guesses', () => {
    expect(judgeLink({ sample: { bytes: 7_000_000, seconds: 0.05 }, downlinkMbps: 1.7 })).toBe('fast');
  });

  test("respects the browser's data saver whatever the speed", () => {
    expect(judgeLink({ sample: fastSample, saveData: true })).toBe('slow');
  });

  test('does not trust a download served from cache, and asks the browser instead', () => {
    expect(judgeLink({ sample: cachedSample, effectiveType: '3g' })).toBe('slow');
    expect(judgeLink({ sample: cachedSample, effectiveType: '4g', downlinkMbps: 1.2 })).toBe('slow');
    expect(judgeLink({ sample: cachedSample, effectiveType: '4g', downlinkMbps: 10 })).toBe('fast');
  });

  test('falls back to the verdict from the last visit when the browser says nothing', () => {
    expect(judgeLink({ sample: cachedSample, previous: 'slow' })).toBe('slow');
    expect(judgeLink({ sample: cachedSample, previous: 'fast' })).toBe('fast');
  });

  test('does not judge from too little data, and assumes fast when nothing is known', () => {
    expect(judgeLink({ sample: { bytes: 50_000, seconds: 5 } })).toBe('fast');
    expect(judgeLink({ sample: { bytes: 0, seconds: 0 } })).toBe('fast');
  });
});

describe('textureQuality', () => {
  test('a slow link keeps the previews only', () => {
    expect(textureQuality({ slowLink: true, weakGpu: false })).toBe('previews');
    expect(textureQuality({ slowLink: true, weakGpu: true })).toBe('previews');
  });

  test('a weak GPU gets the sharp south pole but not the 8K globe', () => {
    expect(textureQuality({ slowLink: false, weakGpu: true })).toBe('polar');
  });

  test('a capable machine on a good link gets everything', () => {
    expect(textureQuality({ slowLink: false, weakGpu: false })).toBe('full');
  });
});
