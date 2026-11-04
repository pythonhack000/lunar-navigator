import { Vector3 } from 'three';
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
