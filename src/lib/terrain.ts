import { wrapLon } from './vec';

/** An equirectangular elevation grid; heights in metres above the 1737.4 km sphere. */
export interface DemGrid {
  width: number;
  height: number;
  pixelsPerDegree: number;
  /** Latitude of the top edge of the first row, degrees. Columns start at -180°. */
  latTop: number;
  data: Int16Array;
}

export interface Terrain {
  heightAt(latDeg: number, lonDeg: number): number;
}

function sampleGrid(grid: DemGrid, latDeg: number, lonDeg: number): number {
  const { width, height, pixelsPerDegree: ppd, latTop, data } = grid;
  // Pixel centres sit half a pixel inside the edges.
  const fx = (wrapLon(lonDeg) + 180) * ppd - 0.5;
  const fy = Math.min(height - 1, Math.max(0, (latTop - latDeg) * ppd - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % width) + width) % width;
  const xb = (xa + 1) % width;
  const yb = Math.min(height - 1, y0 + 1);
  const top = data[y0 * width + xa] * (1 - tx) + data[y0 * width + xb] * tx;
  const bottom = data[yb * width + xa] * (1 - tx) + data[yb * width + xb] * tx;
  return top * (1 - ty) + bottom * ty;
}

const coversLat = (grid: DemGrid, latDeg: number): boolean =>
  latDeg <= grid.latTop && latDeg >= grid.latTop - grid.height / grid.pixelsPerDegree;

/** Uses a detailed grid where one covers the point and the global grid everywhere else. */
export function createTerrain(global: DemGrid, detailed: readonly DemGrid[] = []): Terrain {
  return {
    heightAt(latDeg, lonDeg) {
      const grid = detailed.find((g) => coversLat(g, latDeg)) ?? global;
      return sampleGrid(grid, latDeg, lonDeg);
    },
  };
}

export const flatTerrain: Terrain = { heightAt: () => 0 };
