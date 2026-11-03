import { useProgress } from '@react-three/drei';
import { useT } from '../i18n';
import { useNavigator } from '../state/store';

/** After the Moon is up: a quiet note while sharper textures and detail tiles stream in. */
export function LoadingBar() {
  const t = useT();
  const sceneReady = useNavigator((s) => s.sceneReady);
  const { active, progress } = useProgress();
  if (!sceneReady || !active) return null;
  const percent = Math.round(progress);
  return (
    <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span>{t('loadingDetail')}</span>
      <span className="loading-bar__track"><span style={{ width: `${percent}%` }} /></span>
    </div>
  );
}
