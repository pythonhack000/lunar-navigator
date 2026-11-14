import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { memo, Suspense, useMemo, useState } from 'react';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { uniquePlaces } from '../data/sites';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../lib/ephemeris';
import type { PolarTile, TileGridSpec } from '../lib/loadTerrain';
import type { Terrain } from '../lib/terrain';
import { TIER_SETTINGS, tierOrLow } from '../lib/graphicsTier';
import { siteLabel } from '../i18n';
import { siteKey, useNavigator, type SelectedSite } from '../state/store';
import { unitToLatLon } from '../lib/vec';
import { AdaptiveResolution } from './AdaptiveResolution';
import { fromThree } from './coords';
import { FrameRateWatch } from './FrameRateWatch';
import { CameraRig } from './CameraRig';
import { Earth } from './Earth';
import { GroundCamera } from './GroundCamera';
import { GroundCompanion, type CompanionState } from './GroundCompanion';
import { SkyPaths } from './SkyPaths';
import type { CameraFocus } from './globeCamera';
import { createSky, updateSky, type SkyState } from './sky';
import { Terrain as TerrainMesh, type MoonLighting } from './Terrain';
import { SiteMarker } from './SiteMarker';
import { SearchMarks } from './SearchMarks';
import { Stars } from './Stars';
import { Sun } from './Sun';

interface MoonSceneProps {
  heightRange: { minM: number; maxM: number };
  polar: PolarTile;
  polarOuter?: PolarTile;
  tiles?: TileGridSpec;
  terrain: Terrain;
  onPick: (lat: number, lon: number) => void;
}

const SUN_DISTANCE = 1500;
const STAR_RADIUS = 3000;
const SUN_RADIUS_DEG = 0.267;
const BASE_LIGHTING = { sunIntensity: 2.8, earthshine: 0.06, bumpStrength: 1.6, fillLight: 0.09 };
/** Standing on the ground at night the Earth overhead is what lights it, so it must read. For the eye only. */
const GROUND_EARTHSHINE = 0.55;

/** Moves the Sun, Earth and light directions with the simulated clock, without React re-renders. */
function SkySync({ sky }: { sky: SkyState }) {
  useFrame(() => {
    updateSky(sky, useNavigator.getState().time);
  });
  return null;
}

/** Close to the ground the near plane must shrink, or nearby terrain would be clipped away. */
/** Never closer than this, in Moon radii (about 35 m): the depth buffer's precision floor. */
const NEAR_MIN = 2e-5;
const NEAR_MAX = 0.05;
/** The near plane sits at this share of the camera's height above the ground below it. */
const NEAR_SHARE = 0.25;
const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;

/**
 * Keeps the near plane a quarter of the way down to the real ground under the camera. The height
 * is measured above the terrain, not the bare sphere: at the south pole the ground stands up to
 * 5 km above it, and a plane set from the sphere cut away the ground at the visitor's feet. On the
 * surface the ground camera sets the near plane itself.
 */
function NearPlaneTuning({ terrain }: { terrain: Terrain }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera) || useNavigator.getState().isGroundView) return;
    const { lat, lon } = unitToLatLon(fromThree(camera.position.clone().normalize()));
    const groundRadius = 1 + (terrain.heightAt(lat, lon) * useNavigator.getState().relief) / MOON_RADIUS_M;
    const altitude = Math.max(camera.position.length() - groundRadius, NEAR_MIN);
    const near = Math.min(NEAR_MAX, Math.max(NEAR_MIN, altitude * NEAR_SHARE));
    if (Math.abs(camera.near - near) / near > 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/** Memoised: the panels re-render several times a second while time plays, the 3D scene must not. */
export const MoonScene = memo(function MoonScene({ heightRange, polar, polarOuter, tiles, terrain, onPick }: MoonSceneProps) {
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const isGlobeView = useNavigator((s) => s.isGlobeView);
  const flyNonce = useNavigator((s) => s.flyNonce);
  const lang = useNavigator((s) => s.lang);
  const relief = useNavigator((s) => s.relief);
  const introDone = useNavigator((s) => s.introDone);
  const isGroundView = useNavigator((s) => s.isGroundView);
  const graphics = TIER_SETTINGS[tierOrLow(useNavigator((s) => s.graphicsTier))];
  // Anti-aliasing is fixed when the canvas is made; the rest follows the tier as it drops.
  const [antialias] = useState(graphics.antialias);
  const focus = useMemo<CameraFocus>(() => ({ target: new Vector3(0, -1, 0), range: 1 }), []);
  const lighting = useMemo<MoonLighting>(() => ({ ...BASE_LIGHTING, earthshine: isGroundView ? GROUND_EARTHSHINE : BASE_LIGHTING.earthshine, relief }), [relief, isGroundView]);
  const sky = useMemo(() => {
    const s = createSky();
    updateSky(s, useNavigator.getState().time);
    return s;
  }, []);
  const companion = useMemo<CompanionState>(() => ({ dir: new Vector3(1, 0, 0), rest: new Quaternion(), progress: 0, isActive: false }), []);
  const others = uniquePlaces(compare).filter((c: SelectedSite) => siteKey(c) !== siteKey(site));

  return (
    <Canvas
      camera={{ position: [0, -1.6, 2.2], fov: 38, near: 0.01, far: 10_000 }}
      dpr={graphics.dpr}
      gl={{ antialias, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#000000']} />
      <AdaptiveResolution />
      <FrameRateWatch />
      <SkySync sky={sky} />
      <NearPlaneTuning terrain={terrain} />
      <Stars radius={STAR_RADIUS} />
      <Sun sky={sky} distance={SUN_DISTANCE} discRadius={SUN_DISTANCE * Math.tan((SUN_RADIUS_DEG * Math.PI) / 180)} />
      <Suspense fallback={null}>
        <TerrainMesh
          sunDir={sky.sunDir}
          earthDir={sky.earthDir}
          heightRange={heightRange}
          polar={polar}
          polarOuter={polarOuter}
          tiles={tiles}
          lighting={lighting}
          focus={focus}
        />
        <Earth sky={sky} radius={EARTH_RADIUS_KM / MOON_RADIUS_KM} />
      </Suspense>
      <SearchMarks />
      <SiteMarker lat={site.lat} lon={site.lon} label={siteLabel(site, lang)} isPrimary />
      {others.map((c) => (
        <SiteMarker key={siteKey(c)} lat={c.lat} lon={c.lon} label={siteLabel(c, lang)} isPrimary={false} />
      ))}
      <CameraRig lat={site.lat} lon={site.lon} sunDir={sky.sunDir} isGlobeView={isGlobeView} flyNonce={flyNonce} terrain={terrain} relief={relief} focus={focus} polarEdgeLat={polar.edgeLat} outerEdgeLat={polarOuter?.edgeLat} onPick={onPick} hold={!introDone} />
      <GroundCamera lat={site.lat} lon={site.lon} terrain={terrain} sky={sky} focus={focus} companion={companion} />
      {isGroundView && <SkyPaths lat={site.lat} lon={site.lon} terrain={terrain} sky={sky} />}
      <GroundCompanion lat={site.lat} lon={site.lon} sky={sky} companion={companion} />
      {/* Glow is the heaviest pass; without it the renderer's own ACES tone mapping stays, and the
          vignette is drawn in CSS (index.css, [data-graphics]). */}
      {graphics.glow && (
        <EffectComposer>
          <Bloom intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.25} darkness={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
});
