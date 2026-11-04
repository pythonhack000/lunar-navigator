import { Vector3 } from 'three';
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
});
