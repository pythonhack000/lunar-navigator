import { createPolarGrid, decodePackedHeights, type PolarGrid } from './polarGrid';
import { createTerrain, type DemGrid, type Terrain } from './terrain';

interface GridEntry {
  file: string;
  width: number;
  height: number;
  pixelsPerDegree: number;
  latTop: number;
}

/** South polar stereographic tile: radii are in the projection plane of a unit sphere. */
export interface PolarTile {
  /** Texture name prefix, e.g. "south" -> textures/south_height_4k.png. */
  name: string;
  edgeLat: number;
  rhoEdge: number;
  rhoMax: number;
  /** Radius inside which a more detailed tile draws instead (0 for the innermost). */
  innerRho: number;
  heightSize: number;
}

/** LOLA detail tiles streamed around the camera (see scripts/make_tiles.py). */
export interface TileGridSpec {
  deg: number;
  heightPx: number;
  normalPx: number;
  firstBand: number;
  bands: number;
  cols: number;
}

export interface TerrainManifest {
  global: GridEntry;
  detailed: GridEntry[];
  heightTexture: { minM: number; maxM: number };
  polar: PolarTile;
  /** Optional ring of medium detail around the inner polar tile. */
  polarOuter?: PolarTile;
  tiles?: TileGridSpec;
}

export interface LoadedTerrain {
  terrain: Terrain;
  manifest: TerrainManifest;
}

const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

function isGridEntry(value: unknown): value is GridEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.file === 'string' &&
    ['width', 'height', 'pixelsPerDegree', 'latTop'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))
  );
}

function parseManifest(value: unknown): TerrainManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Terrain manifest is not an object');
  const v = value as Record<string, unknown>;
  const detailed = Array.isArray(v.detailed) ? v.detailed : [];
  const heightTexture = v.heightTexture as Record<string, unknown> | undefined;
  if (!isGridEntry(v.global) || !detailed.every(isGridEntry)) throw new Error('Terrain manifest has a malformed grid');
  if (typeof heightTexture?.minM !== 'number' || typeof heightTexture?.maxM !== 'number') {
    throw new Error('Terrain manifest is missing the height texture range');
  }
  const polar = parsePolarTile(v.polar);
  if (!polar) throw new Error('Terrain manifest is missing the polar tile');
  const polarOuter = parsePolarTile(v.polarOuter) ?? undefined;
  return {
    global: v.global,
    detailed,
    heightTexture: { minM: heightTexture.minM, maxM: heightTexture.maxM },
    polar,
    ...(polarOuter ? { polarOuter } : {}),
    ...(parseTiles(v.tiles) ? { tiles: parseTiles(v.tiles)! } : {}),
  };
}

function parseTiles(value: unknown): TileGridSpec | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Record<string, unknown>;
  const keys = ['deg', 'heightPx', 'normalPx', 'firstBand', 'bands', 'cols'] as const;
  if (!keys.every((k) => Number.isInteger(t[k]) && (t[k] as number) > 0)) return null;
  return { deg: t.deg as number, heightPx: t.heightPx as number, normalPx: t.normalPx as number, firstBand: t.firstBand as number, bands: t.bands as number, cols: t.cols as number };
}

function parsePolarTile(value: unknown): PolarTile | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Record<string, unknown>;
  const numeric = ['edgeLat', 'rhoEdge', 'rhoMax', 'innerRho', 'heightSize'] as const;
  if (typeof t.name !== 'string' || !/^[a-z0-9]+$/.test(t.name)) return null;
  if (!numeric.every((k) => typeof t[k] === 'number' && Number.isFinite(t[k]))) return null;
  return {
    name: t.name,
    edgeLat: t.edgeLat as number,
    rhoEdge: t.rhoEdge as number,
    rhoMax: t.rhoMax as number,
    innerRho: t.innerRho as number,
    heightSize: t.heightSize as number,
  };
}

async function fetchOk(path: string): Promise<Response> {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res;
}

async function loadGrid(entry: GridEntry): Promise<DemGrid> {
  const buffer = await (await fetchOk(entry.file)).arrayBuffer();
  const expected = entry.width * entry.height * 2;
  if (buffer.byteLength !== expected) {
    throw new Error(`${entry.file} is ${buffer.byteLength} bytes, expected ${expected}`);
  }
  return { ...entry, data: new Int16Array(buffer) };
}

/** Inner tile: every second pixel (~300 m, close to the 80 m source after reprojection); outer: every pixel (~460 m). */
const INNER_GRID_STEP = 2;
const OUTER_GRID_STEP = 1;

/**
 * The polar cap heights (LOLA 80 m map) arrive as the same packed PNG the 3D view uses; decode it
 * once more on the CPU so horizon calculations near the pole use the detailed data too.
 */
async function loadPolarGrid(manifest: TerrainManifest, tile: PolarTile, step: number): Promise<PolarGrid> {
  const blob = await (await fetchOk(`textures/${tile.name}_height_4k.png`)).blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read the polar elevation image');
  ctx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  bitmap.close();
  return createPolarGrid({
    size: Math.floor(width / step),
    rhoMax: tile.rhoMax,
    edgeLat: tile.edgeLat,
    data: decodePackedHeights(pixels, width, height, manifest.heightTexture, step),
  });
}

export interface StagedTerrain extends LoadedTerrain {
  /** The same terrain with the detailed polar grids (LOLA 80 m / 240 m), which arrive later. */
  refined: Promise<Terrain>;
}

/**
 * Loads the LOLA elevation grids listed in public/data/manifest.json in two stages: the small
 * global grids (a few MB) first, so the app opens at once; the polar grids (tens of MB) after.
 */
export async function loadTerrain(): Promise<StagedTerrain> {
  const manifest = parseManifest(await (await fetchOk('data/manifest.json')).json());
  const [global, ...detailed] = await Promise.all([manifest.global, ...manifest.detailed].map(loadGrid));
  const outer = manifest.polarOuter;
  const refined = Promise.all([
    loadPolarGrid(manifest, manifest.polar, INNER_GRID_STEP),
    outer ? loadPolarGrid(manifest, outer, OUTER_GRID_STEP) : Promise.resolve(null),
  ]).then((grids) => createTerrain(global, detailed, grids.filter((g): g is PolarGrid => g !== null)));
  return { terrain: createTerrain(global, detailed), manifest, refined };
}
