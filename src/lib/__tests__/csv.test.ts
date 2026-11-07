import { describe, expect, test } from 'vitest';
import { csvFileName, timelineCsv } from '../csv';
import type { Timeline } from '../visibility';

const START = Date.UTC(2027, 0, 1, 6);
const timeline: Timeline = {
  start: START,
  stepMs: 3_600_000,
  sun: Float32Array.of(1, 0),
  earth: Float32Array.of(0.5, 0),
  sunElevation: Float32Array.of(1.25, -0.5),
  sunAzimuth: Float32Array.of(10, 20),
  earthElevation: Float32Array.of(3, 4),
  earthAzimuth: Float32Array.of(30, 40),
};

describe('timelineCsv', () => {
  test('writes a header and one UTC row per sample, naming the DSN station', () => {
    const lines = timelineCsv({ lat: -85.3, lon: 37 }, timeline, Int8Array.of(1, -1), Float32Array.of(1500.26, 0)).trim().split('\n');
    expect(lines[0]).toBe('time_utc,lat,lon,sun_el_deg,sun_az_deg,sun_visible,earth_el_deg,earth_az_deg,earth_visible,dsn_station,power_w');
    expect(lines[1]).toBe('2027-01-01T06:00Z,-85.3,37,1.25,10.00,1.00,3.00,30.00,0.50,Madrid,1500.3');
    expect(lines[2]).toBe('2027-01-01T07:00Z,-85.3,37,-0.50,20.00,0.00,4.00,40.00,0.00,,0.0');
    expect(lines).toHaveLength(3);
  });
});

describe('csvFileName', () => {
  test('makes a safe name from the site and date', () => {
    expect(csvFileName('Mons Mouton / Plateau', START)).toBe('lunar-site-mons-mouton-plateau-2027-01-01.csv');
    expect(csvFileName('Гора Мутон', START)).toBe('lunar-site-гора-мутон-2027-01-01.csv');
  });
});
