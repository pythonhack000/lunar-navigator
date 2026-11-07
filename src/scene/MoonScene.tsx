import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { memo, Suspense, useMemo } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { uniquePlaces } from '../data/sites';
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from '../lib/ephemeris';
import type { PolarTile, TileGridSpec } from '../lib/loadTerrain';
import type { Terrain } from '../lib/terrain';
import { siteLabel } from '../i18n';
import { siteKey, useNavigator, type SelectedSite } from '../state/store';
import { CameraRig } from './CameraRig';
import { Earth } from './Earth';
import { GroundCamera } from './GroundCamera';
import { GroundCompanion, type CompanionState } from './GroundCompanion';
import { SkyPaths } from './SkyPaths';
import type { CameraFocus } from './globeCamera';
import { createSky, updateSky, type SkyState } from './sky';
import { Terrain as TerrainMesh, type MoonLighting } from './Terrain';
import { SiteMarker } from './SiteMarker';
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

/** Moves the Sun, Earth and light directions with the simulated clock, without React re-renders. */
function SkySync({ sky }: { sky: SkyState }) {
  useFrame(() => {
    updateSky(sky, useNavigator.getState().time);
  });
  return null;
}

/** Close to the ground the near plane must shrink, or nearby terrain would be clipped away. */
function NearPlaneTuning() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const altitude = Math.max(camera.position.length() - 1, 1e-4);
    if (camera instanceof PerspectiveCamera) {
      const near = Math.min(0.05, Math.max(2e-5, altitude * 0.25));
      if (Math.abs(camera.near - near) / near > 0.05) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
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
  const focus = useMemo<CameraFocus>(() => ({ target: new Vector3(0, -1, 0), range: 1 }), []);
  const lighting = useMemo<MoonLighting>(() => ({ ...BASE_LIGHTING, relief }), [relief]);
  const sky = useMemo(() => {
    const s = createSky();
    updateSky(s, useNavigator.getState().time);
    return s;
  }, []);
  const companion = useMemo<CompanionState>(() => ({ dir: new Vector3(1, 0, 0), progress: 0, isActive: false }), []);
  const others = uniquePlaces(compare).filter((c: SelectedSite) => siteKey(c) !== siteKey(site));

  return (
    <Canvas
      camera={{ position: [0, -1.6, 2.2], fov: 38, near: 0.01, far: 10_000 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#000000']} />
      <SkySync sky={sky} />
      <NearPlaneTuning />
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
      <SiteMarker lat={site.lat} lon={site.lon} label={siteLabel(site, lang)} isPrimary />
      {others.map((c) => (
        <SiteMarker key={siteKey(c)} lat={c.lat} lon={c.lon} label={siteLabel(c, lang)} isPrimary={false} />
      ))}
      <CameraRig lat={site.lat} lon={site.lon} sunDir={sky.sunDir} isGlobeView={isGlobeView} flyNonce={flyNonce} terrain={terrain} relief={relief} focus={focus} polarEdgeLat={polar.edgeLat} outerEdgeLat={polarOuter?.edgeLat} onPick={onPick} hold={!introDone} />
      <GroundCamera lat={site.lat} lon={site.lon} terrain={terrain} sky={sky} focus={focus} companion={companion} />
      {isGroundView && <SkyPaths lat={site.lat} lon={site.lon} terrain={terrain} sky={sky} />}
      <GroundCompanion lat={site.lat} lon={site.lon} sky={sky} companion={companion} />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.25} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
});
