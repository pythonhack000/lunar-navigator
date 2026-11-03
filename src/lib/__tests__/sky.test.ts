import { describe, expect, test } from 'vitest';
import { moonSky } from '../ephemeris';
import { siteSky } from '../topocentric';
import { unitToLatLon } from '../vec';

describe('moonSky', () => {
  test('keeps the sub-Earth point within the libration range of the near side centre', () => {
    // Arrange
    const dates = ['2026-01-01T00:00:00Z', '2026-04-15T12:00:00Z', '2026-11-14T06:00:00Z'];

    // Act
    const points = dates.map((d) => unitToLatLon(moonSky(new Date(d)).earth));

    // Assert
    for (const p of points) {
      expect(Math.abs(p.lat)).toBeLessThan(7.5);
      expect(Math.abs(p.lon)).toBeLessThan(8.5);
    }
  });

  test('puts the Earth about 384,000 km away', () => {
    const { earth } = moonSky(new Date('2026-11-14T00:00:00Z'));
    const km = Math.hypot(...earth);
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
  });
});

describe('siteSky', () => {
  test('matches the low morning Sun at the Apollo 11 landing (about 10.8°)', () => {
    // Arrange
    const tranquility = { lat: 0.674, lon: 23.473, heightM: 0 };

    // Act
    const { sun } = siteSky(tranquility, new Date('1969-07-20T20:17:40Z'));

    // Assert: the Sun stood in the east, roughly 11° up
    expect(sun.elDeg).toBeGreaterThan(9.5);
    expect(sun.elDeg).toBeLessThan(12.5);
    expect(sun.azDeg).toBeGreaterThan(60);
    expect(sun.azDeg).toBeLessThan(120);
  });

  test('never lets the Earth rise over the far side', () => {
    const farSide = { lat: -45.44, lon: 177.59, heightM: 0 };
    for (let day = 0; day < 30; day += 3) {
      const { earth } = siteSky(farSide, new Date(Date.UTC(2026, 10, 1 + day)));
      expect(earth.elDeg).toBeLessThan(0);
    }
  });

  test('keeps the Sun within a couple of degrees of the horizon at the south pole', () => {
    const pole = { lat: -89.5, lon: 0, heightM: 0 };
    for (let day = 0; day < 365; day += 15) {
      const { sun } = siteSky(pole, new Date(Date.UTC(2026, 0, 1 + day)));
      expect(Math.abs(sun.elDeg)).toBeLessThan(2.2);
    }
  });

  test('shows the Sun disc at about a quarter of a degree in radius', () => {
    const { sun, earth } = siteSky({ lat: 0, lon: 0, heightM: 0 }, new Date('2026-11-14T00:00:00Z'));
    expect(sun.radiusDeg).toBeCloseTo(0.27, 1);
    expect(earth.radiusDeg).toBeGreaterThan(0.85);
    expect(earth.radiusDeg).toBeLessThan(1.05);
  });
});
