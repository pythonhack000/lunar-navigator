import { DEG } from './vec';

/**
 * South polar stereographic elevation grid (the same tile the 3D cap draws). Plane coordinates are
 * for a unit sphere: x points to 0°E, y to 90°E; row 0 of the grid is the +y edge.
 */
export interface PolarGrid {
  covers(latDeg: number): boolean;
  heightAt(latDeg: number, lonDeg: number): number;
}

export interface PolarGridData {
  size: number;
  rhoMax: number;
  /** Latitude north of which the grid is not used. */
  edgeLat: number;
  /** Heights in metres, row-major. */
  data: Int16Array;
}

/** Distance from the south pole in the stereographic plane of a unit sphere. */
export function stereoRadius(latDeg: number): number {
  const lat = latDeg * DEG;
  return (2 * Math.cos(lat)) / (1 - Math.sin(lat));
}

export function createPolarGrid({ size, rhoMax, edgeLat, data }: PolarGridData): PolarGrid {
  const toPixel = (rho: number) => (rho / (2 * rhoMax) + 0.5) * size - 0.5;
  return {
    covers: (latDeg) => latDeg < edgeLat,
    heightAt(latDeg, lonDeg) {
      const rho = stereoRadius(latDeg);
      const lon = lonDeg * DEG;
      const fx = Math.min(size - 1, Math.max(0, toPixel(rho * Math.cos(lon))));
      const fy = Math.min(size - 1, Math.max(0, size - 1 - toPixel(rho * Math.sin(lon))));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(size - 1, x0 + 1);
      const y1 = Math.min(size - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const top = data[y0 * size + x0] * (1 - tx) + data[y0 * size + x1] * tx;
      const bottom = data[y1 * size + x0] * (1 - tx) + data[y1 * size + x1] * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };
}

/**
 * Unpacks heights stored as 16 bits over the R (high) and G (low) bytes of an RGBA image,
 * keeping every `step`-th pixel in each direction.
 */
export function decodePackedHeights(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  range: { minM: number; maxM: number },
  step: number,
): Int16Array {
  const outW = Math.floor(width / step);
  const outH = Math.floor(height / step);
  const out = new Int16Array(outW * outH);
  const scale = (range.maxM - range.minM) / 65535;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i = (y * step * width + x * step) * 4;
      out[y * outW + x] = Math.round(((rgba[i] << 8) | rgba[i + 1]) * scale + range.minM);
    }
  }
  return out;
}
