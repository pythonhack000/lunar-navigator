import { describe, expect, test } from 'vitest';
import { MODEL_HEIGHT, lunaAnchorFromRects, transformShare, transformStage } from '../lunaAnchor';

const canvas = { left: 0, top: 0, width: 1000, height: 800 };
const FOV = 38;
const tanHalf = Math.tan((FOV * Math.PI) / 360);

/** Where a camera-space direction lands on the canvas, in pixels. */
const toPixels = (v: { x: number; y: number; z: number }) => ({
  x: ((v.x / -v.z / (tanHalf * (canvas.width / canvas.height)) + 1) / 2) * canvas.width,
  y: ((1 - v.y / -v.z / tanHalf) / 2) * canvas.height,
});

describe('lunaAnchorFromRects', () => {
  test('puts the model on the 2D bot, with its origin below the centre as in the model', () => {
    const rect = { left: 600, top: 100, width: 76, height: 84 };
    const anchor = lunaAnchorFromRects(rect, canvas, FOV);
    const at = toPixels(anchor!.place);
    expect(at.x).toBeCloseTo(638, 3);
    expect(at.y).toBeGreaterThan(142);
    expect(at.y).toBeLessThan(142 + 84 * 0.2);
  });

  test('sizes the model to the height of the 2D bot', () => {
    const anchor = lunaAnchorFromRects({ left: 0, top: 0, width: 76, height: 84 }, canvas, FOV);
    const heightPx = MODEL_HEIGHT * anchor!.sizeOverDistance * (canvas.height / (2 * tanHalf));
    expect(heightPx).toBeCloseTo(84, 5);
  });

  test('accounts for where the canvas sits on the page', () => {
    const shifted = { ...canvas, left: 100, top: 50 };
    const a = lunaAnchorFromRects({ left: 600, top: 100, width: 76, height: 84 }, canvas, FOV);
    const b = lunaAnchorFromRects({ left: 700, top: 150, width: 76, height: 84 }, shifted, FOV);
    expect(b!.place.x).toBeCloseTo(a!.place.x, 6);
    expect(b!.place.y).toBeCloseTo(a!.place.y, 6);
  });

  test('gives nothing for a bot that takes up no space on screen', () => {
    expect(lunaAnchorFromRects({ left: 10, top: 10, width: 0, height: 0 }, canvas, FOV)).toBeNull();
  });
});

describe('transformShare', () => {
  test('runs from nothing at the start of the flight to complete early on', () => {
    expect(transformShare(0)).toBe(0);
    expect(transformShare(0.05)).toBeGreaterThan(0);
    expect(transformShare(0.05)).toBeLessThan(1);
    expect(transformShare(0.2)).toBe(1);
    expect(transformShare(1)).toBe(1);
  });
});

describe('transformStage', () => {
  test('starts as the flat 2D bot facing you', () => {
    const stage = transformStage(0);
    expect(stage.botTurnDeg).toBe(0);
    expect(stage.isModelShown).toBe(false);
  });

  test('turns the 2D bot edge-on before the model takes over', () => {
    expect(transformStage(0.49).botTurnDeg).toBeGreaterThan(85);
    expect(transformStage(0.51).botTurnDeg).toBeNull();
    expect(transformStage(0.51).isModelShown).toBe(true);
  });

  test('the model comes out flat and edge-on', () => {
    const stage = transformStage(0.5);
    expect(stage.modelDepth).toBeLessThan(0.1);
    expect(stage.modelTurnRad).toBeCloseTo(Math.PI / 2, 5);
  });

  test('ends as the full model facing you, with the flash gone', () => {
    const stage = transformStage(1);
    expect(stage.modelDepth).toBeCloseTo(1, 5);
    expect(stage.modelTurnRad).toBeCloseTo(0, 5);
    expect(stage.flash).toBeCloseTo(0, 5);
  });

  test('flashes brightest at the moment of the change', () => {
    expect(transformStage(0.5).flash).toBeCloseTo(1, 5);
    expect(transformStage(0.1).flash).toBeLessThan(0.5);
  });
});
