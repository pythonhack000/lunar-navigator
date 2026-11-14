import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, type Group } from 'three';
import type { SkyState } from './sky';

interface SunProps {
  sky: SkyState;
  distance: number;
  /** Apparent disc radius in scene units at `distance`. */
  discRadius: number;
}

const GLOW_TO_DISC = 18;
const TEXTURE_SIZE = 256;

function radialTexture(stops: [number, string][]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const half = TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Without air to scatter light the Sun is a hard white disc; the glow is the camera's lens, not a sky. */
export function Sun({ sky, distance, discRadius }: SunProps) {
  const group = useRef<Group>(null);
  const disc = useMemo(
    () => radialTexture([[0, '#ffffff'], [0.42, '#ffffff'], [0.5, 'rgba(255,244,220,0.9)'], [1, 'rgba(255,220,170,0)']]),
    [],
  );
  const glow = useMemo(
    () => radialTexture([[0, 'rgba(255,236,200,0.55)'], [0.15, 'rgba(255,210,150,0.16)'], [1, 'rgba(255,190,120,0)']]),
    [],
  );

  useFrame(() => {
    group.current?.position.copy(sky.sunDir).multiplyScalar(distance);
  });

  return (
    <group ref={group}>
      <sprite scale={discRadius * 2.4}>
        <spriteMaterial map={disc} color={[6, 5.6, 5]} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={discRadius * GLOW_TO_DISC}>
        <spriteMaterial map={glow} color={[2, 1.8, 1.5]} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}
