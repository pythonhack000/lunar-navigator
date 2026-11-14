import type { Terrain } from './terrain';

const MOON_RADIUS_M = 1_737_400;
const DEG = Math.PI / 180;

/**
 * Ground distance between the height samples. The polar elevation grid the browser holds is about
 * 300 m per sample, so slopes are regional (over ~600 m): they flag hills and crater walls, not
 * single boulders, which landers avoid with their own hazard cameras in the last seconds.
 */
export const SLOPE_BASELINE_M = 300;

/** Steepest slope of the terrain at a point, degrees, from central differences east and north. */
export function slopeDeg(terrain: Terrain, lat: number, lon: number, baselineM = SLOPE_BASELINE_M): number {
  const dLat = baselineM / MOON_RADIUS_M / DEG;
  // Keep the east step a true baseline even close to the pole, where meridians bunch up.
  const dLon = dLat / Math.max(Math.cos(lat * DEG), 1e-3);
  const north = (terrain.heightAt(lat + dLat, lon) - terrain.heightAt(lat - dLat, lon)) / (2 * baselineM);
  const east = (terrain.heightAt(lat, lon + dLon) - terrain.heightAt(lat, lon - dLon)) / (2 * baselineM);
  return Math.atan(Math.hypot(north, east)) / DEG;
}
