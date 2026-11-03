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

export interface TerrainManifest {
  global: GridEntry;
  detailed: GridEntry[];
  heightTexture: { minM: number; maxM: number };
  polar: PolarTile;
  /** Optional ring of medium detail around the inner polar tile. */
  polarOuter?: PolarTile;
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
  };
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

/** Loads the LOLA elevation grids listed in public/data/manifest.json. */
export async function loadTerrain(): Promise<LoadedTerrain> {
  const manifest = parseManifest(await (await fetchOk('data/manifest.json')).json());
  const outer = manifest.polarOuter;
  const [inner, outerGrid, global, ...detailed] = (await Promise.all([
    loadPolarGrid(manifest, manifest.polar, INNER_GRID_STEP),
    outer ? loadPolarGrid(manifest, outer, OUTER_GRID_STEP) : Promise.resolve(null),
    ...[manifest.global, ...manifest.detailed].map(loadGrid),
  ])) as [PolarGrid, PolarGrid | null, DemGrid, ...DemGrid[]];
  const polarGrids = [inner, outerGrid].filter((g): g is PolarGrid => g !== null);
  return { terrain: createTerrain(global, detailed, polarGrids), manifest };
}
