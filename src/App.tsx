import { useCallback, useEffect, useState } from 'react';
import { useSiteAnalysis } from './hooks/useSiteAnalysis';
import { useSiteScore } from './hooks/useSiteScore';
import { translate } from './i18n';
import { useThrottledTime } from './hooks/useThrottledTime';
import { globalGridUrl, loadManifest, loadTerrain, type LoadedTerrain } from './lib/loadTerrain';
import { prefetchAll, type DownloadProgress } from './lib/prefetch';
import { judgeThisLink } from './lib/linkSignals';
import { firstTextures } from './scene/moonTextures';
import { MoonScene } from './scene/MoonScene';
import { useNavigator, whenNavigator } from './state/store';
import { Assistant } from './ui/Assistant';
import { useLangScramble } from './ui/useLangScramble';
import { CameraStatus } from './ui/CameraStatus';
import { ControlsHint } from './ui/ControlsHint';
import { NextTip } from './ui/NextTip';
import { GpuNotice } from './ui/GpuNotice';
import { LoadingBar } from './ui/LoadingBar';
import { MobileTabs } from './ui/MobileTabs';
import { StartScreen } from './ui/StartScreen';
import { ComparePanel } from './ui/ComparePanel';
import { SceneErrorBoundary } from './ui/SceneErrorBoundary';
import { SitePanel } from './ui/SitePanel';
import { SitePicker } from './ui/SitePicker';
import { TimeControls } from './ui/TimeControls';
import { TimelineBar } from './ui/TimelineBar';
import { ValidationPanel } from './ui/ValidationPanel';
import { GroundArrows } from './ui/GroundArrows';
import { GroundHud } from './ui/GroundHud';
import { GroundTalk } from './ui/GroundTalk';
import { FlatMap } from './ui/FlatMap';
import { SiteSearch } from './ui/SiteSearch';
import { SearchChip } from './ui/SearchChip';
import { useSiteSearchRunner } from './hooks/useSiteSearchRunner';

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
  const mobileTab = useNavigator((s) => s.mobileTab);
  const graphicsTier = useNavigator((s) => s.graphicsTier);
  const isFlat = graphicsTier === 'none';
  const isSearchOpen = useNavigator((s) => s.openTool === 'search');
  const setOpenTool = useNavigator((s) => s.setOpenTool);
  const closeSearch = useCallback(() => setOpenTool(null), [setOpenTool]);
  useLangScramble();
  useSiteSearchRunner(loaded.terrain, loaded.manifest.polar.rhoMax);
  const markTip = useNavigator((s) => s.markTip);
  const handlePick = useCallback(
    (lat: number, lon: number) => {
      selectSite({ id: null, name: '', kind: 'custom', lat, lon });
      markTip('pick');
    },
    [selectSite, markTip],
  );

  return (
    <div className={isGroundView ? 'app is-ground' : 'app'} data-tab={mobileTab} data-graphics={graphicsTier}>
      <div className="stage">
        {isFlat ? (
          <FlatMap
            polar={loaded.manifest.polarOuter ?? loaded.manifest.polar}
            inner={loaded.manifest.polarOuter ? loaded.manifest.polar : undefined}
            onPick={handlePick}
          />
        ) : (
          <>
            <SceneErrorBoundary fallBackToMap>
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
            <ControlsHint />
            <GpuNotice />
            <GroundHud />
            <GroundArrows />
          </>
        )}
        <NextTip />
        <SearchChip />
      </div>
      <div className="hud">
        <header className="brand">
          <h1>{translate(lang, 'brand.title')}</h1>
          <p>{translate(lang, 'brand.subtitle')}</p>
        </header>
        <SitePicker />
        <GroundTalk analysis={analysis} score={score} />
        <SitePanel analysis={analysis} score={score} terrain={loaded.terrain} time={time} />
        <ComparePanel terrain={loaded.terrain} windowStart={analysis.windowStart} />
        <Assistant analysis={analysis} score={score} terrain={loaded.terrain} windowStart={analysis.windowStart} polarRhoMax={loaded.manifest.polar.rhoMax} />
        {isValidationOpen && <ValidationPanel terrain={loaded.terrain} onClose={closeValidation} />}
        {isSearchOpen && <SiteSearch polar={loaded.manifest.polar} onClose={closeSearch} />}
        <footer className="panel dock" data-tour="timeline">
          <TimeControls />
          <TimelineBar timeline={analysis.timeline} link={analysis.link} time={time} onSeek={setTime} />
        </footer>
        <MobileTabs />
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

/** Byte sizes of the textures and data files (written at build time); empty if missing, the bar then learns as it goes. */
async function loadAssetSizes(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/sizes.json`);
    return res.ok ? ((await res.json()) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** "textures/x.jpg" from the full URL the app requests. */
const assetPath = (url: string): string => url.slice(import.meta.env.BASE_URL.length);

/** The longest the terrain download waits for the opening flight's first frame. */
const INTRO_FIRST_MS = 8000;

export default function App() {
  const [loaded, setLoaded] = useState<LoadedTerrain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const lang = useNavigator((s) => s.lang);
  const introArrived = useNavigator((s) => s.introArrived);

  useEffect(() => {
    let cancelled = false;
    const report = (progress: DownloadProgress) => !cancelled && setDownload(progress);
    (async () => {
      const manifest = await loadManifest();
      // The opening's own Earth and Moon go first: on a slow link, starting everything at once kept
      // the screen black for a minute. A browser without WebGL never starts it, hence the time limit.
      await Promise.race([whenNavigator((st) => st.introStarted), new Promise((r) => window.setTimeout(r, INTRO_FIRST_MS))]);
      if (cancelled) return;
      const polarNames = [manifest.polar.name, ...(manifest.polarOuter ? [manifest.polarOuter.name] : [])];
      // The global elevation grid and the Moon's first textures download together during the
      // opening flight, under one progress bar in bytes. The 3D scene mounts only after both, from
      // cache, never mid-flight, where its shader compilation would make the flight stutter.
      const grid = globalGridUrl(manifest);
      const sizes = await loadAssetSizes();
      const download = await prefetchAll([grid, ...firstTextures(polarNames)], report, { keep: [grid], sizeOf: (url) => sizes[assetPath(url)] });
      const { refine, ...base } = await loadTerrain(manifest, download.kept.get(grid));
      if (cancelled) return;
      useNavigator.getState().setSlowLink(judgeThisLink(download) === 'slow');
      setLoaded(base);
      // The detailed grids wait until the camera has landed, so parsing them neither delays the
      // Moon nor jerks the descent; horizons then sharpen from the 4 px/° grid to LOLA's polar maps.
      whenNavigator((st) => st.landed)
        .then(refine)
        .then((terrain) => {
          if (cancelled) return;
          setLoaded({ ...base, terrain });
          useNavigator.getState().setTerrainDetailed();
        })
        .catch((e: unknown) => console.warn('Detailed terrain failed to load', e));
    })().catch((e: unknown) => !cancelled && setError(errorMessage(e)));
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
      <StartScreen download={download} />
    </>
  );
}
