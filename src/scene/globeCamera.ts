import { MathUtils, Quaternion, Vector3 } from 'three';

/**
 * A Google-Earth-style camera: it looks at a point on the Moon from `range` away, tilted `tilt`
 * radians from straight down, facing `forward` (a tangent direction carried along with the target,
 * so the camera never flips at the poles the way a north-up orbit does).
 */
export interface CameraPose {
  /** Unit vector from the Moon's centre to the point looked at. */
  target: Vector3;
  /** Unit tangent at `target`: the direction the top of the screen points along the ground. */
  forward: Vector3;
  /** Distance from the looked-at point, in Moon radii. */
  range: number;
  /** 0 looks straight down; approaching π/2 looks at the horizon. */
  tilt: number;
}

/** Where the camera is looking, shared each frame with meshes that refine detail there. */
export interface CameraFocus {
  target: Vector3;
  range: number;
}

export const MIN_RANGE = 0.004; // ~7 km
/** Outside the polar maps the streamed LOLA tiles are ~950 m per height sample; stop before that blurs. */
export const MIN_RANGE_GLOBAL = 0.012; // ~21 km
/** In the 240 m ring around the pole. */
export const MIN_RANGE_OUTER = 0.008; // ~14 km
export const MAX_RANGE = 5;
const MAX_TILT_CLOSE = MathUtils.degToRad(84);
/** Tilt is allowed close in and fades out while zooming out, so the far view is the whole globe. */
const TILT_FADE_START = 0.12;
const TILT_FADE_END = 1.6;

export const maxTiltFor = (range: number): number =>
  MAX_TILT_CLOSE * (1 - MathUtils.smoothstep(range, TILT_FADE_START, TILT_FADE_END));

export function clonePose(p: CameraPose): CameraPose {
  return { target: p.target.clone(), forward: p.forward.clone(), range: p.range, tilt: p.tilt };
}

/** Any unit tangent at `up`, used when there is no previous heading to keep. */
export function anyTangent(up: Vector3): Vector3 {
  const ref = Math.abs(up.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  return ref.sub(up.clone().multiplyScalar(ref.dot(up))).normalize();
}

/** Projects `v` onto the tangent plane at `up`, falling back to any tangent if it is degenerate. */
export function tangentAt(up: Vector3, v: Vector3): Vector3 {
  const t = v.clone().sub(up.clone().multiplyScalar(v.dot(up)));
  return t.lengthSq() > 1e-10 ? t.normalize() : anyTangent(up);
}

/** Camera position and up vector for a pose; `groundRadius` is where the target sits (1 + height). */
export function poseToCamera(p: CameraPose, groundRadius: number): { position: Vector3; up: Vector3; lookAt: Vector3 } {
  const up = p.target;
  const lookAt = up.clone().multiplyScalar(groundRadius);
  const back = up.clone().multiplyScalar(Math.cos(p.tilt)).addScaledVector(p.forward, -Math.sin(p.tilt));
  const screenUp = p.forward.clone().multiplyScalar(Math.cos(p.tilt)).addScaledVector(up, Math.sin(p.tilt));
  return { position: lookAt.clone().addScaledVector(back, p.range), up: screenUp, lookAt };
}

/**
 * Slides the target across the sphere. `right` and `ahead` are angles in radians along the
 * screen's right and forward directions; the heading travels with the target.
 */
export function moveTarget(p: CameraPose, right: number, ahead: number): CameraPose {
  const rightDir = new Vector3().crossVectors(p.forward, p.target).normalize();
  const dir = rightDir.multiplyScalar(right).addScaledVector(p.forward, ahead);
  const angle = dir.length();
  if (angle < 1e-12) return clonePose(p);
  const axis = new Vector3().crossVectors(p.target, dir).normalize();
  const q = new Quaternion().setFromAxisAngle(axis, angle);
  const target = p.target.clone().applyQuaternion(q).normalize();
  return { ...p, target, forward: tangentAt(target, p.forward.clone().applyQuaternion(q)) };
}

export function rotateHeading(p: CameraPose, angle: number): CameraPose {
  const q = new Quaternion().setFromAxisAngle(p.target, angle);
  return { ...clonePose(p), forward: p.forward.clone().applyQuaternion(q).normalize() };
}

/**
 * Closest zoom over `target`, by how detailed the terrain data is there (scene axes: -Y is south):
 * full depth over the 80 m polar map, a little less over the 240 m ring, and stop well above the
 * coarse global data.
 */
export function minRangeAt(target: Vector3, innerCutY: number, outerCutY = innerCutY): number {
  if (target.y < innerCutY) return MIN_RANGE;
  return target.y < outerCutY ? MIN_RANGE_OUTER : MIN_RANGE_GLOBAL;
}

export function withRange(p: CameraPose, range: number, minRange = MIN_RANGE): CameraPose {
  const r = MathUtils.clamp(range, minRange, MAX_RANGE);
  return { ...clonePose(p), range: r, tilt: Math.min(p.tilt, maxTiltFor(r)) };
}

export function withTilt(p: CameraPose, tilt: number): CameraPose {
  return { ...clonePose(p), tilt: MathUtils.clamp(tilt, 0, maxTiltFor(p.range)) };
}

/** Moves `current` a fraction `k` (0..1) of the way to `goal`, keeping vectors unit and tangent. */
export function approach(current: CameraPose, goal: CameraPose, k: number): CameraPose {
  const target = current.target.clone().lerp(goal.target, k);
  if (target.lengthSq() < 1e-8) target.copy(goal.target);
  target.normalize();
  const forward = tangentAt(target, current.forward.clone().lerp(tangentAt(target, goal.forward), k));
  const range = Math.exp(MathUtils.lerp(Math.log(current.range), Math.log(goal.range), k));
  return { target, forward, range, tilt: MathUtils.lerp(current.tilt, goal.tilt, k) };
}

/** Smooth start and stop. */
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Long hops climb this many Moon radii per radian travelled, so the globe comes into view mid-flight. */
const HOP_PER_RADIAN = 1.4;
const MAX_HOP = 2.2;
const BASE_FLIGHT_S = 1.6;
const FLIGHT_S_PER_RADIAN = 0.9;

export const flightSeconds = (from: CameraPose, to: CameraPose): number =>
  BASE_FLIGHT_S + Math.min(from.target.angleTo(to.target), Math.PI) * FLIGHT_S_PER_RADIAN;

/**
 * Pose part-way along a cinematic flight (`e` is eased progress 0..1): the target follows the
 * great circle, the camera arcs up and levels out for long hops, then settles into the final tilt.
 */
export function flightPose(from: CameraPose, to: CameraPose, e: number): CameraPose {
  const angle = from.target.angleTo(to.target);
  const turn = new Quaternion().setFromUnitVectors(from.target, to.target);
  const along = new Quaternion().slerp(turn, e);
  const back = new Quaternion().slerp(turn.clone().invert(), 1 - e);
  const target = from.target.clone().applyQuaternion(along).normalize();
  const carried = from.forward.clone().applyQuaternion(along);
  const arriving = to.forward.clone().applyQuaternion(back);
  const forward = tangentAt(target, carried.lerp(arriving, e));

  const arc = Math.sin(Math.PI * e);
  const hop = Math.min(angle * HOP_PER_RADIAN, MAX_HOP) * arc;
  const range = Math.exp(MathUtils.lerp(Math.log(from.range), Math.log(to.range), e)) + hop;
  const level = 1 - arc * Math.min(1, angle * 4);
  const tilt = Math.min(MathUtils.lerp(from.tilt, to.tilt, e) * level, maxTiltFor(range));
  return { target, forward, range, tilt };
}

