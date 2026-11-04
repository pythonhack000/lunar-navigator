import { useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useMemo, useRef } from 'react';
import type { Vector3 } from 'three';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../lib/ephemeris';
import { Earth } from './Earth';
import { GLOBE_RANGE, poseToCamera, sitePose, withRange } from './globeCamera';
import { introCamera, type CameraFrame } from './introFlight';
import { equirectSampling } from './moonShader';
import { prepareColor, textureUrl } from './moonTextures';
import { createSky, updateSky, type SkyState } from './sky';
import { Stars } from './Stars';
import { Sun } from './Sun';

interface IntroSceneProps {
  lat: number;
  lon: number;
  time: number;
  /** Jump straight to the arrival frame (Skip, or reduced motion). */
  skip: boolean;
  /** Called every frame with progress 0..1 and the distance to the lunar surface in km. */
  onFrame: (progress: number, distanceKm: number) => void;
}

/** Long enough to feel like a journey, short enough that nobody reaches for Skip on a fast link. */
const FLIGHT_SECONDS = 11;
/** A slow first frame (shader compiling) must not jump the flight ahead. */
const MAX_STEP_S = 1 / 20;
/** The same framing and look as the main scene, so the hand-over is a quiet cross-fade. */
const FOV = 38;
const SUN_DISTANCE = 1500;
const STAR_RADIUS = 3000;
const SUN_RADIUS_DEG = 0.267;
const EARTH_RADIUS = EARTH_RADIUS_KM / MOON_RADIUS_KM;

const moonVertex = /* glsl */ `
  varying vec3 vUp;
  void main() {
    vUp = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The global LROC colour map lit by the real Sun, with a soft terminator; no relief at this range. */
const moonFragment = /* glsl */ `
  uniform sampler2D colorMap;
  uniform vec3 sunDir;
  varying vec3 vUp;
  const float PI = 3.141592653589793;
  ${equirectSampling}
  void main() {
    vec3 up = normalize(vUp);
    vec3 p = vec3(up.x, -up.z, up.y);
    vec2 uv = vec2(atan(p.y, p.x) / (2.0 * PI) + 0.5, asin(clamp(p.z, -1.0, 1.0)) / PI + 0.5);
    vec3 albedo = sampleEquirect(colorMap, uv).rgb;
    float mu = dot(up, sunDir);
    float light = smoothstep(-0.03, 0.12, mu) * pow(max(mu, 0.0), 0.35) * 2.6;
    gl_FragColor = vec4(albedo * (light + 0.015), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function IntroMoon({ sunDir }: { sunDir: Vector3 }) {
  const color = useTexture(textureUrl('moon_color_2k.jpg'), prepareColor);
  const uniforms = useMemo(() => ({ colorMap: { value: color }, sunDir: { value: sunDir } }), [color, sunDir]);
  return (
    <mesh>
      <sphereGeometry args={[1, 128, 64]} />
      <shaderMaterial uniforms={uniforms} vertexShader={moonVertex} fragmentShader={moonFragment} />
    </mesh>
  );
}

interface FlightProps {
  sky: SkyState;
  end: CameraFrame;
  skip: boolean;
  onFrame: IntroSceneProps['onFrame'];
}

function Flight({ sky, end, skip, onFrame }: FlightProps) {
  const camera = useThree((s) => s.camera);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current = skip ? FLIGHT_SECONDS : Math.min(FLIGHT_SECONDS, elapsed.current + Math.min(delta, MAX_STEP_S));
    const progress = elapsed.current / FLIGHT_SECONDS;
    const frame = introCamera(progress, sky.earthPos, EARTH_RADIUS, end);
    camera.position.copy(frame.position);
    camera.up.copy(frame.up);
    camera.lookAt(frame.lookAt);
    onFrame(progress, (frame.position.length() - 1) * MOON_RADIUS_KM);
  });
  return null;
}

/**
 * The opening flight from the Earth to the lunar south pole, shown while the terrain loads. It is
 * its own small scene (two 2k textures), and it ends on the exact view the main camera opens with.
 */
export function IntroScene({ lat, lon, time, skip, onFrame }: IntroSceneProps) {
  const sky = useMemo(() => {
    const s = createSky();
    updateSky(s, time);
    return s;
  }, [time]);
  const end = useMemo(() => poseToCamera(withRange(sitePose(lat, lon, sky.sunDir), GLOBE_RANGE), 1), [lat, lon, sky]);

  return (
    <Canvas camera={{ fov: FOV, near: 0.01, far: 10_000 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#000000']} />
      {/* Nothing is drawn until both bodies are ready: the first frame is already the opening shot. */}
      <Suspense fallback={null}>
        <Stars radius={STAR_RADIUS} />
        <Sun sky={sky} distance={SUN_DISTANCE} discRadius={SUN_DISTANCE * Math.tan((SUN_RADIUS_DEG * Math.PI) / 180)} />
        <IntroMoon sunDir={sky.sunDir} />
        <Earth sky={sky} radius={EARTH_RADIUS} />
        <Flight sky={sky} end={end} skip={skip} onFrame={onFrame} />
      </Suspense>
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.25} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
