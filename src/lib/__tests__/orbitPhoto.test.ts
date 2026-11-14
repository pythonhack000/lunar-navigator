import { describe, expect, it } from 'vitest';
import { PHOTO_SOURCES, photoPlan, photoSourceFor, scaleBar } from '../orbitPhoto';

const SIZE = 512;

/** Every corner and the centre of the square is covered by exactly one tile. */
function coversSquare(lat: number, lon: number, step = 0): boolean {
  const { tiles } = photoPlan(lat, lon, SIZE, step);
  return [[0, 0], [SIZE - 1, 0], [0, SIZE - 1], [SIZE - 1, SIZE - 1], [SIZE / 2, SIZE / 2]].every(
    ([px, py]) => tiles.filter((t) => px >= t.dx && px < t.dx + t.width && py >= t.dy && py < t.dy + t.height).length === 1,
  );
}

describe('photoSourceFor', () => {
  it('uses the 1 m NAC mosaic at the south pole, WAC polar mosaics past 60°, the global WAC elsewhere', () => {
    expect(photoSourceFor(-89.45)).toBe(PHOTO_SOURCES.nac);
    expect(photoSourceFor(-80)).toBe(PHOTO_SOURCES.south);
    expect(photoSourceFor(75)).toBe(PHOTO_SOURCES.north);
    expect(photoSourceFor(0.67)).toBe(PHOTO_SOURCES.global);
    expect(photoSourceFor(-45)).toBe(PHOTO_SOURCES.global);
  });
});

describe('photoPlan', () => {
  it('covers the square with no gaps for every kind of site', () => {
    for (const [lat, lon] of [[-89.45, -137], [-86, 0], [-70, 40], [72, -100], [0.674, 23.473], [26.1, 3.6], [-45.4, 177.6], [55, -179.9]]) {
      expect(coversSquare(lat, lon), `${lat}, ${lon}`).toBe(true);
    }
  });

  it('asks the global mosaic for JPEG tiles, wrapping across the date line', () => {
    const { tiles } = photoPlan(10, 179.95, SIZE);
    expect(tiles.every((t) => t.url.includes('/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/') && t.url.endsWith('.jpg'))).toBe(true);
    const cols = tiles.map((t) => Number(t.url.split('/').at(-1)!.split('.')[0]));
    expect(Math.min(...cols)).toBe(0);
    expect(Math.max(...cols)).toBe(2 ** 9 - 1);
  });

  it('squeezes the global mosaic sideways so craters stay round', () => {
    const tile = photoPlan(40, 10, SIZE).tiles[0];
    expect(tile.width / tile.height).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 6);
  });

  it('keeps the download small', () => {
    for (const lat of [-89, -80, 0, 44, 59, 75]) expect(photoPlan(lat, 30, SIZE).tiles.length).toBeLessThanOrEqual(12);
  });

  it('reports the ground scale: about 17 m a pixel for the NAC square, about 83 m at the equator', () => {
    expect(photoPlan(-89.45, -137, SIZE).metresPerPixel).toBeCloseTo(16.7, 0);
    expect(photoPlan(0, 0, SIZE).metresPerPixel).toBeCloseTo(83.3, 0);
  });
});

describe('photoPlan zoom', () => {
  it('halves the ground per pixel with each step closer, and doubles it with each step back', () => {
    const base = photoPlan(-89.45, -137, SIZE).metresPerPixel;
    expect(photoPlan(-89.45, -137, SIZE, 1).metresPerPixel).toBeCloseTo(base / 2, 6);
    expect(photoPlan(-89.45, -137, SIZE, -2).metresPerPixel).toBeCloseTo(base * 4, 6);
  });

  it('stops at what Moon Trek serves: no closer than twice its finest level, no further than its first', () => {
    const near = photoPlan(-89.45, -137, SIZE, 10);
    expect(near.canZoomIn).toBe(false);
    expect(near.metresPerPixel).toBeCloseTo(photoPlan(-89.45, -137, SIZE, 4).metresPerPixel, 6);
    expect(photoPlan(-89.45, -137, SIZE, -10).canZoomOut).toBe(false);
    expect(photoPlan(0, 0, SIZE).canZoomIn).toBe(true);
    expect(photoPlan(0, 0, SIZE, 1).canZoomIn).toBe(false);
  });

  it('keeps every zoom step a complete, small download', () => {
    for (const [lat, lon] of [[-89.45, -137], [0.674, 23.473], [-75, 10], [50, 60]]) {
      for (let step = -3; step <= 3; step++) {
        expect(coversSquare(lat, lon, step), `${lat},${lon} step ${step}`).toBe(true);
        expect(photoPlan(lat, lon, SIZE, step).tiles.length).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('scaleBar', () => {
  it('picks a round length near a fifth of the width', () => {
    expect(scaleBar(16.7, SIZE).km).toBe(2);
    expect(scaleBar(83.3, SIZE).km).toBe(10);
    const { share } = scaleBar(83.3, SIZE);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
  });
});
