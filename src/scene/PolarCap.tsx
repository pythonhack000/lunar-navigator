import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { DoubleSide, PlaneGeometry, Vector2, type Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { PolarTile } from '../lib/loadTerrain';
import { stereoRadius } from '../lib/polarGrid';
import { fromThree } from './coords';
import { snapTo, SNAP_CELLS, steppedDensity, type CameraFocus } from './globeCamera';
import { polarFragmentShader, polarVertexShader } from './moonShader';
import { prepareTerrainSet, textureUrl } from './moonTextures';

interface PolarCapProps {
  sunDir: Vector3;
  earthDir: Vector3;
  heightRange: { minM: number; maxM: number };
  polar: PolarTile;
  lighting: MoonLighting;
  focus: CameraFocus;
  /** Fade into the global maps near the outer edge (true for the outermost tile). */
  blendToGlobal: boolean;
}

export interface MoonLighting {
  sunIntensity: number;
  earthshine: number;
  bumpStrength: number;
  /** Vertical exaggeration of the drawn relief (calculations always use true heights). */
  relief: number;
  /** Faint artistic fill so shadowed slopes keep their shape. */
  fillLight: number;
}

/** Vertices are packed around the camera's focus: ~50–100 m apart there, kilometres at the far edge. */
const SEGMENTS = 1024;
const MIN_DENSITY = 0.035;
/** How quickly the grid relaxes toward uniform as the camera pulls back. */
const DENSITY_PER_RANGE = 0.5;
const SUN_RADIUS_RAD = (0.267 * Math.PI) / 180;
/** Fake craters only below the tile's own resolution, as multiples of its pixel size. */
const DETAIL_CELLS_PER_PIXEL: [number, number, number] = [2, 0.7, 0.25];
const TILE_PIXELS = 4096;

const noRaycast = () => null;
/** Width of the fade into the global maps, in degrees of latitude inside the tile edge. */
const BLEND_DEGREES = 3;
const GLOBAL_HEIGHT_SIZE = new Vector2(4096, 2048);

function detailCells(tile: PolarTile): [number, number, number] {
  const pixelKm = (2 * tile.rhoMax * MOON_RADIUS_KM) / TILE_PIXELS;
  return DETAIL_CELLS_PER_PIXEL.map((k) => k * pixelKm) as [number, number, number];
}

/** South of 80° S, drawn on a dense polar grid with ray-marched terrain shadows. */
export function PolarCap({ sunDir, earthDir, heightRange, polar, lighting, focus, blendToGlobal }: PolarCapProps) {
  // Same URLs as the globe, so these come from the texture cache rather than a second download.
  const [globalColor, globalNormal, globalHeight] = useTexture(
    [textureUrl('moon_color_8k.jpg'), textureUrl('moon_normal_8k.jpg'), textureUrl('moon_height_4k.png')],
    prepareTerrainSet,
  );
  const [color, normal, height] = useTexture(
    [`${polar.name}_color_4k.jpg`, `${polar.name}_normal_6k.jpg`, `${polar.name}_height_4k.png`].map(textureUrl),
    prepareTerrainSet,
  );

  const geometry = useMemo(() => new PlaneGeometry(2, 2, SEGMENTS, SEGMENTS), []);

  const uniforms = useMemo(
    () => ({
      colorMap: { value: color },
      normalMap: { value: normal },
      heightMap: { value: height },
      heightMin: { value: heightRange.minM },
      heightRange: { value: heightRange.maxM - heightRange.minM },
      heightScale: { value: 1 / (MOON_RADIUS_KM * 1000) },
      heightSize: { value: polar.heightSize },
      rhoMax: { value: polar.rhoMax },
      rhoEdge: { value: polar.rhoEdge },
      innerRho: { value: polar.innerRho },
      globalColorMap: { value: globalColor },
      globalNormalMap: { value: globalNormal },
      globalHeightMap: { value: globalHeight },
      globalHeightSize: { value: GLOBAL_HEIGHT_SIZE },
      blendStart: { value: blendToGlobal ? stereoRadius(polar.edgeLat - BLEND_DEGREES) : polar.rhoEdge * 2 },
      rhoEdgeBlend: { value: polar.rhoEdge },
      sunRadius: { value: SUN_RADIUS_RAD },
      sunDir: { value: sunDir },
      earthDir: { value: earthDir },
      sunIntensity: { value: lighting.sunIntensity },
      earthshine: { value: lighting.earthshine },
      bumpStrength: { value: lighting.bumpStrength },
      relief: { value: lighting.relief },
      fillLight: { value: lighting.fillLight },
      detailStrength: { value: 0.22 },
      detailCellKm: { value: detailCells(polar) },
      focus: { value: new Vector2() },
      // From a focus at one edge, the grid must still reach the opposite edge.
      extent: { value: 2 * polar.rhoMax },
      density: { value: 1 },
    }),
    [color, normal, height, globalColor, globalNormal, globalHeight, heightRange, polar, sunDir, earthDir, lighting, blendToGlobal],
  );

  useFrame(() => {
    // Polar stereographic position of the focus, kept inside the tile.
    const [x, y, z] = fromThree(focus.target);
    const density = steppedDensity(focus.range, DENSITY_PER_RANGE, MIN_DENSITY);
    // Move the grid only in whole multiples of its centre cell so vertices do not slide over the terrain.
    const step = ((uniforms.extent.value * density * 2) / SEGMENTS) * SNAP_CELLS;
    const f = new Vector2((2 * x) / (1 - z), (2 * y) / (1 - z));
    if (f.length() > polar.rhoMax) f.setLength(polar.rhoMax);
    uniforms.focus.value.set(snapTo(f.x, step), snapTo(f.y, step));
    uniforms.density.value = density;
  });

  return (
    <mesh geometry={geometry} frustumCulled={false} raycast={noRaycast}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={polarVertexShader}
        fragmentShader={polarFragmentShader}
        side={DoubleSide}
      />
    </mesh>
  );
}
