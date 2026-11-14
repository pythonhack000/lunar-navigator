import { describe, expect, test } from 'vitest';
import { DEFAULT_POWER, panelShare, powerSeries, powerWatts, resolveArray, simulateEnergy, surfaceTempK } from '../power';

describe('resolveArray', () => {
  test('auto picks vertical panels near the poles and horizontal ones near the equator', () => {
    expect(resolveArray('auto', -89)).toBe('vertical');
    expect(resolveArray('auto', 20)).toBe('horizontal');
    expect(resolveArray('tracking', 20)).toBe('tracking');
  });
});

describe('panelShare', () => {
  test('a Sun at 2° barely reaches a horizontal panel but nearly fills a vertical one', () => {
    expect(panelShare('horizontal', 2, 1)).toBeCloseTo(0.035, 3);
    expect(panelShare('vertical', 2, 1)).toBeCloseTo(0.999, 3);
  });

  test('a tracking panel always faces the Sun, and terrain cuts every panel by the hidden disc', () => {
    expect(panelShare('tracking', 40, 1)).toBe(1);
    expect(panelShare('tracking', 40, 0.25)).toBe(0.25);
    expect(panelShare('vertical', 0, 0)).toBe(0);
  });

  test('a horizontal panel gets nothing with the Sun below the flat horizon', () => {
    expect(panelShare('horizontal', -1, 0.5)).toBe(0);
  });
});

describe('powerWatts', () => {
  test('is sunlight × area × efficiency × share', () => {
    expect(powerWatts({ ...DEFAULT_POWER, areaM2: 2, efficiency: 0.3 }, 0.5)).toBeCloseTo(1361 * 2 * 0.3 * 0.5, 6);
  });
});

describe('powerSeries', () => {
  test('applies the array resolved for the latitude to every sample', () => {
    const cfg = { ...DEFAULT_POWER, arrayType: 'auto' as const, areaM2: 1, efficiency: 1 };
    const series = powerSeries(cfg, -89, Float32Array.of(0, 0), Float32Array.of(1, 0));
    expect(series[0]).toBeCloseTo(1361, 3);
    expect(series[1]).toBe(0);
  });
});

describe('simulateEnergy', () => {
  const cfg = { ...DEFAULT_POWER, loadW: 100, batteryWh: 500 };

  test('adds up generation and finds no shortage when power always covers the load', () => {
    const result = simulateEnergy(Float32Array.of(200, 200, 200, 200), 1, cfg);
    expect(result.generatedKWh).toBeCloseTo(0.8, 6);
    expect(result.meanW).toBe(200);
    expect(result.firstEmptyIndex).toBeNull();
    expect(result.minCharge).toBe(1);
    expect(result.batteryNeededWh).toBe(0);
  });

  test('reports the first hour the battery runs dry and the size that would have survived', () => {
    const dark = new Float32Array(10);
    const result = simulateEnergy(dark, 1, cfg);
    expect(result.firstEmptyIndex).toBe(4);
    expect(result.minCharge).toBe(0);
    expect(result.batteryNeededWh).toBe(1000);
  });

  test('recharges between nights, so two short nights do not add up', () => {
    const series = Float32Array.of(0, 0, 400, 400, 0, 0);
    const result = simulateEnergy(series, 1, cfg);
    expect(result.firstEmptyIndex).toBeNull();
    expect(result.batteryNeededWh).toBe(200);
    expect(result.minCharge).toBeCloseTo(0.6, 6);
  });

  test('handles an empty series', () => {
    expect(simulateEnergy(new Float32Array(0), 1, cfg).meanW).toBe(0);
  });
});

describe('surfaceTempK', () => {
  test('is near 390 K under an overhead Sun and falls to the night floor in shadow', () => {
    expect(surfaceTempK(90, 1)).toBeGreaterThan(375);
    expect(surfaceTempK(90, 1)).toBeLessThan(400);
    expect(surfaceTempK(30, 0)).toBe(90);
  });

  test('stays cold under a grazing Sun', () => {
    expect(surfaceTempK(2, 1)).toBeLessThan(200);
  });
});
