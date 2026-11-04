import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BackSide, DataTexture, FrontSide, PlaneGeometry, ShaderMaterial, TextureLoader, Vector2, Vector4, type IUniform, type Texture, type Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { PolarTile, TileGridSpec } from '../lib/loadTerrain';
import { useNavigator, whenNavigator } from '../state/store';
import { loadAtlas, tileIndex, type DetailAtlas } from './detailAtlas';
import { clipmapLevels, finestLevelFor, GRID_CELLS } from './clipmap';
import { fromThree } from './coords';
import type { CameraFocus } from './globeCamera';
import { globeFragmentShader, globeVertexShader, polarFragmentShader, polarVertexShader } from './moonShader';
import { GLOBAL_PREVIEW, prepareTerrainSet, previewUrls, textureUrl } from './moonTextures';

export interface MoonLighting {
  sunIntensity: number;
  earthshine: number;
  bumpStrength: number;
  /** Vertical exaggeration of the drawn relief (calculations always use true heights). */
  relief: number;
  /** Faint artistic fill so shadowed slopes keep their shape. */
  fillLight: number;
}

interface TerrainProps {
  sunDir: Vector3;
  earthDir: Vector3;
  heightRange: { minM: number; maxM: number };
  polar: PolarTile;
  polarOuter?: PolarTile;
  tiles?: TileGridSpec;
  lighting: MoonLighting;
  focus: CameraFocus;
}

const GLOBE_LEVELS = 10;
const POLAR_LEVELS = 9;
/** The coarsest globe level spans the full circle of longitude. */
const GLOBE_TOP_CELL = (2 * Math.PI) / GRID_CELLS;
/** The globe keeps drawing this far inside the polar mesh, so their hand-over never leaves a gap. */
const OVERLAP_DEG = 1.5;
const SUN_RADIUS_RAD = (0.267 * Math.PI) / 180;
/** Procedural craters: three octaves here plus two finer ones in the shader, all below ~600 m. */
const DETAIL_CELLS_KM: [number, number, number] = [0.6, 0.2, 0.07];
const DETAIL_STRENGTH = 0.22;
/** Stream detail tiles only once the camera is within ~870 km of the ground. */
const ATLAS_RANGE = 0.5;
const LAYER_MODES = { none: 0, light: 1, ice: 2, slope: 3 } as const;
/** Bound until the first atlas arrives; hasAtlas = 0 keeps the shader from reading it. */
const EMPTY_TEXTURE = new DataTexture(new Uint8Array(4), 1, 1);
EMPTY_TEXTURE.needsUpdate = true;

type Uniforms = Record<string, IUniform>;

const fullUrls = (name: string) => [`${name}_color_4k.jpg`, `${name}_normal_6k.jpg`, `${name}_height_4k.png`].map(textureUrl);
const GLOBAL_FULL = ['moon_color_8k.jpg', 'moon_normal_8k.jpg', 'moon_height_4k.png'].map(textureUrl);

type TerrainSet = 'global' | 'inner' | 'outer';

const loadSet = (urls: string[]): Promise<Texture[]> => {
  const loader = new TextureLoader();
  return Promise.all(urls.map((url) => loader.loadAsync(url))).then((set) => {
    prepareTerrainSet(set);
    return set;
  });
};

/** Points a set's uniforms at new textures; heights carry their own size for the shader's decode. */
function applySet(u: Uniforms, which: TerrainSet, [color, normal, height]: Texture[]): void {
  const image = height.image as { width: number; height: number };
  if (which === 'global') {
    u.globalColorMap.value = color;
    u.globalNormalMap.value = normal;
    u.globalHeightMap.value = height;
    u.globalHeightSize.value = new Vector2(image.width, image.height);
    return;
  }
  u[`${which}ColorMap`].value = color;
  u[`${which}NormalMap`].value = normal;
  u[`${which}HeightMap`].value = height;
  u[`${which}Size`].value = image.width;
}

/** A unit grid of (GRID_CELLS + 1)² vertices spanning [0, 1]², shared by every level. */
function unitGrid(): PlaneGeometry {
  const g = new PlaneGeometry(1, 1, GRID_CELLS, GRID_CELLS);
  g.translate(0.5, 0.5, 0);
  return g;
}

interface LevelMesh {
  material: ShaderMaterial;
}

function makeLevels(count: number, shared: Uniforms, vertexShader: string, fragmentShader: string, isGlobe: boolean): LevelMesh[] {
  return Array.from({ length: count }, (_, k) => {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // The polar plane maps the grid mirror-wise onto the sphere, so its triangles face away.
      side: isGlobe ? FrontSide : BackSide,
      uniforms: {
        ...shared,
        levelOrigin: { value: new Vector2() },
        levelCell: { value: 1 },
        gridCells: { value: GRID_CELLS },
        isCoarsest: { value: k === count - 1 ? 1 : 0 },
        holeRect: { value: new Vector4() },
        hasHole: { value: 0 },
      },
    });
    if (isGlobe) {
      // Where both meshes draw, the polar one wins; the globe only fills cracks behind it.
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
    return { material };
  });
}

