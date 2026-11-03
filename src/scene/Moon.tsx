import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vector3 } from 'three';
import { MOON_RADIUS_KM } from '../lib/ephemeris';
import { moonFragmentShader, moonVertexShader } from './moonShader';
import { prepareTerrainSet, textureUrl } from './moonTextures';
import type { MoonLighting } from './PolarCap';

interface MoonProps {
  sunDir: Vector3;
  earthDir: Vector3;
  heightRange: { minM: number; maxM: number };
  polarEdgeLat: number;
  lighting: MoonLighting;
}

const SEGMENTS: [number, number] = [1024, 512];
/** Fake craters only below the ~2 km resolution of the global elevation data. */
const DETAIL_CELLS_KM: [number, number, number] = [1.6, 0.55, 0.19];

export function Moon({ sunDir, earthDir, heightRange, polarEdgeLat, lighting }: MoonProps) {
  const [color, normal, height] = useTexture(
    [textureUrl('moon_color_8k.jpg'), textureUrl('moon_normal_6k.jpg'), textureUrl('moon_height_2k.png')],
    prepareTerrainSet,
  );

  const uniforms = useMemo(
    () => ({
      colorMap: { value: color },
      normalMap: { value: normal },
      heightMap: { value: height },
      heightMin: { value: heightRange.minM },
      heightRange: { value: heightRange.maxM - heightRange.minM },
      heightScale: { value: 1 / (MOON_RADIUS_KM * 1000) },
      polarCutZ: { value: Math.sin((polarEdgeLat * Math.PI) / 180) },
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
    }),
    [color, normal, height, heightRange, polarEdgeLat, sunDir, earthDir, lighting],
  );


  return (
    <mesh>
      <sphereGeometry args={[1, ...SEGMENTS]} />
      <shaderMaterial uniforms={uniforms} vertexShader={moonVertexShader} fragmentShader={moonFragmentShader} />
    </mesh>
  );
}
