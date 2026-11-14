import { useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useMemo, useRef, useState } from 'react';
import type { Vector3 } from 'three';
import { lightIntroHere } from '../lib/earlyLink';
import { TIER_SETTINGS, tierOrLow } from '../lib/graphicsTier';
import { useNavigator } from '../state/store';
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
const FLIGHT_SECONDS = 13;
/** A slow first frame (shader compiling) must not jump the flight ahead. */
const MAX_STEP_S = 1 / 20;
/** The canvas fades in over ~1.2 s (index.css); the camera waits by the Earth until it is seen. */
const START_HOLD_S = 1.6;
/** The same framing and look as the main scene, so the hand-over is a quiet cross-fade. */
const FOV = 38;
const SUN_DISTANCE = 1500;
const STAR_RADIUS = 3000;
const SUN_RADIUS_DEG = 0.267;
const EARTH_RADIUS = EARTH_RADIUS_KM / MOON_RADIUS_KM;
/** Lifts the Earth's night side in the opening shot so its continents show around new Moon. */
const INTRO_EARTH_NIGHT_FILL = 1;

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

function IntroMoon({ sunDir, file }: { sunDir: Vector3; file: string }) {
  const color = useTexture(textureUrl(file), prepareColor);
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
  const elapsed = useRef(-START_HOLD_S);
  useFrame((_, delta) => {
    elapsed.current = skip ? FLIGHT_SECONDS : Math.min(FLIGHT_SECONDS, elapsed.current + Math.min(delta, MAX_STEP_S));
    const progress = Math.max(0, elapsed.current) / FLIGHT_SECONDS;
    const frame = introCamera(progress, sky.earthPos, EARTH_RADIUS, end, sky.sunDir);
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
  // On a link under ~2 Mbit/s (timed on the app's own script) the opening uses 1K maps: a little
  // softer, but on screen in seconds instead of a black screen for a minute.
  const [light] = useState(lightIntroHere);
  // Weak machines fly the opening at their own tier: lower resolution, no anti-aliasing.
  const [graphics] = useState(() => TIER_SETTINGS[tierOrLow(useNavigator.getState().graphicsTier)]);
  const sky = useMemo(() => {
    const s = createSky();
    updateSky(s, time);
    return s;
  }, [time]);
  const end = useMemo(() => poseToCamera(withRange(sitePose(lat, lon, sky.sunDir), GLOBE_RANGE), 1), [lat, lon, sky]);

  return (
    <Canvas camera={{ fov: FOV, near: 0.01, far: 10_000 }} dpr={graphics.dpr} gl={{ antialias: graphics.antialias, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#000000']} />
      {/* Nothing is drawn until both bodies are ready: the first frame is already the opening shot. */}
      <Suspense fallback={null}>
        <Stars radius={STAR_RADIUS} />
        <Sun sky={sky} distance={SUN_DISTANCE} discRadius={SUN_DISTANCE * Math.tan((SUN_RADIUS_DEG * Math.PI) / 180)} />
        <IntroMoon sunDir={sky.sunDir} file={light ? 'moon_color_1k.jpg' : 'moon_color_2k.jpg'} />
        <Earth sky={sky} radius={EARTH_RADIUS} nightFill={INTRO_EARTH_NIGHT_FILL} dayMap={light ? 'earth_1k.jpg' : 'earth_2k.jpg'} />
        <Flight sky={sky} end={end} skip={skip} onFrame={onFrame} />
      </Suspense>
      {graphics.glow && (
        <EffectComposer>
          <Bloom intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.25} darkness={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
