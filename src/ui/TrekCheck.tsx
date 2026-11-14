import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { formatPercent } from '../lib/format';
import { covers, TREK_LAYERS, trekShare } from '../lib/moonTrek';
import { photoPlan, scaleBar } from '../lib/orbitPhoto';
import type { Terrain } from '../lib/terrain';
import { loadTileBitmap, loadTilePixels } from '../lib/trekTiles';
import { illuminationOverYear } from '../lib/validation';
import { useNavigator } from '../state/store';
import { Dialog } from './Dialog';

/** Undefined while loading, 'offline' if Moon Trek did not answer, null where its map has no data. */
type Reading = number | null | 'offline' | undefined;

interface Place {
  lat: number;
  lon: number;
}

const MOON_TREK_URL = 'https://trek.nasa.gov/moon/';
const PHOTO_PX = 512;

/**
 * Our own year of sunlight at the point, computed after the panel has painted so it never delays
 * it, and only once the detailed terrain is in: the coarse first grid flattens ridges and reads dark.
 */
function useOurYear(terrain: Terrain, { lat, lon }: Place): number | undefined {
  const isReady = useNavigator((s) => s.isTerrainDetailed);
  const [year, setYear] = useState<{ key: string; value: number }>();
  const key = `${lat}:${lon}`;
  useEffect(() => {
    if (!isReady) return undefined;
    const start = Date.UTC(new Date().getUTCFullYear(), 0, 1);
    const timer = setTimeout(() => setYear({ key, value: illuminationOverYear(terrain, lat, lon, start).sunlitShare }), 0);
    return () => clearTimeout(timer);
  }, [isReady, terrain, lat, lon, key]);
  return isReady && year?.key === key ? year.value : undefined;
}

/** NASA's LROC WAC year of sunlight at the point, read from the Moon Trek tile. */
function useNasaYear({ lat, lon }: Place): Reading {
  const [reading, setReading] = useState<{ key: string; value: Reading }>();
  const key = `${lat}:${lon}`;
  const isCovered = covers(TREK_LAYERS.sunlight, lat);
  useEffect(() => {
    if (!isCovered) return undefined;
    let alive = true;
    trekShare(TREK_LAYERS.sunlight, lat, lon, loadTilePixels)
      .then((value) => alive && setReading({ key, value }))
      .catch((err: unknown) => {
        console.warn('Moon Trek unavailable; showing our model only', err);
        if (alive) setReading({ key, value: 'offline' });
      });
    return () => {
      alive = false;
    };
  }, [isCovered, lat, lon, key]);
  if (!isCovered) return null;
  return reading?.key === key ? reading.value : undefined;
}

function Share({ reading }: { reading: Reading }) {
  const t = useT();
  if (reading === undefined) return <span className="muted">…</span>;
  if (reading === 'offline' || reading === null) return <span className="muted" title={t(reading === null ? 'trek.wacArea' : 'trek.offline')}>—</span>;
  return <>{formatPercent(reading)}</>;
}

/** Wheel travel that counts as one zoom step, so a trackpad swipe does not race through every level. */
const WHEEL_STEP = 90;

/**
 * LROC imagery around the site from Moon Trek, centred on it, with a ring on the exact point. The
 * visitor can zoom in and out (buttons, wheel, double click); the old view stays up until the new
 * level has arrived.
 */
function OrbitPhoto({ lat, lon }: Place) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [shownStep, setShownStep] = useState<number | null>(null);
  const plan = photoPlan(lat, lon, PHOTO_PX, step);
  const shownPlan = photoPlan(lat, lon, PHOTO_PX, shownStep ?? step);
  const bar = scaleBar(shownPlan.metresPerPixel, PHOTO_PX);
  const zoomIn = useCallback(() => setStep((s) => (photoPlan(lat, lon, PHOTO_PX, s).canZoomIn ? s + 1 : s)), [lat, lon]);
  const zoomOut = useCallback(() => setStep((s) => (photoPlan(lat, lon, PHOTO_PX, s).canZoomOut ? s - 1 : s)), [lat, lon]);

  useEffect(() => {
    let alive = true;
    const { tiles } = photoPlan(lat, lon, PHOTO_PX, step);
    Promise.all(tiles.map((tile) => loadTileBitmap(tile.url).then((bitmap) => ({ ...tile, bitmap }))))
      .then((loaded) => {
        const ctx = canvas.current?.getContext('2d');
        if (!alive || !ctx) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
        // Whole pixels with a one-pixel overlap, or smoothing leaves dark seams between tiles.
        for (const tile of loaded) {
          const x = Math.floor(tile.dx);
          const y = Math.floor(tile.dy);
          ctx.drawImage(tile.bitmap, x, y, Math.ceil(tile.dx + tile.width) - x + 1, Math.ceil(tile.dy + tile.height) - y + 1);
        }
        setShownStep(step);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        console.warn('Moon Trek photo unavailable', err);
        if (alive) setStatus('offline');
      });
    return () => {
      alive = false;
    };
  }, [lat, lon, step]);

  // The wheel must not scroll the dialog behind the photo, so it is a non-passive listener.
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    let travel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      travel += e.deltaY;
      if (Math.abs(travel) < WHEEL_STEP) return;
      if (travel < 0) zoomIn();
      else zoomOut();
      travel = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomIn, zoomOut]);

  const isSwitching = status === 'ready' && shownStep !== step;
  return (
    <div className={isSwitching ? 'orbit__frame is-switching' : 'orbit__frame'} ref={frame} onDoubleClick={zoomIn}>
      <canvas ref={canvas} width={PHOTO_PX} height={PHOTO_PX} role="img" aria-label={t('trek.photoAlt')} />
      <span className="orbit__ring" aria-hidden="true" />
      {status === 'ready' && <span className="orbit__scale" style={{ width: `${bar.share * 100}%` }}>{bar.km} km</span>}
      <div className="orbit__zoom">
        <button type="button" aria-label={t('trek.zoomIn')} title={t('trek.zoomIn')} disabled={!plan.canZoomIn} onClick={zoomIn}>+</button>
        <button type="button" aria-label={t('trek.zoomOut')} title={t('trek.zoomOut')} disabled={!plan.canZoomOut} onClick={zoomOut}>−</button>
      </div>
      {status !== 'ready' && <span className="orbit__status">{t(status === 'loading' ? 'trek.loading' : 'trek.photoOffline')}</span>}
    </div>
  );
}

