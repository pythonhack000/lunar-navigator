import { useCallback, useEffect, useState } from 'react';
import { useSiteAnalysis, windowStartFor } from './hooks/useSiteAnalysis';
import { useSiteScore } from './hooks/useSiteScore';
import { translate } from './i18n';
import { useThrottledTime } from './hooks/useThrottledTime';
import { loadTerrain, type LoadedTerrain } from './lib/loadTerrain';
import { prefetchAll } from './lib/prefetch';
import { firstTextures } from './scene/moonTextures';
import { MoonScene } from './scene/MoonScene';
import { useNavigator, whenNavigator } from './state/store';
import { Assistant } from './ui/Assistant';
import { useLangScramble } from './ui/useLangScramble';
import { CameraStatus } from './ui/CameraStatus';
import { LoadingBar } from './ui/LoadingBar';
import { StartScreen } from './ui/StartScreen';
import { ComparePanel } from './ui/ComparePanel';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { SitePanel } from './ui/SitePanel';
import { SitePicker } from './ui/SitePicker';
import { TimeControls } from './ui/TimeControls';
import { TimelineBar } from './ui/TimelineBar';
import { ValidationPanel } from './ui/ValidationPanel';
import { GroundHud } from './ui/GroundHud';

type Props = { loaded: LoadedTerrain };


function Navigator({ loaded }: Props) {
  const time = useThrottledTime();
  const site = useNavigator((s) => s.site);
  const setTime = useNavigator((s) => s.setTime);
  const selectSite = useNavigator((s) => s.selectSite);
  const analysis = useSiteAnalysis(loaded.terrain, site.lat, site.lon, time);
  const score = useSiteScore(loaded.terrain, loaded.manifest.polar.rhoMax, analysis);
  const isValidationOpen = useNavigator((s) => s.isValidationOpen);
  const isGroundView = useNavigator((s) => s.isGroundView);
  const setValidationOpen = useNavigator((s) => s.setValidationOpen);
  const closeValidation = useCallback(() => setValidationOpen(false), [setValidationOpen]);
  const lang = useNavigator((s) => s.lang);
  useLangScramble();
  const handlePick = useCallback(
    (lat: number, lon: number) => selectSite({ id: null, name: '', kind: 'custom', lat, lon }),
    [selectSite],
  );

  return (
    <div className={isGroundView ? 'app is-ground' : 'app'}>
      <div className="stage">
        <SceneErrorBoundary>
          <MoonScene
            heightRange={loaded.manifest.heightTexture}
            polar={loaded.manifest.polar}
            polarOuter={loaded.manifest.polarOuter}
            tiles={loaded.manifest.tiles}
            terrain={loaded.terrain}
            onPick={handlePick}
          />
        </SceneErrorBoundary>
        <CameraStatus polarRhoMax={loaded.manifest.polar.rhoMax} />
        <LoadingBar />
        <GroundHud />
      </div>
      <div className="hud">
        <header className="brand">
          <h1>{translate(lang, 'brand.title')}</h1>
          <p>{translate(lang, 'brand.subtitle')}</p>
        </header>
        <SitePicker />
        <SitePanel analysis={analysis} score={score} terrain={loaded.terrain} time={time} />
        <ComparePanel terrain={loaded.terrain} windowStart={windowStartFor(time)} />
        <Assistant analysis={analysis} score={score} terrain={loaded.terrain} windowStart={windowStartFor(time)} polarRhoMax={loaded.manifest.polar.rhoMax} />
        {isValidationOpen && <ValidationPanel terrain={loaded.terrain} onClose={closeValidation} />}
        <footer className="panel dock" data-tour="timeline">
          <TimeControls />
          <TimelineBar timeline={analysis.timeline} link={analysis.link} time={time} onSeek={setTime} />
        </footer>
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedTerrain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadShare, setDownloadShare] = useState(0);
  const lang = useNavigator((s) => s.lang);
  const introArrived = useNavigator((s) => s.introArrived);

  useEffect(() => {
    let cancelled = false;
    loadTerrain()
      .then(({ refine, ...base }) => {
        if (cancelled) return;
        const polarNames = [base.manifest.polar.name, ...(base.manifest.polarOuter ? [base.manifest.polarOuter.name] : [])];
        // The Moon's first textures download during the opening flight, so the 3D scene later
        // starts from cache. It mounts only after both, never mid-flight, where its shader
        // compilation would make the flight stutter.
        prefetchAll(firstTextures(polarNames), (share) => !cancelled && setDownloadShare(share)).then(() => !cancelled && setLoaded(base));
        // The detailed grids wait until the camera has landed, so parsing them neither delays the
        // Moon nor jerks the descent; horizons then sharpen from the 4 px/° grid to LOLA's polar maps.
        whenNavigator((s) => s.landed)
          .then(refine)
          .then((terrain) => {
            if (cancelled) return;
            setLoaded({ ...base, terrain });
            useNavigator.getState().setTerrainDetailed();
          })
          .catch((e: unknown) => console.warn('Detailed terrain failed to load', e));
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="splash" role="alert">
        <h1>{translate(lang, 'brand.title')}</h1>
        <p>{translate(lang, 'loadError', { e: error })}</p>
        <button type="button" className="ghost-button" onClick={() => window.location.reload()}>{translate(lang, 'retry')}</button>
      </div>
    );
  }
  return (
    <>
      {loaded && introArrived && <Navigator loaded={loaded} />}
      <StartScreen downloadShare={downloadShare} />
    </>
  );
}
