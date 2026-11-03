/**
 * Searches the annual illumination map (R = share of the year in sunlight, G = permanently
 * shadowed, B = covered) for landing spots: the sunniest pixel, or the sunniest pixel close to ice.
 */
export interface LightMap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Stereographic radius of the map's edge. */
  rhoMax: number;
}

const COVERED = 127;
const SHADOWED = 127;
/** "Next to ice": a lander can drive this far to a permanently shadowed crater. */
export const ICE_REACH_KM = 5;
const MOON_RADIUS_KM = 1737.4;

export async function loadLightMap(url: string, rhoMax: number): Promise<LightMap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`light map: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width, height, rhoMax };
}

/** Latitude/longitude at the centre of pixel `index` (south polar stereographic). */
export function pixelToLatLon(map: LightMap, index: number): { lat: number; lon: number } {
  const col = index % map.width;
  const row = Math.floor(index / map.width);
  const x = (((col + 0.5) / map.width) * 2 - 1) * map.rhoMax;
  const y = (1 - ((row + 0.5) / map.height) * 2) * map.rhoMax;
  const r = Math.hypot(x, y);
  return { lat: (2 * Math.atan(r / 2) * 180) / Math.PI - 90, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

/** Pixels within `radiusPx` of a permanently shadowed pixel. */
function nearIceMask(map: LightMap, radiusPx: number): Uint8Array {
  const { data, width, height } = map;
  const mask = new Uint8Array(width * height);
  const r2 = radiusPx * radiusPx;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      if (data[i * 4 + 2] <= COVERED || data[i * 4 + 1] <= SHADOWED) continue;
      for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        const y = row + dy;
        if (y < 0 || y >= height) continue;
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          const x = col + dx;
          if (x >= 0 && x < width && dx * dx + dy * dy <= r2) mask[y * width + x] = 1;
        }
      }
    }
  }
  return mask;
}

/** The sunniest covered pixel, optionally only among those `mask` allows. */
function sunniestIndex(map: LightMap, mask?: Uint8Array): number {
  let best = -1;
  let bestIndex = -1;
  for (let i = 0; i < map.width * map.height; i++) {
    if (map.data[i * 4 + 2] <= COVERED || (mask && !mask[i])) continue;
    if (map.data[i * 4] > best) {
      best = map.data[i * 4];
      bestIndex = i;
    }
  }
  if (bestIndex < 0) throw new Error('light map has no matching pixels');
  return bestIndex;
}

export const findSunniest = (map: LightMap) => pixelToLatLon(map, sunniestIndex(map));

/** The sunniest spot within ICE_REACH_KM of permanent shadow: power and water side by side. */
export function findSunlitNearIce(map: LightMap): { lat: number; lon: number } {
  // Near the pole the stereographic plane is at true scale (1 unit = one Moon radius).
  const kmPerPx = ((2 * map.rhoMax) / map.width) * MOON_RADIUS_KM;
  const radiusPx = Math.max(1, Math.round(ICE_REACH_KM / kmPerPx));
  return pixelToLatLon(map, sunniestIndex(map, nearIceMask(map, radiusPx)));
}
