import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { translate } from '../i18n';
import { useNavigator } from '../state/store';

/** Long enough for the fade-out in index.css. */
const FADE_MS = 600;

/**
 * Full-screen loading screen shown from the first paint until the Moon is on screen: first while
 * the elevation grid arrives (no percentage yet), then with the 3D texture download progress.
 */
export function StartScreen({ terrainReady }: { terrainReady: boolean }) {
  const lang = useNavigator((s) => s.lang);
  const sceneReady = useNavigator((s) => s.sceneReady);
  const { progress } = useProgress();
  const [gone, setGone] = useState(false);
  // three.js counts files in batches, so its percentage can fall back; the bar only moves forward.
  const raw = terrainReady ? 25 + Math.round(progress * 0.75) : 0;
  const [peak, setPeak] = useState(0);
  useEffect(() => setPeak((p) => Math.max(p, raw)), [raw]);

  useEffect(() => {
    if (!sceneReady) return;
    const timer = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);

  if (gone) return null;
  // The grid is the first ~25% of the wait, the preview textures the rest.
  const percent = Math.min(99, Math.max(peak, raw));
  return (
    <div className={sceneReady ? 'start-screen is-done' : 'start-screen'} aria-busy={!sceneReady} data-no-scramble>
      <div className="start-screen__moon" aria-hidden="true" />
      <h1>{translate(lang, 'brand.title')}</h1>
      <p>{translate(lang, terrainReady ? 'loadingScene' : 'loading')}</p>
      <div className={terrainReady ? 'start-screen__track' : 'start-screen__track is-waiting'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={terrainReady ? { width: `${percent}%` } : undefined} />
      </div>
      <small>{terrainReady ? `${percent}%` : translate(lang, 'loadingHint')}</small>
    </div>
  );
}
