import { MOON_RADIUS_KM } from './ephemeris';
import type { Terrain } from './terrain';
import { DEG, wrapAz } from './vec';

export interface HorizonProfile {
  /** Elevation of the terrain horizon, degrees, one value per azimuth step starting at north. */
  elevationsDeg: Float32Array;
  stepDeg: number;
  siteHeightM: number;
}

export interface HorizonOptions {
  azimuthSteps?: number;
  maxDistanceKm?: number;
  /** Height of the observer (camera, antenna, solar panel) above the ground, metres. */
  observerHeightM?: number;
}

const DEFAULT_AZIMUTH_STEPS = 720;
const DEFAULT_MAX_DISTANCE_KM = 300;
const DEFAULT_OBSERVER_HEIGHT_M = 2;
/** Skip the first kilometre: the elevation grid is too coarse to resolve the ground right under the lander. */
const FIRST_SAMPLE_KM = 1;
const SAMPLE_GROWTH = 1.015;

function sampleDistancesKm(maxKm: number): number[] {
  const out: number[] = [];
  for (let d = FIRST_SAMPLE_KM, step = 0.25; d <= maxKm; d += step, step *= SAMPLE_GROWTH) out.push(d);
  return out;
}

/** Point reached by travelling `angle` radians along a great circle on `bearing` radians. */
function destination(lat: number, lon: number, bearing: number, angle: number): [number, number] {
  const sinLat = Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing);
  const lat2 = Math.asin(sinLat);
  const lon2 =
    lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * sinLat);
  return [lat2, lon2];
}

/**
 * Terrain horizon around a site. There is no atmosphere on the Moon, so the horizon in each
 * direction is simply the highest angle at which terrain (or the curve of the sphere) blocks the sky.
 */
export function computeHorizon(terrain: Terrain, latDeg: number, lonDeg: number, options: HorizonOptions = {}): HorizonProfile {
  const steps = options.azimuthSteps ?? DEFAULT_AZIMUTH_STEPS;
  const maxKm = options.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;
  const observerM = options.observerHeightM ?? DEFAULT_OBSERVER_HEIGHT_M;
  const siteHeightM = terrain.heightAt(latDeg, lonDeg);
  const observerR = MOON_RADIUS_KM + (siteHeightM + observerM) / 1000;
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const samples = sampleDistancesKm(maxKm).map((d) => {
    const angle = d / MOON_RADIUS_KM;
    return { angle, sin: Math.sin(angle), cos: Math.cos(angle) };
  });
  const elevationsDeg = new Float32Array(steps);

  for (let i = 0; i < steps; i++) {
    const bearing = (i * 360 * DEG) / steps;
    let best = -Math.PI / 2;
    for (const s of samples) {
      const [pLat, pLon] = destination(lat, lon, bearing, s.angle);
      const r = MOON_RADIUS_KM + terrain.heightAt(pLat / DEG, pLon / DEG) / 1000;
      const el = Math.atan2(r * s.cos - observerR, r * s.sin);
      if (el > best) best = el;
    }
    elevationsDeg[i] = best / DEG;
  }
  return { elevationsDeg, stepDeg: 360 / steps, siteHeightM };
}

/** Horizon elevation in a given direction, linearly interpolated between profile samples. */
export function horizonAt(profile: HorizonProfile, azDeg: number): number {
  const { elevationsDeg, stepDeg } = profile;
  const f = wrapAz(azDeg) / stepDeg;
  const i = Math.floor(f) % elevationsDeg.length;
  const j = (i + 1) % elevationsDeg.length;
  const t = f - Math.floor(f);
  return elevationsDeg[i] * (1 - t) + elevationsDeg[j] * t;
}
