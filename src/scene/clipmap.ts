/**
 * Terrain as a clipmap: nested square grids, each twice as coarse as the one inside it, centred on
 * the camera's focus. Every grid is snapped to its own lattice, so its vertices always sit on the
 * same ground points and never slide over the terrain as the camera moves. Near its outer edge a
 * grid morphs into the next coarser one (in the shader), so the rings join without cracks or pops.
 */

/** Cells along each side of every level's grid. Must be a multiple of 8. */
export const GRID_CELLS = 128;

/**
 * How far, in cells of the finer grid, a level's hole stops short of that grid's edge. The two
 * then overlap by a thin band: where a fine vertex sits halfway along a coarse edge, rounding leaves
 * pinholes between the triangles (a dotted line of black space), and the coarse level fills them.
 * Both levels shade every pixel identically, so the overlap itself is invisible.
 */
export const HOLE_OVERLAP_CELLS = 1;

export interface ClipLevel {
  /** Lower-left corner of the grid in the level's parameter space (radians or polar plane units). */
  originX: number;
  originY: number;
  cell: number;
  visible: boolean;
  /** Area drawn by the next finer visible level, which this level must leave out; null if none. */
  hole: [number, number, number, number] | null;
}

/**
 * Grid corner for a focus coordinate, snapped to twice the cell size. The doubling puts this
 * level's edges on the next coarser level's lattice, which the edge morph relies on.
 */
export function snapOrigin(focus: number, cell: number, cells = GRID_CELLS): number {
  const step = 2 * cell;
  return Math.floor((focus - (cells * cell) / 2) / step) * step;
}

export function clipmapLevels(focusX: number, focusY: number, cell0: number, count: number, finest: number): ClipLevel[] {
  const levels: ClipLevel[] = [];
  for (let k = 0; k < count; k++) {
    const cell = cell0 * 2 ** k;
    const previous = levels[k - 1];
    const inset = previous ? HOLE_OVERLAP_CELLS * previous.cell : 0;
    const hole: ClipLevel['hole'] =
      k > finest && previous
        ? [
            previous.originX + inset,
            previous.originY + inset,
            previous.originX + GRID_CELLS * previous.cell - inset,
            previous.originY + GRID_CELLS * previous.cell - inset,
          ]
        : null;
    levels.push({ originX: snapOrigin(focusX, cell), originY: snapOrigin(focusY, cell), cell, visible: k >= finest, hole });
  }
  return levels;
}

/** Finest level worth drawing: the first whose grid spans `coverage` times the camera range. */
export function finestLevelFor(range: number, cell0: number, count: number, coverage = 1.5): number {
  for (let k = 0; k < count; k++) {
    if (GRID_CELLS * cell0 * 2 ** k >= range * coverage) return k;
  }
  return count - 1;
}
