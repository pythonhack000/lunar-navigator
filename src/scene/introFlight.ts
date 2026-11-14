import { MathUtils, Quaternion, Vector3 } from 'three';

/**
 * The opening shot: the camera starts just behind the Earth, skims past its limb, crosses the
 * ~380,000 km to the Moon and swings round to the south pole, ending exactly where the main camera
 * starts. Distance shrinks on a log scale, so the cruise feels steady and the Moon keeps growing.
 */
export interface CameraFrame {
  position: Vector3;
  lookAt: Vector3;
  up: Vector3;
}

/** Start this many Earth radii behind the Earth (away from the Moon) and off to the side. */
const START_BEHIND = 3.3;
const START_SIDE = 1.65;
/** The path passes the Earth no closer than this many Earth radii from its centre. */
export const INTRO_EARTH_CLEARANCE = 1.2;
/** Early on the shot leans toward the Earth (a fraction of the starting distance) so both bodies are framed. */
const START_LOOK_OFFSET = 0.28;
/** Share of the flight over which the camera turns from the Earth-and-Moon framing to the Moon alone. */
const FRAMING_END = 0.35;
/** Share of the flight after which the camera swings round to the arrival direction: straight at the Moon first, then round it. */
const SWING_START = 0.55;
const LOOK_SETTLE_START = 0.6;
const NORTH = new Vector3(0, 1, 0);
/**
 * Up to here the camera keeps north at the top of the frame. From here to the end it rolls once, in
 * one direction, onto the arrival frame over the south pole.
 */
const TURN_START = 0.5;

/** Gentler than a cubic: the camera gets moving at once and the cruise speed stays even. */
const easeInOutSine = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

function sideOf(earthPos: Vector3): Vector3 {
  const side = new Vector3().crossVectors(earthPos, NORTH);
  return side.lengthSq() > 1e-9 ? side.normalize() : new Vector3(1, 0, 0);
}

function slerpUnit(a: Vector3, b: Vector3, k: number): Vector3 {
  const angle = a.angleTo(b);
  if (angle < 1e-6) return a.clone();
  const s = Math.sin(angle);
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - k) * angle) / s)
    .addScaledVector(b, Math.sin(k * angle) / s)
    .normalize();
}

/**
 * The arrival's up carried back along the turn of the line of sight by the smallest rotation, so the
 * camera never rolls on its own: the picture only turns as much as the view does, and the Moon cannot
 * appear to flip over (lit side jumping from bottom to top). At the end it is exactly the arrival up.
 */
function carriedUp(position: Vector3, lookAt: Vector3, end: CameraFrame): Vector3 {
  const view = lookAt.clone().sub(position).normalize();
  const endView = end.lookAt.clone().sub(end.position).normalize();
  const turn = new Quaternion().setFromUnitVectors(endView, view);
  return end.up.clone().normalize().applyQuaternion(turn);
}

/** Lunar north projected across the line of sight: the up that keeps the Moon upright on screen. */
function northUp(view: Vector3, fallback: Vector3): Vector3 {
  const up = NORTH.clone().addScaledVector(view, -NORTH.dot(view));
  return up.lengthSq() > 1e-9 ? up.normalize() : fallback.clone();
}

/** `v` with its component along the unit `axis` removed (left unnormalised). */
const across = (v: Vector3, axis: Vector3): Vector3 => v.clone().addScaledVector(axis, -v.dot(axis));

/** Signed angle (radians) that turns `from` onto `to` about the axis `view`, measured in the picture plane. */
function rollBetween(from: Vector3, to: Vector3, view: Vector3): number {
  const a = across(from, view);
  const b = across(to, view);
  return Math.atan2(new Vector3().crossVectors(a, b).dot(view), a.dot(b));
}

/** Where the camera is and what it looks at, before any choice of up. */
function pathAt(p: number, earthPos: Vector3, earthRadius: number, end: CameraFrame): { position: Vector3; lookAt: Vector3 } {
  // With lunar north up, this side puts the Earth on the right of the opening shot.
  const side = sideOf(earthPos);
  const start = earthPos
    .clone()
    .addScaledVector(earthPos.clone().normalize(), START_BEHIND * earthRadius)
    .addScaledVector(side, START_SIDE * earthRadius);

  const r0 = start.length();
  const radius = Math.exp(MathUtils.lerp(Math.log(r0), Math.log(end.position.length()), easeInOutSine(p)));
  const swing = MathUtils.smoothstep(p, SWING_START, 1);
  const position = slerpUnit(start.clone().normalize(), end.position.clone().normalize(), swing).multiplyScalar(radius);

  const lean = side.clone().multiplyScalar(START_LOOK_OFFSET * r0 * (1 - MathUtils.smoothstep(p, 0, FRAMING_END)));
  const lookAt = lean.lerp(end.lookAt, MathUtils.smoothstep(p, LOOK_SETTLE_START, 1));
  return { position, lookAt };
}

/**
 * The roll applied over the swoop, always the short way (at most half a turn): taken the long way
 * round, a small correction became an almost full circle before the camera settled on the site.
 */
function spinFor(earthPos: Vector3, earthRadius: number, end: CameraFrame): number {
  const start = pathAt(TURN_START, earthPos, earthRadius, end);
  const view = start.lookAt.clone().sub(start.position).normalize();
  const carried = carriedUp(start.position, start.lookAt, end);
  return rollBetween(carried, northUp(view, carried), view);
}

/** Camera at progress `t` (0..1) of the intro, in scene units (Moon radii, Moon at the origin). */
export function introCamera(t: number, earthPos: Vector3, earthRadius: number, end: CameraFrame, _sunDir?: Vector3): CameraFrame {
  const p = MathUtils.clamp(t, 0, 1);
  if (p >= 1) return { position: end.position.clone(), lookAt: end.lookAt.clone(), up: end.up.clone().normalize() };

  const { position, lookAt } = pathAt(p, earthPos, earthRadius, end);
  const view = lookAt.clone().sub(position).normalize();
  const carried = carriedUp(position, lookAt, end);
  if (p <= TURN_START) return { position, lookAt, up: northUp(view, carried) };

  // One roll in one direction: north-up when the swoop begins, the arrival frame at the end.
  const remaining = 1 - MathUtils.smootherstep(p, TURN_START, 1);
  return { position, lookAt, up: carried.applyAxisAngle(view, spinFor(earthPos, earthRadius, end) * remaining) };
}
