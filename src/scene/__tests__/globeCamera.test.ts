import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { approach, flightPose, MIN_RANGE, MIN_RANGE_GLOBAL, minRangeAt, maxTiltFor, moveTarget, poseToCamera, rotateHeading, withRange, withTilt, type CameraPose } from '../globeCamera';

const southPole = (): CameraPose => ({
  target: new Vector3(0, -1, 0),
  forward: new Vector3(1, 0, 0),
  range: 0.2,
  tilt: 0,
});

describe('poseToCamera', () => {
  test('looks straight down from above the target when not tilted', () => {
    const { position, lookAt } = poseToCamera(southPole(), 1);
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(-1.2);
    expect(position.z).toBeCloseTo(0);
    expect(lookAt.y).toBeCloseTo(-1);
  });

  test('keeps the camera above the ground and the up vector square to the view when tilted', () => {
    const pose = withTilt(southPole(), 1.2);
    const { position, up, lookAt } = poseToCamera(pose, 1);
    const view = lookAt.clone().sub(position).normalize();
    expect(position.length()).toBeGreaterThan(1);
    expect(up.dot(view)).toBeCloseTo(0, 6);
  });
});

describe('moveTarget', () => {
  test('crosses the south pole without flipping the heading', () => {
    // Arrange: start just short of the pole, heading toward it
    let pose: CameraPose = { target: new Vector3(0.05, -1, 0).normalize(), forward: new Vector3(-1, 0, 0), range: 0.2, tilt: 0 };
    pose = { ...pose, forward: pose.forward.clone().sub(pose.target.clone().multiplyScalar(pose.forward.dot(pose.target))).normalize() };
    const startForward = pose.forward.clone();

    // Act: walk 0.1 rad straight ahead, across the pole
    for (let i = 0; i < 10; i++) pose = moveTarget(pose, 0, 0.01);

    // Assert: now on the other side, still heading the same way and still tangent
    expect(pose.target.x).toBeLessThan(0);
    expect(pose.forward.dot(startForward)).toBeGreaterThan(0.99);
    expect(Math.abs(pose.forward.dot(pose.target))).toBeLessThan(1e-9);
  });

  test('moves sideways along the screen right direction', () => {
    const pose = moveTarget(southPole(), 0.1, 0);
    // right = forward × up = (1,0,0) × (0,-1,0) = (0,0,-1)
    expect(pose.target.z).toBeLessThan(0);
    expect(pose.target.length()).toBeCloseTo(1);
  });
});

describe('range and tilt limits', () => {
  test('flattens the tilt when zooming out to the whole globe', () => {
    const tilted = withTilt(southPole(), 1.3);
    const far = withRange(tilted, 3);
    expect(maxTiltFor(3)).toBe(0);
    expect(far.tilt).toBe(0);
  });

  test('rotating the heading keeps forward tangent and unit length', () => {
    const p = rotateHeading(southPole(), 0.7);
    expect(p.forward.length()).toBeCloseTo(1);
    expect(p.forward.dot(p.target)).toBeCloseTo(0);
  });

  test('approach reaches the goal and interpolates range geometrically', () => {
    const a = southPole();
    const b = withRange(southPole(), 0.8);
    expect(approach(a, b, 0.5).range).toBeCloseTo(0.4);
    expect(approach(a, b, 1).range).toBeCloseTo(0.8);
  });
});

describe('flightPose', () => {
  const start = (): CameraPose => ({ target: new Vector3(1, 0, 0), forward: new Vector3(0, 1, 0), range: 0.2, tilt: 1 });
  const end = (): CameraPose => ({ target: new Vector3(0, -1, 0), forward: new Vector3(0, 0, 1), range: 0.15, tilt: 1.1 });

  test('starts and ends exactly at the two poses', () => {
    const a = flightPose(start(), end(), 0);
    const b = flightPose(start(), end(), 1);
    expect(a.target.distanceTo(start().target)).toBeLessThan(1e-9);
    expect(b.target.distanceTo(end().target)).toBeLessThan(1e-9);
    expect(b.forward.distanceTo(end().forward)).toBeLessThan(1e-6);
    expect(b.range).toBeCloseTo(0.15);
    expect(b.tilt).toBeCloseTo(1.1);
  });

  test('climbs high and levels out halfway through a long hop, staying on the sphere', () => {
    const mid = flightPose(start(), end(), 0.5);
    expect(mid.range).toBeGreaterThan(1.5);
    expect(mid.tilt).toBe(0);
    expect(mid.target.length()).toBeCloseTo(1);
    expect(mid.forward.dot(mid.target)).toBeCloseTo(0);
  });
});

describe('minRangeAt', () => {
  test('lets the camera zoom right down only over the detailed polar cap', () => {
    const cut = Math.sin((-79.5 * Math.PI) / 180);
    expect(minRangeAt(new Vector3(0, -1, 0), cut)).toBe(MIN_RANGE);
    expect(minRangeAt(new Vector3(1, -1, 0).normalize(), cut)).toBe(MIN_RANGE_GLOBAL);
  });
});
