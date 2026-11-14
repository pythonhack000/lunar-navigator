/**
 * NASA Moon Trek (JPL / SSERVI) map layers, read live in the browser.
 *
 * Moon Trek serves its polar maps as WMTS tiles in south polar stereographic projection
 * (IAU2000:30120, Moon sphere of 1737.4 km): x = ρ·sin(lon), y = ρ·cos(lon), with
 * ρ = 2R·tan(45° + lat/2). Every tile matrix starts at the same top-left corner, and each zoom
 * level halves the pixel size. The service sends `Access-Control-Allow-Origin: *`, so the page can
 * read pixel values straight from the tiles.
 */
export const TREK_TILES = 'https://trek.nasa.gov/tiles/Moon/SP';
export const TILE_PX = 256;
/** Top-left corner of every polar tile matrix, metres from the pole along both axes. */
export const ORIGIN_M = 1_095_930;
export const MOON_RADIUS_M = 1_737_400;
const DEG = Math.PI / 180;

export interface TrekLayer {
  id: string;
  zoom: number;
  /** The layer covers only points south of this latitude. */
  northLimit: number;
}

/** The data layer this app reads, at its finest zoom level. */
export const TREK_LAYERS = {
  /** Share of a lunar year in sunlight, from 3,807 LROC WAC images (Speyerer et al. 2016). */
  sunlight: { id: 'WAC_POLE_ILL_PCT_SOUTH_100M', zoom: 5, northLimit: -88 },
} as const satisfies Record<string, TrekLayer>;

/** Size of one pixel at a zoom level, metres. */
export const metresPerPixel = (zoom: number): number => (2 * ORIGIN_M) / TILE_PX / 2 ** zoom;

/** Position of a point in a south polar zoom level's whole pixel grid (not one tile). */
export function trekPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const rho = 2 * MOON_RADIUS_M * Math.tan((45 + lat / 2) * DEG);
  const res = metresPerPixel(zoom);
  return { x: (ORIGIN_M + rho * Math.sin(lon * DEG)) / res, y: (ORIGIN_M - rho * Math.cos(lon * DEG)) / res };
}

/**
 * The same for the north polar maps (IAU2000:30118): longitude 0 points down from the pole, so
 * y = −ρ·cos(lon), with ρ = 2R·tan(45° − lat/2). Checked against the global mosaic (r = 0.85 over
 * 40 points; the other three orientations score below 0.2).
 */
export function trekPixelNorth(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const rho = 2 * MOON_RADIUS_M * Math.tan((45 - lat / 2) * DEG);
  const res = metresPerPixel(zoom);
  return { x: (ORIGIN_M + rho * Math.sin(lon * DEG)) / res, y: (ORIGIN_M + rho * Math.cos(lon * DEG)) / res };
}

export function tileUrl(layer: TrekLayer, zoom: number, row: number, col: number): string {
  return `${TREK_TILES}/${layer.id}/1.0.0/default/default028mm/${zoom}/${row}/${col}.png`;
}

export const covers = (layer: TrekLayer, lat: number): boolean => lat <= layer.northLimit;

/** Decoded RGBA pixels of one tile. */
export interface TilePixels {
  data: Uint8ClampedArray;
  width: number;
}

export type TileLoader = (url: string) => Promise<TilePixels>;

/**
 * A layer's value at a point as a share (0..1), or null where the layer has no data (outside its
 * area, or a transparent pixel). The grey level 0..255 maps linearly onto 0..100%. Rejects when the
 * tile cannot be downloaded.
 */
export async function trekShare(layer: TrekLayer, lat: number, lon: number, load: TileLoader): Promise<number | null> {
  if (!covers(layer, lat)) return null;
  const { x, y } = trekPixel(lat, lon, layer.zoom);
  const col = Math.floor(x / TILE_PX);
  const row = Math.floor(y / TILE_PX);
  const tile = await load(tileUrl(layer, layer.zoom, row, col));
  const i = (Math.floor(y - row * TILE_PX) * tile.width + Math.floor(x - col * TILE_PX)) * 4;
  return tile.data[i + 3] === 0 ? null : tile.data[i] / 255;
}
