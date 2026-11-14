import { describe, expect, it } from 'vitest';
import { tourFor } from '../tourScript';

describe('tourFor', () => {
  it('shows the 3D steps when the Moon is drawn in 3D', () => {
    const keys = tourFor('en').map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['maps', 'relief', 'ground']));
    expect(keys).not.toContain('flat-map');
  });

  it('on the flat map swaps them for one step about the map, right after choosing a site', () => {
    for (const lang of ['en', 'ru'] as const) {
      const keys = tourFor(lang, true).map((s) => s.key);
      expect(keys.slice(0, 2)).toEqual(['sites', 'flat-map']);
      for (const key of ['maps', 'relief', 'ground']) expect(keys).not.toContain(key);
    }
  });
});
