import { useMemo } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three';

interface StarsProps {
  radius: number;
}

const STAR_COUNT = 9000;
const SEED = 1969;

/** Small deterministic generator so the sky looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starGeometry(radius: number): BufferGeometry {
  const rand = mulberry32(SEED);
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const z = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(phi) * radius, z * radius, r * Math.sin(phi) * radius], i * 3);
    // Most stars are faint; a power curve leaves a few bright ones.
    const brightness = 0.15 + Math.pow(rand(), 6) * 1.6;
    const warmth = rand();
    colors.set([brightness * (0.85 + warmth * 0.15), brightness * 0.92, brightness * (1 - warmth * 0.2)], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export function Stars({ radius }: StarsProps) {
  const geometry = useMemo(() => starGeometry(radius), [radius]);
  return (
    <points geometry={geometry}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors blending={AdditiveBlending} depthWrite={false} />
    </points>
  );
}
