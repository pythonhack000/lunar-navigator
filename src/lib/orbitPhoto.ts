import { metresPerPixel, MOON_RADIUS_M, TILE_PX, trekPixel, trekPixelNorth } from './moonTrek';

/**
 * Which Moon Trek image mosaic shows a site from orbit, and how to cut a square around it:
 * LROC NAC at 1 m/px near the south pole, the LROC WAC polar mosaics beyond 60°, and the global
 * WAC mosaic elsewhere. The global one is equirectangular, so it is squeezed sideways by cos(lat)
 * to keep craters round.
 */
type Projection = 'south' | 'north' | 'cylindrical';

export interface PhotoSource {
  id: string;
  folder: 'SP' | 'NP' | 'EQ';
  ext: 'png' | 'jpg';
  zoom: number;
  projection: Projection;
  /** Source pixels are drawn this many times larger (the polar WAC mosaics stop at a coarse zoom). */
  magnify: number;
  /** Coarsest and finest zoom levels Moon Trek serves for this mosaic. */
  minZoom: number;
  maxZoom: number;
  /** For the caption: the camera and its resolution. */
  camera: 'nac' | 'wac';
}

const NAC_NORTH_LIMIT = -85.6;
const POLAR_WAC_FROM = 60;
const DEG = Math.PI / 180;

export const PHOTO_SOURCES = {
  nac: { id: 'LRO_NAC_Mosaic_1mpp_SP', folder: 'SP', ext: 'png', zoom: 9, projection: 'south', magnify: 1, minZoom: 5, maxZoom: 12, camera: 'nac' },
  south: { id: 'LRO_WAC_Mosaic_SPole60_100m_v02', folder: 'SP', ext: 'png', zoom: 5, projection: 'south', magnify: 2, minZoom: 2, maxZoom: 5, camera: 'wac' },
  north: { id: 'LRO_WAC_Mosaic_NPole60_100m_v02', folder: 'NP', ext: 'png', zoom: 5, projection: 'north', magnify: 2, minZoom: 2, maxZoom: 5, camera: 'wac' },
  global: { id: 'LRO_WAC_Mosaic_Global_303ppd_v02', folder: 'EQ', ext: 'jpg', zoom: 8, projection: 'cylindrical', magnify: 1, minZoom: 4, maxZoom: 8, camera: 'wac' },
} as const satisfies Record<string, PhotoSource>;

export function photoSourceFor(lat: number): PhotoSource {
  if (lat <= NAC_NORTH_LIMIT) return PHOTO_SOURCES.nac;
  if (lat <= -POLAR_WAC_FROM) return PHOTO_SOURCES.south;
  if (lat >= POLAR_WAC_FROM) return PHOTO_SOURCES.north;
  return PHOTO_SOURCES.global;
}

/**
 * The view's level of detail as a (fractional) zoom: the mosaic's own default, moved by the
 * visitor's zoom steps, never coarser than the mosaic's first level nor more than twice as sharp as
 * its finest. Tiles come from the nearest real level at or below it and are drawn larger to match.
 * Away from the equator the global mosaic reads one level coarser for the same view, so the
 * sideways squeeze needs fewer tiles.
 */
const HIGH_LATITUDE = 45;
const MAX_UPSCALE_LEVELS = 1;

function viewLevel(source: PhotoSource, step: number): number {
  const level = source.zoom + Math.log2(source.magnify) + step;
  return Math.min(source.maxZoom + MAX_UPSCALE_LEVELS, Math.max(source.minZoom, level));
}

function levelFor(source: PhotoSource, lat: number, step: number): { zoom: number; magnify: number; level: number } {
  const level = viewLevel(source, step);
  const finest = source.projection === 'cylindrical' && Math.abs(lat) > HIGH_LATITUDE ? source.maxZoom - 1 : source.maxZoom;
  const zoom = Math.max(source.minZoom, Math.min(finest, Math.floor(level)));
  return { zoom, magnify: 2 ** (level - zoom), level };
}

/** Columns in the whole global grid at a zoom: two tiles wide at zoom 0. */
const cylinderColumns = (zoom: number): number => 2 ** (zoom + 1);

function sourcePixel(source: PhotoSource, lat: number, lon: number, zoom: number): { x: number; y: number } {
  if (source.projection === 'south') return trekPixel(lat, lon, zoom);
  if (source.projection === 'north') return trekPixelNorth(lat, lon, zoom);
  const width = TILE_PX * cylinderColumns(zoom);
  const wrapped = ((((lon + 180) % 360) + 360) % 360) / 360;
  return { x: wrapped * width, y: ((90 - lat) / 180) * (width / 2) };
}

export interface PhotoTile {
  url: string;
  /** Where the tile's top-left corner lands on the square, and its drawn size. */
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export interface PhotoPlan {
  source: PhotoSource;
  tiles: PhotoTile[];
  /** Ground size of one pixel of the square, metres. */
  metresPerPixel: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

/**
 * Tiles that cover a `size`-pixel square centred on the site, and where each one is drawn. `step`
 * zooms the view: +1 is twice as close, −1 twice as far.
 */
export function photoPlan(lat: number, lon: number, size: number, step = 0): PhotoPlan {
  const source = photoSourceFor(lat);
  const { zoom, magnify, level } = levelFor(source, lat, step);
  const { x, y } = sourcePixel(source, lat, lon, zoom);
  const squeeze = source.projection === 'cylindrical' ? Math.max(Math.cos(lat * DEG), 0.05) : 1;
  const scaleX = magnify * squeeze;
  const scaleY = magnify;
  const left = x - size / scaleX / 2;
  const top = y - size / scaleY / 2;
  const right = left + size / scaleX;
  const bottom = top + size / scaleY;
  const columns = cylinderColumns(zoom);
  const tiles: PhotoTile[] = [];
  for (let row = Math.floor(top / TILE_PX); row < Math.ceil(bottom / TILE_PX); row++) {
    for (let col = Math.floor(left / TILE_PX); col < Math.ceil(right / TILE_PX); col++) {
      const servedCol = source.projection === 'cylindrical' ? ((col % columns) + columns) % columns : col;
      tiles.push({
        url: `https://trek.nasa.gov/tiles/Moon/${source.folder}/${source.id}/1.0.0/default/default028mm/${zoom}/${row}/${servedCol}.${source.ext}`,
        dx: (col * TILE_PX - left) * scaleX,
        dy: (row * TILE_PX - top) * scaleY,
        width: TILE_PX * scaleX,
        height: TILE_PX * scaleY,
      });
    }
  }
  const sourceMetres =
    source.projection === 'cylindrical' ? (Math.PI * MOON_RADIUS_M) / (TILE_PX * cylinderColumns(zoom) / 2) : metresPerPixel(zoom);
  return {
    source,
    tiles,
    metresPerPixel: sourceMetres / scaleY,
    canZoomIn: level < source.maxZoom + MAX_UPSCALE_LEVELS,
    canZoomOut: level > source.minZoom,
  };
}

const SCALE_BARS_KM = [0.5, 1, 2, 5, 10, 20, 50] as const;
/** The bar should cover roughly this share of the square. */
const SCALE_BAR_SHARE = 0.22;

/** A round scale-bar length for the square, km, and the share of the width it covers. */
export function scaleBar(metresPerPx: number, size: number): { km: number; share: number } {
  const widthKm = (metresPerPx * size) / 1000;
  const km = SCALE_BARS_KM.reduce((best, k) => (Math.abs(k / widthKm - SCALE_BAR_SHARE) < Math.abs(best / widthKm - SCALE_BAR_SHARE) ? k : best));
  return { km, share: km / widthKm };
}
