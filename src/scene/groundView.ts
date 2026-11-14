import { Vector3 } from 'three';
import type { Terrain } from '../lib/terrain';
import { latLonToThree } from './coords';
import { anyTangent, tangentAt } from './globeCamera';

/**
 * Directions for standing on the surface: yaw is the azimuth from local north (radians, toward
 * east), pitch the angle above the local horizon. North points along the meridian toward the
 * Moon's north pole, which scene +Y is.
 */
const MOON_NORTH = new Vector3(0, 1, 0);

export function localFrame(up: Vector3): { north: Vector3; east: Vector3 } {
  const north = tangentAt(up, MOON_NORTH);
  // At the pole itself any heading will do.
  if (north.lengthSq() < 1e-10) north.copy(anyTangent(up));
  const east = new Vector3().crossVectors(north, up).normalize();
  return { north, east };
}

export function lookDirection(up: Vector3, yaw: number, pitch: number): Vector3 {
  const { north, east } = localFrame(up);
  return north
    .multiplyScalar(Math.cos(yaw) * Math.cos(pitch))
    .addScaledVector(east, Math.sin(yaw) * Math.cos(pitch))
    .addScaledVector(up, Math.sin(pitch))
    .normalize();
}

export function yawPitchOf(up: Vector3, dir: Vector3): { yaw: number; pitch: number } {
  const { north, east } = localFrame(up);
  const d = dir.clone().normalize();
  return { yaw: Math.atan2(d.dot(east), d.dot(north)), pitch: Math.asin(Math.max(-1, Math.min(1, d.dot(up)))) };
}

const MOON_RADIUS_M = 1_737_400;
/** Eye height above the highest ground near the site: a lander mast or a small hill, not a tall tower. */
export const EYE_M = 80;
/** Sample spacing used to find that highest ground (the CPU grid is coarser than the drawn mesh). */
const CLEAR_SAMPLE_DEG = 0.004;

function highestGroundM(terrain: Terrain, lat: number, lon: number): number {
  const lonStep = CLEAR_SAMPLE_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 1e-3);
  let best = -Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) best = Math.max(best, terrain.heightAt(lat + i * CLEAR_SAMPLE_DEG, lon + j * lonStep));
  return best;
}

/** Where the eye stands at a site, in scene units, for the drawn relief. */
export function eyePosition(terrain: Terrain, lat: number, lon: number, relief: number): Vector3 {
  return latLonToThree(lat, lon)
    .normalize()
    .multiplyScalar(1 + (highestGroundM(terrain, lat, lon) * relief + EYE_M) / MOON_RADIUS_M);
}
