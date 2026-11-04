import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { localFrame, lookDirection, yawPitchOf } from '../groundView';

const up = new Vector3(0.1, -0.99, 0.08).normalize();

describe('ground view directions', () => {
  test('the local frame is orthonormal and level', () => {
    const { north, east } = localFrame(up);
    expect(north.dot(up)).toBeCloseTo(0, 9);
    expect(east.dot(up)).toBeCloseTo(0, 9);
    expect(north.dot(east)).toBeCloseTo(0, 9);
    expect(north.length()).toBeCloseTo(1, 9);
  });

  test('yaw and pitch survive a round trip through a direction', () => {
    for (const [yaw, pitch] of [[0, 0], [1.2, 0.1], [-2.5, -0.2], [3, 0.4]]) {
      const back = yawPitchOf(up, lookDirection(up, yaw, pitch));
      expect(Math.cos(back.yaw - yaw)).toBeCloseTo(1, 6);
      expect(back.pitch).toBeCloseTo(pitch, 6);
    }
  });

  test('a body above the horizon has a positive pitch', () => {
    const { north } = localFrame(up);
    const sun = north.clone().multiplyScalar(Math.cos(0.05)).addScaledVector(up, Math.sin(0.05));
    expect(yawPitchOf(up, sun).pitch).toBeCloseTo(0.05, 6);
    expect(Math.abs(yawPitchOf(up, sun).yaw)).toBeLessThan(1e-6);
  });
});
