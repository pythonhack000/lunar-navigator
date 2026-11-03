import { describe, expect, test } from 'vitest';
import { clipmapLevels, finestLevelFor, GRID_CELLS, snapOrigin } from '../clipmap';

const CELL0 = 1e-4;
const COUNT = 8;

describe('snapOrigin', () => {
  test('keeps the grid still while the focus moves less than one double cell', () => {
    const base = snapOrigin(0.1234, CELL0);
    let moves = 0;
    for (let i = 1; i <= 100; i++) if (snapOrigin(0.1234 + (i * CELL0) / 100, CELL0) !== base) moves++;
    // Over one cell of travel the grid jumps at most once, by a whole double cell.
    expect(moves).toBeLessThanOrEqual(100);
    const after = snapOrigin(0.1234 + CELL0, CELL0);
    expect([0, 2 * CELL0].some((d) => Math.abs(Math.abs(after - base) - d) < 1e-12)).toBe(true);
  });

  test('always lands on a multiple of twice the cell size', () => {
    for (const f of [-0.7, -0.0001, 0, 0.33, 1.9]) {
      const o = snapOrigin(f, CELL0) / (2 * CELL0);
      expect(Math.abs(o - Math.round(o))).toBeLessThan(1e-6);
    }
  });
});

describe('clipmapLevels', () => {
  test('nests every finer grid inside the next coarser one, edges on the coarser lattice', () => {
    for (const [fx, fy] of [[0.1, -0.2], [-1.234, 0.987], [0.00005, 0.00007]]) {
      const levels = clipmapLevels(fx, fy, CELL0, COUNT, 0);
      for (let k = 1; k < COUNT; k++) {
        const fine = levels[k - 1];
        const coarse = levels[k];
        const fineMax = fine.originX + GRID_CELLS * fine.cell;
        expect(fine.originX).toBeGreaterThanOrEqual(coarse.originX - 1e-12);
        expect(fineMax).toBeLessThanOrEqual(coarse.originX + GRID_CELLS * coarse.cell + 1e-12);
        const onLattice = (fine.originX - coarse.originX) / coarse.cell;
        expect(Math.abs(onLattice - Math.round(onLattice))).toBeLessThan(1e-6);
        expect(coarse.hole?.[0]).toBeCloseTo(fine.originX, 12);
      }
    }
  });

  test('hides levels finer than the chosen one and leaves the finest visible level without a hole', () => {
    const levels = clipmapLevels(0, 0, CELL0, COUNT, 3);
    expect(levels.slice(0, 3).every((l) => !l.visible)).toBe(true);
    expect(levels[3].visible).toBe(true);
    expect(levels[3].hole).toBeNull();
    expect(levels[4].hole).not.toBeNull();
  });
});

describe('finestLevelFor', () => {
  test('picks a coarser finest level as the camera pulls back', () => {
    expect(finestLevelFor(0.001, CELL0, COUNT)).toBe(0);
    expect(finestLevelFor(0.05, CELL0, COUNT)).toBeGreaterThan(finestLevelFor(0.01, CELL0, COUNT));
    expect(finestLevelFor(100, CELL0, COUNT)).toBe(COUNT - 1);
  });
});
