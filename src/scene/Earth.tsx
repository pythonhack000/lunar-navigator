import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BackSide, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three';
import type { SkyState } from './sky';

interface EarthProps {
  sky: SkyState;
  radius: number;
  /**
   * 0..1: how far the night side is lifted so the continents still read there. 0 (the default) is the
   * honest look; the opening flight uses more, because around new Moon it only ever sees the night side.
   */
  nightFill?: number;
  /** Day map file under textures/; the opening uses a lighter one on slow links. */
  dayMap?: string;
}

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform vec3 sunDir;
  uniform float nightFill;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vNormal);
    float light = smoothstep(-0.08, 0.25, dot(n, sunDir));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    // The night side keeps a faint blue tint and an atmosphere rim, so the Earth never vanishes
    // into the black sky when its dark face is turned to the camera (around new Moon).
    vec3 albedo = texture2D(dayMap, vUv).rgb;
    vec3 night = albedo * mix(vec3(0.05, 0.07, 0.12), vec3(0.34, 0.38, 0.5), nightFill) + vec3(0.25, 0.45, 0.9) * rim * 0.35;
    vec3 color = albedo * light * 1.6 + vec3(0.35, 0.6, 1.0) * rim * light * 0.8 + night * (1.0 - light);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // Brightest where the line of sight grazes the planet, fading to nothing at the shell's own
    // rim, so close up the atmosphere reads as a glow rather than a second hard edge.
    float facing = abs(dot(normalize(vNormal), viewDir));
    float edge = smoothstep(0.0, 0.28, facing) * (1.0 - smoothstep(0.28, 0.9, facing));
    float lit = smoothstep(-0.3, 0.4, dot(normalize(vNormal), sunDir));
    gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * edge * lit * 1.4, edge * lit);
  }
`;

const HALO_SCALE = 1.04;

export function Earth({ sky, radius, nightFill = 0, dayMap = 'earth_2k.jpg' }: EarthProps) {
  const group = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const sunDir = sky.sunDir;
  const day = useTexture(`${import.meta.env.BASE_URL}textures/${dayMap}`);
  useEffect(() => {
    day.colorSpace = SRGBColorSpace;
    day.needsUpdate = true;
  }, [day]);

  // sunDir is mutated in place by the parent, so the uniform objects can stay stable.
  const surface = useMemo(
    () => ({ dayMap: { value: day }, sunDir: { value: sunDir }, nightFill: { value: nightFill } }),
    [day, sunDir, nightFill],
  );
  const halo = useMemo(() => ({ sunDir: { value: sunDir } }), [sunDir]);
  const scaleVec = useMemo(() => new Vector3(radius, radius, radius), [radius]);

  useFrame(() => {
    group.current?.position.copy(sky.earthPos);
    // Spin the day map so the right face of the Earth points at the Moon.
    body.current?.matrix.copy(sky.earthRotation).scale(scaleVec);
  });

  return (
    <group ref={group}>
      <mesh ref={body} matrixAutoUpdate={false}>
        <sphereGeometry args={[1, 96, 48]} />
        <shaderMaterial uniforms={surface} vertexShader={earthVertex} fragmentShader={earthFragment} />
      </mesh>
      <mesh scale={radius * HALO_SCALE}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial
          uniforms={halo}
          vertexShader={earthVertex}
          fragmentShader={haloFragment}
          side={BackSide}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
