import { useCallback, useEffect, useRef, useState } from 'react';
import { translate, type StringKey } from '../i18n';
import { IntroScene } from '../scene/IntroScene';
import { useNavigator } from '../state/store';

/** The bar starts here (the elevation grid) and the first textures fill the rest. */
const GRID_SHARE = 5;
/** Long enough for the cross-fade in index.css. */
const FADE_MS = 900;
/** Captions change at these shares of the flight. */
const CRUISE_FROM = 0.2;
const ARRIVAL_FROM = 0.72;

type Caption = Extract<StringKey, 'intro.leaving' | 'intro.cruise' | 'intro.arrival'>;

const captionAt = (progress: number): Caption =>
  progress < CRUISE_FROM ? 'intro.leaving' : progress < ARRIVAL_FROM ? 'intro.cruise' : 'intro.arrival';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The opening: a flight from the Earth to the lunar south pole while the NASA terrain downloads.
 * It hands over to the main camera, which then descends to the site, once both the flight has
 * arrived and the Moon is ready; until then a thin bar shows the download.
 */
export function StartScreen({ downloadShare }: { downloadShare: number }) {
  const lang = useNavigator((s) => s.lang);
  const sceneReady = useNavigator((s) => s.sceneReady);
  const finishIntro = useNavigator((s) => s.finishIntro);
  const arriveIntro = useNavigator((s) => s.arriveIntro);
  const [{ lat, lon, time }] = useState(() => {
    const { site, time: now } = useNavigator.getState();
    return { lat: site.lat, lon: site.lon, time: now };
  });
  const [skip, setSkip] = useState(prefersReducedMotion);
  const [started, setStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [caption, setCaption] = useState<Caption>('intro.leaving');
  const [gone, setGone] = useState(false);
  const distanceRef = useRef<HTMLSpanElement>(null);
  const shownKm = useRef(-1);
  const handOver = arrived && sceneReady;

  const handleFrame = useCallback(
    (flightProgress: number, distanceKm: number) => {
      setStarted(true);
      setCaption(captionAt(flightProgress));
      if (flightProgress >= 1) setArrived(true);
      // Written straight to the DOM: React need not re-render sixty times a second for a counter.
      const km = Math.round(distanceKm / 100) * 100;
      if (km === shownKm.current || !distanceRef.current) return;
      shownKm.current = km;
      distanceRef.current.textContent = translate(lang, 'intro.distance', { km: km.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US') });
    },
    [lang],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === ' ') && setSkip(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The 3D scene mounts once the flight has stopped, so compiling it cannot make the flight stutter.
  useEffect(() => {
    if (arrived) arriveIntro();
  }, [arrived, arriveIntro]);

  useEffect(() => {
    if (!handOver) return;
    finishIntro();
    const timer = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [handOver, finishIntro]);

  if (gone) return null;
  const percent = Math.min(99, Math.round(GRID_SHARE + downloadShare * (95 - GRID_SHARE)));
  const waiting = arrived && !sceneReady;

  return (
    <div className={`intro${started ? ' is-live' : ''}${handOver ? ' is-done' : ''}`} aria-busy={!sceneReady} data-no-scramble>
      <IntroScene lat={lat} lon={lon} time={time} skip={skip} onFrame={handleFrame} />
      <div className="intro__titles">
        <h1>{translate(lang, 'brand.title')}</h1>
        <p>{translate(lang, waiting ? 'loadingScene' : caption)}</p>
        <span ref={distanceRef} className="intro__distance" />
      </div>
      <div className="intro__foot">
        <div className="intro__track" role="progressbar" aria-label={translate(lang, 'loadingScene')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <small>{percent}%</small>
        {!arrived && (
          <button type="button" className="ghost-button intro__skip" onClick={() => setSkip(true)}>
            {translate(lang, 'intro.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