interface OrbitDialogProps extends Place {
  ours: number | undefined;
  nasa: Reading;
  onClose: () => void;
}

function OrbitDialog({ lat, lon, ours, nasa, onClose }: OrbitDialogProps) {
  const t = useT();
  const note = nasa === 'offline' ? 'trek.offline' : nasa === null ? 'trek.wacArea' : 'trek.why';
  const camera = photoPlan(lat, lon, PHOTO_PX).source.camera;
  return (
    <Dialog title={t('trek.dialogTitle')} subtitle={t(camera === 'nac' ? 'trek.dialogSub' : 'trek.dialogSubWac')} className="orbit" onClose={onClose}>
      <OrbitPhoto lat={lat} lon={lon} />
      <dl className="orbit__compare">
        <div>
          <dt>{t('trek.oursLong')}</dt>
          <dd><Share reading={ours} /></dd>
        </div>
        <div>
          <dt>{t('trek.nasaLong')}</dt>
          <dd>{nasa === null ? <span className="orbit__none">{t('trek.noMap')}</span> : <Share reading={nasa} />}</dd>
        </div>
      </dl>
      <p className="muted orbit__note">{t(note)}</p>
      <p className="muted orbit__credit">
        {t(camera === 'nac' ? 'trek.photoCredit' : 'trek.photoCreditWac')} · <a href={MOON_TREK_URL} target="_blank" rel="noopener noreferrer">Moon Trek</a>
      </p>
    </Dialog>
  );
}

interface NasaStripProps extends Place {
  terrain: Terrain;
}

/**
 * Two lines under the site score, the same everywhere: our year of sunlight beside NASA's LROC WAC
 * figure where Moon Trek has that map (88–90°S), then the photo from orbit and the accuracy check.
 */
export function NasaStrip({ lat, lon, terrain }: NasaStripProps) {
  const t = useT();
  const setValidationOpen = useNavigator((s) => s.setValidationOpen);
  const isOrbitOpen = useNavigator((s) => s.openTool === 'orbit');
  const setTool = useNavigator((s) => s.setOpenTool);
  const closeOrbit = useCallback(() => setTool(null), [setTool]);
  const ours = useOurYear(terrain, { lat, lon });
  const nasa = useNasaYear({ lat, lon });
  const hasNasaMap = covers(TREK_LAYERS.sunlight, lat);

  return (
    <div className="nasa-strip" data-tour="nasa" data-nasa-map={hasNasaMap ? 'yes' : 'no'}>
      <div className="nasa-strip__row">
        <span className="muted">{t('trek.sunYear')}</span>
        <span className="nasa-strip__values">
          <span><b><Share reading={ours} /></b> {t('trek.ours')}</span>
          {hasNasaMap ? (
            <span title={t('trek.nasaLong')}><b><Share reading={nasa} /></b> NASA</span>
          ) : (
            <span className="muted" title={t('trek.wacArea')}>{t('trek.noMap')}</span>
          )}
        </span>
      </div>
      <div className="nasa-strip__row">
        <button type="button" className="link-button" data-tour="nasa-photo" title={t('trek.photoHint')} onClick={() => setTool('orbit')}>{t('trek.photo')}</button>
        <button type="button" className="link-button" data-tour="nasa-check" title={t('trek.checkHint')} onClick={() => setValidationOpen(true)}>{t('trek.check')}</button>
      </div>
      {isOrbitOpen && <OrbitDialog lat={lat} lon={lon} ours={ours} nasa={nasa} onClose={closeOrbit} />}
    </div>
  );
}
