import { describe, expect, test } from 'vitest';
import { createPolarGrid, decodePackedHeights, stereoRadius } from '../polarGrid';
import { createTerrain, type DemGrid } from '../terrain';

const SIZE = 64;
const RHO_EDGE = stereoRadius(-80);

/** Heights that encode position: +1000 m on the +X (0°E) half, +10 m on the +Y (90°E) half. */
function quadrantGrid() {
  const data = new Int16Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const right = col >= SIZE / 2 ? 1000 : 0;
      const top = row < SIZE / 2 ? 10 : 0; // row 0 is the +Y side
      data[row * SIZE + col] = right + top;
    }
  }
  return createPolarGrid({ size: SIZE, rhoMax: RHO_EDGE, edgeLat: -80, data });
}

describe('polar grid', () => {
  test('puts 0°E on the +X side and 90°E on the +Y side, matching the 3D tile', () => {
    const grid = quadrantGrid();
    // Probe away from the axes, where the synthetic quadrants meet and get interpolated.
    expect(grid.heightAt(-85, 0)).toBeGreaterThan(900); // +X
    expect(grid.heightAt(-85, 180)).toBeLessThan(100); // -X
    expect(grid.heightAt(-85, 60)).toBe(1010); // +X, +Y
    expect(grid.heightAt(-85, -60)).toBe(1000); // +X, -Y
    expect(grid.heightAt(-85, 120)).toBe(10); // -X, +Y
  });

  test('covers only the cap south of its edge', () => {
    const grid = quadrantGrid();
    expect(grid.covers(-85)).toBe(true);
    expect(grid.covers(-79)).toBe(false);
  });

  test('is preferred by the terrain south of the edge', () => {
    const flat: DemGrid = { width: 4, height: 2, pixelsPerDegree: 4 / 360, latTop: 90, data: new Int16Array(8) };
    const terrain = createTerrain(flat, [], [quadrantGrid()]);
    expect(terrain.heightAt(-85, 0)).toBeGreaterThan(900);
    expect(terrain.heightAt(-70, 0)).toBe(0);
  });

  test('decodes heights packed as high and low bytes over R and G', () => {
    // 0x8000 of 0xFFFF is just past the middle of a -1000..+1000 m range
    const rgba = new Uint8ClampedArray([0x80, 0x00, 0, 255, 0xff, 0xff, 0, 255]);
    const out = decodePackedHeights(rgba, 2, 1, { minM: -1000, maxM: 1000 }, 1);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1000);
  });
});
