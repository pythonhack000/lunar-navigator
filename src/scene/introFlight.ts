import { MathUtils, Vector3 } from 'three';

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
/** Share of the flight after which the camera swings round to the arrival direction. */
const SWING_START = 0.55;
const LOOK_SETTLE_START = 0.6;
const NORTH = new Vector3(0, 1, 0);

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

/** Camera at progress `t` (0..1) of the intro, in scene units (Moon radii, Moon at the origin). */
export function introCamera(t: number, earthPos: Vector3, earthRadius: number, end: CameraFrame): CameraFrame {
  const p = MathUtils.clamp(t, 0, 1);
  if (p >= 1) return { position: end.position.clone(), lookAt: end.lookAt.clone(), up: end.up.clone().normalize() };

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

  const up = NORTH.clone().lerp(end.up, swing);
  if (up.lengthSq() < 1e-9) up.copy(end.up);
  return { position, lookAt, up: up.normalize() };
}
