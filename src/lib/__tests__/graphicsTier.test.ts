import { describe, expect, it } from 'vitest';
import { lowerTier, pickTier, tierFromQuery, type GpuFacts } from '../graphicsTier';

const base: GpuFacts = { hasWebGL: true, renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)', maxTextureSize: 16384, cores: 8, memoryGb: 8 };

describe('pickTier', () => {
  it('shows the flat map without WebGL', () => {
    expect(pickTier({ ...base, hasWebGL: false })).toBe('none');
  });

  it('treats software rendering, old integrated graphics and small textures as low', () => {
    expect(pickTier({ ...base, renderer: 'Google SwiftShader' })).toBe('low');
    expect(pickTier({ ...base, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' })).toBe('low');
    expect(pickTier({ ...base, maxTextureSize: 4096 })).toBe('low');
  });

  it('treats two cores or two gigabytes as low', () => {
    expect(pickTier({ ...base, cores: 2 })).toBe('low');
    expect(pickTier({ ...base, memoryGb: 2 })).toBe('low');
  });

  it('gives discrete graphics and Apple silicon everything', () => {
    expect(pickTier({ ...base, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)' })).toBe('high');
    expect(pickTier({ ...base, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' })).toBe('high');
  });

  it('leaves ordinary laptops in the middle, and does not punish an unknown memory size', () => {
    expect(pickTier(base)).toBe('medium');
    expect(pickTier({ ...base, memoryGb: null })).toBe('medium');
  });
});

describe('lowerTier', () => {
  it('steps down one level and stops at low', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
    expect(lowerTier('none')).toBe('none');
  });
});

describe('tierFromQuery', () => {
  it('reads ?graphics= and ignores anything else', () => {
    expect(tierFromQuery('?graphics=2d')).toBe('none');
    expect(tierFromQuery('?graphics=LOW&lang=ru')).toBe('low');
    expect(tierFromQuery('?graphics=ultra')).toBeNull();
    expect(tierFromQuery('?utm_source=spaceapps')).toBeNull();
  });
});
