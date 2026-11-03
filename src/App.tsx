import { useCallback, useEffect, useState } from 'react';
import { useSiteAnalysis, windowStartFor } from './hooks/useSiteAnalysis';
import { translate } from './i18n';
import { useThrottledTime } from './hooks/useThrottledTime';
import { loadTerrain, type LoadedTerrain } from './lib/loadTerrain';
import { MoonScene } from './scene/MoonScene';
import { useNavigator } from './state/store';
import { Assistant } from './ui/Assistant';
import { useLangScramble } from './ui/useLangScramble';
import { CameraStatus } from './ui/CameraStatus';
import { ComparePanel } from './ui/ComparePanel';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { SitePanel } from './ui/SitePanel';
import { SitePicker } from './ui/SitePicker';
import { TimeControls } from './ui/TimeControls';
import { TimelineBar } from './ui/TimelineBar';

type Props = { loaded: LoadedTerrain };


function Navigator({ loaded }: Props) {
  const time = useThrottledTime();
  const site = useNavigator((s) => s.site);
  const setTime = useNavigator((s) => s.setTime);
  const selectSite = useNavigator((s) => s.selectSite);
  const analysis = useSiteAnalysis(loaded.terrain, site.lat, site.lon, time);
  const lang = useNavigator((s) => s.lang);
  useLangScramble();
  const handlePick = useCallback(
    (lat: number, lon: number) => selectSite({ id: null, name: '', kind: 'custom', lat, lon }),
    [selectSite],
  );

  return (
    <div className="app">
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
      </div>
      <div className="hud">
        <header className="brand">
          <h1>{translate(lang, 'brand.title')}</h1>
          <p>{translate(lang, 'brand.subtitle')}</p>
        </header>
        <SitePicker />
        <SitePanel analysis={analysis} time={time} />
        <ComparePanel terrain={loaded.terrain} windowStart={windowStartFor(time)} />
        <Assistant analysis={analysis} terrain={loaded.terrain} windowStart={windowStartFor(time)} />
        <footer className="panel dock" data-tour="timeline">
          <TimeControls />
          <TimelineBar timeline={analysis.timeline} time={time} onSeek={setTime} />
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
  const lang = useNavigator((s) => s.lang);

  useEffect(() => {
    let cancelled = false;
    loadTerrain()
      .then((result) => !cancelled && setLoaded(result))
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
  if (!loaded) {
    return (
      <div className="splash" aria-busy="true">
        <h1>{translate(lang, 'brand.title')}</h1>
        <p>{translate(lang, 'loading')}</p>
      </div>
    );
  }
  return <Navigator loaded={loaded} />;
}
