import { Matrix4, Vector3 } from 'three';
import type { Basis } from '../lib/ephemeris';
import { latLonToUnit, type Vec3 } from '../lib/vec';

/**
 * The scene is the Moon-fixed frame with three.js conventions: +Y is the lunar north pole,
 * +X the prime meridian and -Z 90°E. This matches how SphereGeometry lays out an
 * equirectangular texture that starts at -180°.
 */
export const toThree = (v: Vec3): Vector3 => new Vector3(v[0], v[2], -v[1]);

export const fromThree = (v: Vector3): Vec3 => [v.x, -v.z, v.y];

export const latLonToThree = (lat: number, lon: number, radius = 1): Vector3 =>
  toThree(latLonToUnit(lat, lon)).multiplyScalar(radius);

/** Rotation that puts a three.js sphere's texture onto a body whose axes are given in the Moon-fixed frame. */
export function bodyRotation(axes: Basis): Matrix4 {
  const primeMeridian = toThree(axes.x);
  const north = toThree(axes.z);
  const east90 = toThree(axes.y);
  return new Matrix4().makeBasis(primeMeridian, north, east90.negate());
}
