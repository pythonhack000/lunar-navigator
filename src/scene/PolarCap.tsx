import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { DoubleSide, PlaneGeometry, Vector2, type Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import type { PolarTile } from '../lib/loadTerrain';
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
/** Fake craters only below the ~300 m resolution of the polar elevation data. */
const DETAIL_CELLS_KM: [number, number, number] = [0.32, 0.11, 0.04];

const noRaycast = () => null;

/** South of 80° S, drawn on a dense polar grid with ray-marched terrain shadows. */
export function PolarCap({ sunDir, earthDir, heightRange, polar, lighting, focus }: PolarCapProps) {
  const [color, normal, height] = useTexture(
    [textureUrl('south_color_4k.jpg'), textureUrl('south_normal_6k.jpg'), textureUrl('south_height_4k.png')],
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
      sunRadius: { value: SUN_RADIUS_RAD },
      sunDir: { value: sunDir },
      earthDir: { value: earthDir },
      sunIntensity: { value: lighting.sunIntensity },
      earthshine: { value: lighting.earthshine },
      bumpStrength: { value: lighting.bumpStrength },
      relief: { value: lighting.relief },
      fillLight: { value: lighting.fillLight },
      detailStrength: { value: 0.22 },
      detailCellKm: { value: DETAIL_CELLS_KM },
      focus: { value: new Vector2() },
      // From a focus at one edge, the grid must still reach the opposite edge.
      extent: { value: 2 * polar.rhoMax },
      density: { value: 1 },
    }),
    [color, normal, height, heightRange, polar, sunDir, earthDir, lighting],
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
