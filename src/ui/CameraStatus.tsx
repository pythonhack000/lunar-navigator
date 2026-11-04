import { useT } from '../i18n';
import { findSunlitNearIce, findSunniest, getLightMap } from '../lib/lightMap';
import { useNavigator, type MapLayer, type ReliefScale } from '../state/store';

type Props = { polarRhoMax: number };

const RELIEF_OPTIONS: ReliefScale[] = [1, 3, 5];
const LAYERS: MapLayer[] = ['none', 'light', 'ice', 'slope'];
/** Above this the view reads as "the whole Moon", so the button offers to fly back down. */
const GLOBE_ALTITUDE_KM = 2500;

function formatAltitude(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`;
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
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

  const flyToSpot = async (kind: 'brightest' | 'nearIce') => {
    try {
      const map = await getLightMap(polarRhoMax);
      const { lat, lon } = kind === 'brightest' ? findSunniest(map) : findSunlitNearIce(map);
      selectSite({ id: null, name: '', kind, lat, lon });
    } catch (err) {
      // The layer stays on and the button can be pressed again.
      console.warn('Light map search failed', err);
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
      {layer === 'slope' && (
        <div className="layer-note">
          <span className="layer-key layer-key--slope" />
          {t('layer.slopeLegend')}
        </div>
      )}
      {(layer === 'light' || layer === 'ice') && (
        <div className="layer-note">
          <span className={`layer-key layer-key--${layer}`} />
          {t(layer === 'light' ? 'layer.lightLegend' : 'layer.iceLegend')}
          <button type="button" className="link-button" onClick={() => void flyToSpot(layer === 'light' ? 'brightest' : 'nearIce')}>
            {t(layer === 'light' ? 'layer.brightest' : 'layer.nearIce')} →
          </button>
        </div>
      )}
    </div>
  );
}
