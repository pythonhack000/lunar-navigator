import { Matrix4, Vector3 } from 'three';
import { MOON_RADIUS_KM, moonSky } from '../lib/ephemeris';
import { normalize } from '../lib/vec';
import { bodyRotation, toThree } from './coords';

/**
 * Sun and Earth placement, updated in place every frame straight from the simulated clock so the
 * 3D scene animates smoothly without re-rendering React. Shader uniforms hold these same vectors.
 */
export interface SkyState {
  time: number;
  sunDir: Vector3;
  earthDir: Vector3;
  /** Earth's centre in scene units (Moon radii). */
  earthPos: Vector3;
  earthRotation: Matrix4;
}

export function createSky(): SkyState {
  return {
    time: Number.NaN,
    sunDir: new Vector3(1, 0, 0),
    earthDir: new Vector3(1, 0, 0),
    earthPos: new Vector3(220, 0, 0),
    earthRotation: new Matrix4(),
  };
}

/** Recomputes the sky for `time` if it changed; returns whether anything moved. */
export function updateSky(sky: SkyState, time: number): boolean {
  if (time === sky.time) return false;
  const s = moonSky(new Date(time));
  sky.time = time;
  sky.sunDir.copy(toThree(normalize(s.sun)));
  sky.earthPos.copy(toThree(s.earth)).multiplyScalar(1 / MOON_RADIUS_KM);
  sky.earthDir.copy(sky.earthPos).normalize();
  sky.earthRotation.copy(bodyRotation(s.earthAxes));
  return true;
}
