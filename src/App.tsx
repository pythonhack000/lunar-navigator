import { useCallback, useEffect, useState } from 'react';
import { useSiteAnalysis, windowStartFor } from './hooks/useSiteAnalysis';
import { useThrottledTime } from './hooks/useThrottledTime';
import { loadTerrain, type LoadedTerrain } from './lib/loadTerrain';
import { MoonScene } from './scene/MoonScene';
import { useNavigator, type ReliefScale } from './state/store';
import { ComparePanel } from './ui/ComparePanel';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { SitePanel } from './ui/SitePanel';
import { SitePicker } from './ui/SitePicker';
import { TimeControls } from './ui/TimeControls';
import { TimelineBar } from './ui/TimelineBar';

type Props = { loaded: LoadedTerrain };

const RELIEF_OPTIONS: ReliefScale[] = [1, 3, 5];

function Navigator({ loaded }: Props) {
  const time = useThrottledTime();
  const site = useNavigator((s) => s.site);
  const setTime = useNavigator((s) => s.setTime);
  const selectSite = useNavigator((s) => s.selectSite);
  const isGlobeView = useNavigator((s) => s.isGlobeView);
  const setGlobeView = useNavigator((s) => s.setGlobeView);
  const relief = useNavigator((s) => s.relief);
  const setRelief = useNavigator((s) => s.setRelief);
  const analysis = useSiteAnalysis(loaded.terrain, site.lat, site.lon, time);
  const handlePick = useCallback(
    (lat: number, lon: number) => selectSite({ id: null, name: 'Custom site', lat, lon }),
    [selectSite],
  );

  return (
    <div className="app">
      <div className="stage">
        <SceneErrorBoundary>
          <MoonScene
            heightRange={loaded.manifest.heightTexture}
            polar={loaded.manifest.polar}
            terrain={loaded.terrain}
            onPick={handlePick}
          />
        </SceneErrorBoundary>
        <div className="stage-controls">
          <button type="button" className="view-toggle" onClick={() => setGlobeView(!isGlobeView)}>
            {isGlobeView ? 'Fly to site' : 'Whole Moon'}
          </button>
          <div className="segmented relief-control" role="group" aria-label="Relief exaggeration">
            <span>Relief</span>
            {RELIEF_OPTIONS.map((r) => (
              <button key={r} type="button" className={r === relief ? 'is-active' : undefined} aria-pressed={r === relief} onClick={() => setRelief(r)}>
                {r}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="hud">
        <header className="brand">
          <h1>Lunar Site Navigator</h1>
          <p>Sun and Earth above the real lunar horizon</p>
        </header>
        <SitePicker />
        <SitePanel analysis={analysis} time={time} />
        <ComparePanel terrain={loaded.terrain} windowStart={windowStartFor(time)} />
        <footer className="panel dock">
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
        <h1>Lunar Site Navigator</h1>
        <p>Could not load the LOLA terrain: {error}</p>
        <button type="button" className="ghost-button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="splash" aria-busy="true">
        <h1>Lunar Site Navigator</h1>
        <p>Loading LOLA terrain…</p>
      </div>
    );
  }
  return <Navigator loaded={loaded} />;
}
