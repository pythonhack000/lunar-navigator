import { Quaternion, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { introCamera, INTRO_EARTH_CLEARANCE } from '../introFlight';

const EARTH_RADIUS = 3.67;
const earthPos = new Vector3(150, 20, -160);
const end = { position: new Vector3(0.4, -3.2, 0.9), up: new Vector3(0, 0, 1), lookAt: new Vector3(0, -1, 0) };
const flight = (t: number) => introCamera(t, earthPos, EARTH_RADIUS, end);

describe('introCamera', () => {
  test('starts out beyond the Earth, farther from the Moon than the Earth is', () => {
    expect(flight(0).position.length()).toBeGreaterThan(earthPos.length());
  });

  test('ends exactly on the main camera opening pose', () => {
    const last = flight(1);
    expect(last.position.distanceTo(end.position)).toBeLessThan(1e-9);
    expect(last.lookAt.distanceTo(end.lookAt)).toBeLessThan(1e-9);
    expect(last.up.angleTo(end.up)).toBeLessThan(1e-6);
  });

  test('skims past the Earth without flying through it', () => {
    for (let t = 0; t <= 1; t += 0.005) {
      expect(flight(t).position.distanceTo(earthPos)).toBeGreaterThan(EARTH_RADIUS * INTRO_EARTH_CLEARANCE);
    }
  });

  test('closes in on the Moon the whole way', () => {
    let previous = Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const distance = flight(t).position.length();
      expect(distance).toBeLessThanOrEqual(previous + 1e-9);
      previous = distance;
    }
  });

  test('clamps progress outside 0..1', () => {
    expect(flight(-1).position.distanceTo(flight(0).position)).toBeLessThan(1e-9);
    expect(flight(2).position.distanceTo(end.position)).toBeLessThan(1e-9);
  });

  test('turns gently: view direction and roll never jump between neighbouring frames', () => {
    const STEP = 0.01;
    // The swoop round the Moon rolls fast by design (fly at it, then spin round it); this only guards against whip pans.
    const MAX_TURN_DEG = 14;
    // Worst case: the landing view lies on the far side from the Earth (around new Moon).
    const farEnd = { position: new Vector3(-2.4, -2.2, 1.9), up: new Vector3(0.5, 0, 0.87).normalize(), lookAt: new Vector3(0, -1, 0) };
    const viewOf = (t: number) => {
      const f = introCamera(t, earthPos, EARTH_RADIUS, farEnd);
      return { look: f.lookAt.clone().sub(f.position).normalize(), up: f.up };
    };
    let worst = 0;
    for (let t = 0; t < 1; t += STEP) {
      const a = viewOf(t);
      const b = viewOf(Math.min(1, t + STEP));
      worst = Math.max(worst, a.look.angleTo(b.look), a.up.angleTo(b.up));
    }
    expect((worst * 180) / Math.PI).toBeLessThan(MAX_TURN_DEG);
  });

  test('keeps north up on the approach, then rolls the short way, in one direction, onto the arrival', () => {
    // Roll is the turn of 'up' beyond what the change of view direction carries it by.
    const STEP = 0.005;
    const MAX_ROLL_STEP_DEG = 7;
    // Never more than half a turn: the long way round looked like a full circle.
    const MAX_SPIN_DEG = 180.5;
    // Below this the roll is too small for its direction to mean anything.
    const DIRECTION_MIN_DEG = 5;
    // Floating-point noise allowed against the turn's direction.
    const BACKTRACK_EPS_DEG = 0.05;
    const deg = (r: number) => (r * 180) / Math.PI;
    for (const landing of [end, { position: new Vector3(-2.4, -2.2, 1.9), up: new Vector3(0.5, 0, 0.87).normalize(), lookAt: new Vector3(0, -1, 0) }]) {
      // The camera only uses the part of 'up' across the line of sight, so that is what gets measured.
      const frameAt = (t: number) => {
        const f = introCamera(t, earthPos, EARTH_RADIUS, landing);
        const view = f.lookAt.clone().sub(f.position).normalize();
        return { view, up: f.up.clone().addScaledVector(view, -f.up.dot(view)).normalize() };
      };
      const early = frameAt(0.3);
      expect(early.up.dot(new Vector3(0, 1, 0))).toBeGreaterThan(0.9);

      const steps: number[] = [];
      for (let t = 0; t < 1; t += STEP) {
        const a = frameAt(t);
        const b = frameAt(Math.min(1, t + STEP));
        const carried = a.up.clone().applyQuaternion(new Quaternion().setFromUnitVectors(a.view, b.view));
        const sign = Math.sign(carried.clone().cross(b.up).dot(b.view)) || 1;
        steps.push(sign * carried.angleTo(b.up));
      }
      expect(deg(Math.max(...steps.map(Math.abs)))).toBeLessThan(MAX_ROLL_STEP_DEG);
      const total = steps.reduce((s, x) => s + x, 0);
      const backtrack = steps.filter((x) => Math.sign(x) !== Math.sign(total)).reduce((s, x) => s + Math.abs(x), 0);
      if (deg(Math.abs(total)) > DIRECTION_MIN_DEG) expect(deg(backtrack)).toBeLessThan(BACKTRACK_EPS_DEG * steps.length);
      expect(deg(Math.abs(total))).toBeLessThan(MAX_SPIN_DEG);
    }
  });

  test('opens with the Earth on the right, whatever the Sun', () => {
    for (const sun of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0.3, 0.2, -0.9).normalize()]) {
      const f = introCamera(0, earthPos, EARTH_RADIUS, end, sun);
      const view = f.lookAt.clone().sub(f.position).normalize();
      const right = new Vector3().crossVectors(view, f.up).normalize();
      expect(earthPos.clone().sub(f.position).dot(right)).toBeGreaterThan(0);
    }
  });
});
