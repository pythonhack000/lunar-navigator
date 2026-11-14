import { angularRadiusDeg, EARTH_RADIUS_KM, MOON_RADIUS_KM, moonSky, SUN_RADIUS_KM, type MoonSky } from './ephemeris';
import { cross, DEG, dot, latLonToUnit, length, normalize, scale, sub, wrapAz, type Vec3 } from './vec';

export interface Site {
  lat: number;
  lon: number;
  /** Surface height above the 1737.4 km reference sphere, metres. */
  heightM: number;
}

export interface SkyBody {
  azDeg: number;
  elDeg: number;
  distanceKm: number;
  radiusDeg: number;
}

export interface SiteSky {
  sun: SkyBody;
  earth: SkyBody;
}

interface LocalFrame {
  position: Vec3;
  up: Vec3;
  east: Vec3;
  north: Vec3;
}

function localFrame(site: Site): LocalFrame {
  const up = latLonToUnit(site.lat, site.lon);
  // At the exact pole east is undefined; fall back to the 90°E direction.
  const rawEast = cross([0, 0, 1], up);
  const east = length(rawEast) < 1e-9 ? ([0, 1, 0] as Vec3) : normalize(rawEast);
  return {
    position: scale(up, MOON_RADIUS_KM + site.heightM / 1000),
    up,
    east,
    north: cross(up, east),
  };
}

function observe(frame: LocalFrame, target: Vec3, bodyRadiusKm: number): SkyBody {
  const rel = sub(target, frame.position);
  const dist = length(rel);
  const dir = scale(rel, 1 / dist);
  return {
    azDeg: wrapAz(Math.atan2(dot(dir, frame.east), dot(dir, frame.north)) / DEG),
    elDeg: Math.asin(Math.max(-1, Math.min(1, dot(dir, frame.up)))) / DEG,
    distanceKm: dist,
    radiusDeg: angularRadiusDeg(bodyRadiusKm, dist),
  };
}

/** Azimuth (clockwise from north) and elevation of the Sun and Earth for an observer on the Moon. */
export function siteSky(site: Site, date: Date): SiteSky {
  return siteSkyFrom(site, moonSky(date));
}

/**
 * The same, from Sun and Earth positions computed once for a moment: they do not depend on the
 * site, so a search over many sites reuses them instead of redoing the ephemeris for each.
 */
export function siteSkyFrom(site: Site, sky: Pick<MoonSky, 'sun' | 'earth'>): SiteSky {
  const frame = localFrame(site);
  return {
    sun: observe(frame, sky.sun, SUN_RADIUS_KM),
    earth: observe(frame, sky.earth, EARTH_RADIUS_KM),
  };
}
