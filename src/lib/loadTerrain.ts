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
  edgeLat: number;
  rhoEdge: number;
  rhoMax: number;
  heightSize: number;
}

export interface TerrainManifest {
  global: GridEntry;
  detailed: GridEntry[];
  heightTexture: { minM: number; maxM: number };
  polar: PolarTile;
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
  const polar = v.polar as Record<string, unknown> | undefined;
  const polarKeys = ['edgeLat', 'rhoEdge', 'rhoMax', 'heightSize'] as const;
  if (!polar || !polarKeys.every((k) => typeof polar[k] === 'number' && Number.isFinite(polar[k]))) {
    throw new Error('Terrain manifest is missing the polar tile');
  }
  return {
    global: v.global,
    detailed,
    heightTexture: { minM: heightTexture.minM, maxM: heightTexture.maxM },
    polar: {
      edgeLat: polar.edgeLat as number,
      rhoEdge: polar.rhoEdge as number,
      rhoMax: polar.rhoMax as number,
      heightSize: polar.heightSize as number,
    },
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

/** Loads the LOLA elevation grids listed in public/data/manifest.json. */
export async function loadTerrain(): Promise<LoadedTerrain> {
  const manifest = parseManifest(await (await fetchOk('data/manifest.json')).json());
  const [global, ...detailed] = await Promise.all([manifest.global, ...manifest.detailed].map(loadGrid));
  return { terrain: createTerrain(global, detailed), manifest };
}