function applyLevels(meshes: LevelMesh[], focusX: number, focusY: number, cell0: number, range: number, topOrigin: [number, number]) {
  const count = meshes.length;
  const finest = finestLevelFor(range, cell0, count);
  const levels = clipmapLevels(focusX, focusY, cell0, count, finest);
  // The coarsest level always covers the whole surface, from a fixed corner on its own lattice.
  levels[count - 1] = { ...levels[count - 1], originX: topOrigin[0], originY: topOrigin[1] };
  levels.forEach((level, k) => {
    const u = meshes[k].material.uniforms;
    u.levelOrigin.value.set(level.originX, level.originY);
    u.levelCell.value = level.cell;
    u.hasHole.value = level.hole ? 1 : 0;
    if (level.hole) u.holeRect.value.set(...level.hole);
    meshes[k].material.visible = level.visible;
  });
}

export function Terrain({ sunDir, earthDir, heightRange, polar, polarOuter, tiles, lighting, focus }: TerrainProps) {
  const globalSet = useTexture(GLOBAL_PREVIEW, prepareTerrainSet);
  const innerSet = useTexture(previewUrls(polar.name), prepareTerrainSet);
  // Without an outer ring the inner tile's textures stand in, switched off by hasOuter.
  const outerSet = useTexture(previewUrls((polarOuter ?? polar).name), prepareTerrainSet);
  const lightMap = useTexture(textureUrl('south_light_512.png'));
  const outer = polarOuter ?? polar;
  const coverRho = outer.rhoMax;

  const geometry = useMemo(unitGrid, []);
  /** Full-resolution sets once downloaded; they outlive material rebuilds (e.g. a relief change). */
  const fullSets = useRef<Partial<Record<TerrainSet, Texture[]>>>({});

  const { shared, globe, polarMeshes } = useMemo(() => {
    const [gColor, gNormal, gHeight] = globalSet as Texture[];
    const [iColor, iNormal, iHeight] = innerSet as Texture[];
    const [oColor, oNormal, oHeight] = outerSet as Texture[];
    const shared: Uniforms = {
      heightMin: { value: heightRange.minM },
      heightRange: { value: heightRange.maxM - heightRange.minM },
      heightScale: { value: 1 / (MOON_RADIUS_KM * 1000) },
      kmPerParam: { value: MOON_RADIUS_KM },
      globalHeightMap: { value: gHeight },
      globalHeightSize: { value: new Vector2(1, 1) },
      globalColorMap: { value: gColor },
      globalNormalMap: { value: gNormal },
      innerHeightMap: { value: iHeight },
      innerColorMap: { value: iColor },
      innerNormalMap: { value: iNormal },
      innerSize: { value: 1 },
      innerRhoMax: { value: polar.rhoMax },
      innerRhoEdge: { value: polar.rhoEdge },
      outerHeightMap: { value: oHeight },
      outerColorMap: { value: oColor },
      outerNormalMap: { value: oNormal },
      outerSize: { value: 1 },
      outerRhoMax: { value: outer.rhoMax },
      outerRhoEdge: { value: outer.rhoEdge },
      hasOuter: { value: polarOuter ? 1 : 0 },
      minLatitude: { value: ((outer.edgeLat - OVERLAP_DEG) * Math.PI) / 180 },
      maxPolarRho: { value: outer.rhoEdge },
      sunRadius: { value: SUN_RADIUS_RAD },
      // sunDir/earthDir are stable vectors the parent updates in place every frame.
      sunDir: { value: sunDir },
      earthDir: { value: earthDir },
      sunIntensity: { value: lighting.sunIntensity },
      earthshine: { value: lighting.earthshine },
      bumpStrength: { value: lighting.bumpStrength },
      relief: { value: lighting.relief },
      fillLight: { value: lighting.fillLight },
      detailStrength: { value: DETAIL_STRENGTH },
      detailCellKm: { value: DETAIL_CELLS_KM },
      atlasHeightMap: { value: EMPTY_TEXTURE },
      atlasNormalMap: { value: EMPTY_TEXTURE },
      atlasOrigin: { value: new Vector2() },
      atlasSpan: { value: 1 },
      atlasHeightSize: { value: 1 },
      hasAtlas: { value: 0 },
      lightMap: { value: lightMap },
      layerMode: { value: 0 },
    };
    applySet(shared, 'global', globalSet as Texture[]);
    applySet(shared, 'inner', innerSet as Texture[]);
    applySet(shared, 'outer', outerSet as Texture[]);
    return {
      shared,
      globe: makeLevels(GLOBE_LEVELS, shared, globeVertexShader, globeFragmentShader, true),
      polarMeshes: makeLevels(POLAR_LEVELS, shared, polarVertexShader, polarFragmentShader, false),
    };
  }, [globalSet, innerSet, outerSet, lightMap, heightRange, polar, polarOuter, outer, sunDir, earthDir, lighting]);

  // The previews are on screen: tell the app, then fetch the full-resolution sets one at a time,
  // the pole first since that is where the camera starts.
  const sharedRef = useRef(shared);
  // Rebuilt materials (e.g. after a relief change) start from the previews; put back the full
  // sets already downloaded before the frame is drawn.
  useLayoutEffect(() => {
    sharedRef.current = shared;
    for (const [which, set] of Object.entries(fullSets.current)) applySet(shared, which as TerrainSet, set);
  }, [shared]);
  useEffect(() => {
    useNavigator.getState().setSceneReady();
    let cancelled = false;
    const sets = fullSets.current;
    const queue: [TerrainSet, string[]][] = [
      ['inner', fullUrls(polar.name)],
      ...(polarOuter ? [['outer', fullUrls(polarOuter.name)] as [TerrainSet, string[]]] : []),
      ['global', GLOBAL_FULL],
    ];
    (async () => {
      // Decoding 4k-8k images stalls the browser for a moment; doing it during the opening descent
      // made the camera jerk, so the sharp set starts once it has landed.
      await whenNavigator((s) => s.landed);
      for (const [which, urls] of queue) {
        if (cancelled) return;
        const set = await loadSet(urls);
        if (cancelled) {
          set.forEach((t) => t.dispose());
          return;
        }
        sets[which] = set;
        applySet(sharedRef.current, which, set);
      }
    })().catch((err: unknown) => console.warn('Full-resolution textures failed; keeping the previews', err));
    return () => {
      cancelled = true;
      for (const set of Object.values(sets)) set.forEach((t) => t.dispose());
      fullSets.current = {};
    };
  }, [polar.name, polarOuter]);

  // Streams the 3x3 block of LOLA detail tiles around the focus; swaps it in only once loaded.
  const atlas = useRef<{ current: DetailAtlas | null; loading: string | null }>({ current: null, loading: null });
  useEffect(
    () => () => {
      atlas.current.current?.heights.dispose();
      atlas.current.current?.normals.dispose();
    },
    [],
  );

  const updateAtlas = (lon: number, lat: number) => {
    if (!tiles || focus.range > ATLAS_RANGE) return;
    const { i, j } = tileIndex(lon, lat, tiles);
    if (j < tiles.firstBand - 1) return;
    const key = `${i},${j}`;
    const state = atlas.current;
    if (state.current?.key === key || state.loading === key) return;
    state.loading = key;
    loadAtlas(i, j, tiles)
      .then((next) => {
        if (state.loading !== key) {
          next.heights.dispose();
          next.normals.dispose();
          return;
        }
        state.current?.heights.dispose();
        state.current?.normals.dispose();
        state.current = next;
        state.loading = null;
        shared.atlasHeightMap.value = next.heights;
        shared.atlasNormalMap.value = next.normals;
        shared.atlasOrigin.value.set(next.originLon, next.originLat);
        shared.atlasSpan.value = next.spanRad;
        shared.atlasHeightSize.value = next.heightSize;
        shared.hasAtlas.value = 1;
      })
      .catch(() => {
        // Keep the coarse map; the next tile change retries.
        if (state.loading === key) state.loading = null;
      });
  };

  useFrame(() => {
    const [x, y, z] = fromThree(focus.target);
    const lon = Math.atan2(y, x);
    const lat = Math.asin(Math.max(-1, Math.min(1, z)));
    updateAtlas(lon, lat);
    shared.layerMode.value = LAYER_MODES[useNavigator.getState().layer];
    const globeTopLon = Math.floor((lon - Math.PI) / GLOBE_TOP_CELL) * GLOBE_TOP_CELL;
    applyLevels(globe, lon, lat, GLOBE_TOP_CELL / 2 ** (GLOBE_LEVELS - 1), focus.range, [globeTopLon, -Math.PI / 2]);

    const polarTopCell = (2 * coverRho) / GRID_CELLS;
    const px = (2 * x) / Math.max(1 - z, 1e-6);
    const py = (2 * y) / Math.max(1 - z, 1e-6);
    const pr = Math.hypot(px, py);
    const scale = pr > coverRho ? coverRho / pr : 1;
    applyLevels(polarMeshes, px * scale, py * scale, polarTopCell / 2 ** (POLAR_LEVELS - 1), focus.range, [-coverRho, -coverRho]);
  });

  const levelMesh = (m: LevelMesh, key: string) => (
    <mesh key={key} geometry={geometry} material={m.material} frustumCulled={false} raycast={() => null} />
  );

  return (
    <>
      {globe.map((m, k) => levelMesh(m, `g${k}`))}
      {polarMeshes.map((m, k) => levelMesh(m, `p${k}`))}
    </>
  );
}
