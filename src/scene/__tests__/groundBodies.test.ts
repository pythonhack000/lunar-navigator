import { describe, expect, test } from 'vitest';
import { edgePoint, toScreen } from '../groundBodies';

describe('toScreen', () => {
  test('a body ahead and inside the frame needs no arrow', () => {
    expect(toScreen(0.2, -0.3, false, false).isInFrame).toBe(true);
  });

  test('a body off to the side is outside the frame', () => {
    expect(toScreen(2.5, 0, false, false).isInFrame).toBe(false);
  });

  test('behind the camera the direction flips, and it never counts as in the frame', () => {
    const body = toScreen(0.4, 0.1, true, false);
    expect(body.isInFrame).toBe(false);
    expect(body.x).toBe(-0.4);
    expect(body.y).toBe(-0.1);
  });

  test('keeps whether the body is below the horizon', () => {
    expect(toScreen(0, 0, false, true).isBelowHorizon).toBe(true);
  });
});

describe('edgePoint', () => {
  const box = { left: 0, top: 0, right: 200, bottom: 100 };

  test('leaves through the side the direction points at', () => {
    expect(edgePoint(box, 1, 0)).toMatchObject({ x: 200, y: 50, angle: 0 });
    expect(edgePoint(box, 0, -1).y).toBe(0);
    expect(edgePoint(box, -1, 0).x).toBe(0);
  });

  test('stays on the box for a diagonal', () => {
    const p = edgePoint(box, 1, 1);
    expect(p.y).toBe(100);
    expect(p.x).toBe(150);
  });
});
