import { Body, GeoMoon, GeoVector, RotationAxis, SiderealTime } from 'astronomy-engine';
import { cross, DEG, dot, length, normalize, scale, sub, type Vec3 } from './vec';

export const AU_KM = 149_597_870.7;
export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695_700;
export const EARTH_RADIUS_KM = 6371;

/** Three orthonormal axes expressed in some parent frame. */
export interface Basis {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export interface MoonSky {
  /** Vector from the Moon's centre to the Sun, Moon-fixed frame, km. */
  sun: Vec3;
  /** Vector from the Moon's centre to the Earth, Moon-fixed frame, km. */
  earth: Vec3;
  /** Earth's own axes (prime meridian, 90°E, north pole) in the Moon-fixed frame. */
  earthAxes: Basis;
  /** J2000 equatorial axes in the Moon-fixed frame, used to orient the star background. */
  celestialAxes: Basis;
}

const toVec = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

/** Moon-fixed axes (IAU rotation model) in J2000 equatorial coordinates. */
function moonBasis(date: Date): Basis {
  const axis = RotationAxis(Body.Moon, date);
  const z = normalize(toVec(axis.north));
  // The prime meridian is measured from the node of the Moon's equator on the J2000 equator.
  const node = normalize(cross([0, 0, 1], z));
  const nodeY = cross(z, node);
  const w = axis.spin * DEG;
  const x: Vec3 = [
    node[0] * Math.cos(w) + nodeY[0] * Math.sin(w),
    node[1] * Math.cos(w) + nodeY[1] * Math.sin(w),
    node[2] * Math.cos(w) + nodeY[2] * Math.sin(w),
  ];
  return { x, y: cross(z, x), z };
}

const intoBasis = (v: Vec3, b: Basis): Vec3 => [dot(v, b.x), dot(v, b.y), dot(v, b.z)];

const basisInto = (axes: Basis, b: Basis): Basis => ({
  x: intoBasis(axes.x, b),
  y: intoBasis(axes.y, b),
  z: intoBasis(axes.z, b),
});

function earthAxesJ2000(date: Date): Basis {
  const gast = SiderealTime(date) * 15 * DEG;
  const x: Vec3 = [Math.cos(gast), Math.sin(gast), 0];
  const z: Vec3 = [0, 0, 1];
  return { x, y: cross(z, x), z };
}

const J2000_AXES: Basis = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Positions of the Sun and Earth as seen from the Moon at a given instant. */
export function moonSky(date: Date): MoonSky {
  const basis = moonBasis(date);
  const moonGeo = scale(toVec(GeoMoon(date)), AU_KM);
  const sunGeo = scale(toVec(GeoVector(Body.Sun, date, false)), AU_KM);
  return {
    sun: intoBasis(sub(sunGeo, moonGeo), basis),
    earth: intoBasis(scale(moonGeo, -1), basis),
    earthAxes: basisInto(earthAxesJ2000(date), basis),
    celestialAxes: basisInto(J2000_AXES, basis),
  };
}

/** Angular radius of a sphere of `radiusKm` seen from `distanceKm`, in degrees. */
export function angularRadiusDeg(radiusKm: number, distanceKm: number): number {
  return Math.asin(Math.min(1, radiusKm / distanceKm)) / DEG;
}

export const distanceKm = (v: Vec3): number => length(v);
