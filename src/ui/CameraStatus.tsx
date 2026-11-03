import { useT } from '../i18n';
import { useNavigator, type MapLayer, type ReliefScale } from '../state/store';

type Props = { polarRhoMax: number };

const RELIEF_OPTIONS: ReliefScale[] = [1, 3, 5];
const LAYERS: MapLayer[] = ['none', 'light', 'ice'];
/** Above this the view reads as "the whole Moon", so the button offers to fly back down. */
const GLOBE_ALTITUDE_KM = 2500;
const LIGHT_MAP_URL = `${import.meta.env.BASE_URL}textures/south_light_512.png`;

function formatAltitude(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`;
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

/** Finds the sunniest pixel of the annual light map and returns its latitude/longitude. */
async function findSunniest(rhoMax: number): Promise<{ lat: number; lon: number }> {
  const res = await fetch(LIGHT_MAP_URL);
  if (!res.ok) throw new Error(`light map: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let best = -1;
  let bestIndex = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 2] > 127 && data[i * 4] > best) {
      best = data[i * 4];
      bestIndex = i;
    }
  }
  const col = bestIndex % width;
  const row = Math.floor(bestIndex / width);
  const x = ((col + 0.5) / width * 2 - 1) * rhoMax;
  const y = (1 - (row + 0.5) / height * 2) * rhoMax;
  const r = Math.hypot(x, y);
  return { lat: (2 * Math.atan(r / 2) * 180) / Math.PI - 90, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

/** Controls above the 3D scene: view, live altitude, relief, map layer and language. */
export function CameraStatus({ polarRhoMax }: Props) {
  const t = useT();
  const altitude = useNavigator((s) => s.cameraAltitudeKm);
  const relief = useNavigator((s) => s.relief);
  const layer = useNavigator((s) => s.layer);
  const lang = useNavigator((s) => s.lang);
  const { setRelief, setLayer, setLang, flyToSite, showWholeMoon, selectSite } = useNavigator.getState();
  const isHigh = altitude > GLOBE_ALTITUDE_KM;

  const flyToSunniest = async () => {
    try {
      const { lat, lon } = await findSunniest(polarRhoMax);
      selectSite({ id: null, name: '', kind: 'brightest', lat, lon });
    } catch {
      // The layer stays on; the button can be pressed again.
    }
  };

  return (
    <div className="stage-controls" data-tour="camera">
      <div className="stage-controls__row">
        <button type="button" className="view-toggle" onClick={isHigh ? flyToSite : showWholeMoon}>
          {isHigh ? t('camera.fly') : t('camera.whole')}
        </button>
        <div className="altitude-chip" title="Camera height above the surface">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 13 9H9.5v5h-3V9H3z" /></svg>
          {formatAltitude(altitude)}
        </div>
        <button
          type="button"
          className="view-toggle"
          title={t('camera.relief')}
          onClick={() => setRelief(RELIEF_OPTIONS[(RELIEF_OPTIONS.indexOf(relief) + 1) % RELIEF_OPTIONS.length])}
        >
          {t('camera.relief')} {relief}×
        </button>
        <div className="segmented pill-group" role="group" aria-label={t('layer.label')}>
          <span>{t('layer.label')}</span>
          {LAYERS.map((l) => (
            <button key={l} type="button" className={l === layer ? 'is-active' : undefined} aria-pressed={l === layer} onClick={() => setLayer(l)}>
              {t(`layer.${l}`)}
            </button>
          ))}
        </div>
        <button type="button" className="view-toggle lang-toggle" aria-label={t('lang')} onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}>
          {lang === 'en' ? 'RU' : 'EN'}
        </button>
      </div>
      {layer !== 'none' && (
        <div className="layer-note">
          <span className={`layer-key layer-key--${layer}`} />
          {t(layer === 'light' ? 'layer.lightLegend' : 'layer.iceLegend')}
          {layer === 'light' && (
            <button type="button" className="link-button" onClick={() => void flyToSunniest()}>
              {t('layer.brightest')} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
