import { describe, expect, it } from 'vitest';
import { globeToMap, mapToGlobe, mapToPole, poleToMap } from '../flatMap';

const RHO_MAX = 0.5466163525594904; // south60 map, from the manifest

describe('global map', () => {
  it('puts longitude 0 on the equator in the middle', () => {
    expect(globeToMap(0, 0)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('round-trips any point', () => {
    for (const [lat, lon] of [[0.674, 23.473], [-89.45, -137], [45, 179.9], [-30, -100]]) {
      const back = mapToGlobe(globeToMap(lat, lon));
      expect(back.lat).toBeCloseTo(lat, 9);
      expect(back.lon).toBeCloseTo(lon, 9);
    }
  });
});

describe('south polar map', () => {
  it('puts the pole in the middle and longitude 0 to the right', () => {
    expect(poleToMap(-90, 0, RHO_MAX)).toEqual({ u: 0.5, v: 0.5 });
    expect(poleToMap(-80, 0, RHO_MAX).u).toBeGreaterThan(0.5);
    expect(poleToMap(-80, 90, RHO_MAX).v).toBeLessThan(0.5);
  });

  it('round-trips a polar point', () => {
    const back = mapToPole(poleToMap(-89.45, -137, RHO_MAX), RHO_MAX)!;
    expect(back.lat).toBeCloseTo(-89.45, 9);
    expect(back.lon).toBeCloseTo(-137, 9);
  });

  it('reaches 60°S at the edge and refuses the corners, where there is no data', () => {
    expect(poleToMap(-60, 0, 0.5358983848622455).u).toBeCloseTo(1, 9);
    expect(mapToPole({ u: 0.02, v: 0.02 }, RHO_MAX)).toBeNull();
  });
});

import { clampView, fitBox, fromScreen, HOME_VIEW, MAX_SCALE, toScreen, zoomAt } from '../flatMap';

describe('map view', () => {
  const W = 800;
  const H = 600;

  it('fits the picture in the frame, centred', () => {
    expect(fitBox(W, H, 1)).toEqual({ left: 100, top: 0, width: 600, height: 600 });
    expect(fitBox(W, H, 2)).toEqual({ left: 0, top: 100, width: 800, height: 400 });
  });

  it('maps a point to the screen and back under any view', () => {
    const base = fitBox(W, H, 1);
    const view = { scale: 3, panX: 40, panY: -25 };
    const p = { u: 0.31, v: 0.77 };
    const s = toScreen(p, base, view, W, H);
    const back = fromScreen(s.x, s.y, base, view, W, H);
    expect(back.u).toBeCloseTo(p.u, 9);
    expect(back.v).toBeCloseTo(p.v, 9);
  });

  it('keeps the point under the cursor in place while zooming', () => {
    const base = fitBox(W, H, 1);
    const before = fromScreen(500, 200, base, HOME_VIEW, W, H);
    const zoomed = zoomAt(HOME_VIEW, 2, 500, 200, base, W, H);
    const after = fromScreen(500, 200, base, zoomed, W, H);
    expect(zoomed.scale).toBe(2);
    expect(after.u).toBeCloseTo(before.u, 9);
    expect(after.v).toBeCloseTo(before.v, 9);
  });

  it('never zooms past its limits nor lets the picture be dragged away', () => {
    const base = fitBox(W, H, 1);
    expect(zoomAt(HOME_VIEW, 100, 400, 300, base, W, H).scale).toBe(MAX_SCALE);
    expect(zoomAt(HOME_VIEW, 0.1, 400, 300, base, W, H).scale).toBe(1);
    expect(clampView({ scale: 1, panX: 300, panY: -300 }, base)).toEqual(HOME_VIEW);
    const zoomed = clampView({ scale: 2, panX: 5000, panY: 0 }, base);
    expect(zoomed.panX).toBe(300);
  });
});
