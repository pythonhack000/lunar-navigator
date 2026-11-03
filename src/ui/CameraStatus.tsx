import { useNavigator, type ReliefScale } from '../state/store';

const RELIEF_OPTIONS: ReliefScale[] = [1, 3, 5];
/** Above this the view reads as "the whole Moon", so the button offers to fly back down. */
const GLOBE_ALTITUDE_KM = 2500;

function formatAltitude(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`;
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

/** Live camera height plus the view and relief controls above the 3D scene. */
export function CameraStatus() {
  const altitude = useNavigator((s) => s.cameraAltitudeKm);
  const relief = useNavigator((s) => s.relief);
  const { setRelief, flyToSite, showWholeMoon } = useNavigator.getState();
  const isHigh = altitude > GLOBE_ALTITUDE_KM;

  return (
    <div className="stage-controls" data-tour="camera">
      <button type="button" className="view-toggle" onClick={isHigh ? flyToSite : showWholeMoon}>
        {isHigh ? 'Fly to site' : 'Whole Moon'}
      </button>
      <div className="altitude-chip" aria-live="off" title="Camera height above the surface">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 13 9H9.5v5h-3V9H3z" /></svg>
        {formatAltitude(altitude)}
      </div>
      <div className="segmented relief-control" role="group" aria-label="Relief exaggeration">
        <span>Relief</span>
        {RELIEF_OPTIONS.map((r) => (
          <button key={r} type="button" className={r === relief ? 'is-active' : undefined} aria-pressed={r === relief} onClick={() => setRelief(r)}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
