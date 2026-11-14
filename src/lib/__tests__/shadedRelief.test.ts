import { describe, expect, it } from 'vitest';
import { shadePixels } from '../shadedRelief';

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe('shadePixels', () => {
  it('leaves a flat pixel its own colour', () => {
    const out = px(0, 0, 0, 0);
    shadePixels(px(100, 120, 140, 255), px(128, 128, 255, 255), out);
    expect(out[0]).toBeGreaterThanOrEqual(99);
    expect(out[0]).toBeLessThanOrEqual(101);
    expect(out[3]).toBe(255);
  });

  it('brightens slopes facing the light (upper left) and darkens those facing away', () => {
    const lit = px(0, 0, 0, 0);
    const shadow = px(0, 0, 0, 0);
    // Normals tilted toward −x +y (the light) and toward +x −y.
    shadePixels(px(100, 100, 100, 255), px(60, 196, 220, 255), lit);
    shadePixels(px(100, 100, 100, 255), px(196, 60, 220, 255), shadow);
    expect(lit[0]).toBeGreaterThan(110);
    expect(shadow[0]).toBeLessThan(80);
  });
});
