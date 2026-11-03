import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { MathUtils, PlaneGeometry, Vector2, Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import { fromThree, toThree } from './coords';
import { snapTo, SNAP_CELLS, steppedDensity, type CameraFocus } from './globeCamera';
import { moonFragmentShader, moonVertexShader } from './moonShader';
import { prepareTerrainSet, textureUrl } from './moonTextures';
import type { MoonLighting } from './PolarCap';

interface MoonProps {
  sunDir: Vector3;
  earthDir: Vector3;
  heightRange: { minM: number; maxM: number };
  polarEdgeLat: number;
  lighting: MoonLighting;
  focus: CameraFocus;
}

/** One grid for the whole Moon, packed around the camera's focus (see moonShader.ts). */
const SEGMENTS = 1024;
const MIN_DENSITY = 0.03;
const DENSITY_PER_RANGE = 0.5;
const HEIGHT_SIZE = new Vector2(4096, 2048);
const SUN_RADIUS_RAD = (0.267 * Math.PI) / 180;
/** Fake craters only below the ~2.6 km resolution of the global elevation data. */
const DETAIL_CELLS_KM: [number, number, number] = [1.6, 0.55, 0.19];

const noRaycast = () => null;

export function Moon({ sunDir, earthDir, heightRange, polarEdgeLat, lighting, focus }: MoonProps) {
  const [color, normal, height] = useTexture(
    [textureUrl('moon_color_8k.jpg'), textureUrl('moon_normal_8k.jpg'), textureUrl('moon_height_4k.png')],
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
      heightSize: { value: HEIGHT_SIZE },
      heightScale: { value: 1 / (MOON_RADIUS_KM * 1000) },
      polarCutZ: { value: Math.sin((polarEdgeLat * Math.PI) / 180) },
      sunRadius: { value: SUN_RADIUS_RAD },
      // sunDir/earthDir are stable vectors the parent updates in place every frame.
      sunDir: { value: sunDir },
      earthDir: { value: earthDir },
      sunIntensity: { value: lighting.sunIntensity },
      earthshine: { value: lighting.earthshine },
      bumpStrength: { value: lighting.bumpStrength },
      relief: { value: lighting.relief },
      fillLight: { value: lighting.fillLight },
      detailStrength: { value: 0.2 },
      detailCellKm: { value: DETAIL_CELLS_KM },
      focus: { value: new Vector3(0, -1, 0) },
      density: { value: 1 },
      centerSpacingKm: { value: 10 },
    }),
    [color, normal, height, heightRange, polarEdgeLat, sunDir, earthDir, lighting],
  );

  useFrame(() => {
    const density = steppedDensity(focus.range, DENSITY_PER_RANGE, MIN_DENSITY);
    // Move the grid only in whole multiples of its centre cell (as latitude/longitude steps) so
    // vertices do not slide over the terrain while the camera pans.
    const step = ((Math.PI * density * 2) / SEGMENTS) * SNAP_CELLS;
    const [x, y, z] = fromThree(focus.target);
    const lat = snapTo(Math.asin(MathUtils.clamp(z, -1, 1)), step);
    const lonStep = step / Math.max(Math.cos(lat), 0.05);
    const lon = snapTo(Math.atan2(y, x), lonStep);
    uniforms.focus.value.copy(toThree([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]));
    uniforms.density.value = density;
    uniforms.centerSpacingKm.value = (Math.PI * density * 2 * MOON_RADIUS_KM) / SEGMENTS;
  });

  // Picking intersects an analytic sphere in CameraRig, so the mesh itself is never ray-cast.
  return (
    <mesh geometry={geometry} frustumCulled={false} raycast={noRaycast}>
      <shaderMaterial uniforms={uniforms} vertexShader={moonVertexShader} fragmentShader={moonFragmentShader} />
    </mesh>
  );
}
