import { useProgress } from '@react-three/drei';
import { useT } from '../i18n';

/** Progress of the 3D textures (colour, relief, normals), shown over the scene until they are in. */
export function LoadingBar() {
  const t = useT();
  const { active, progress } = useProgress();
  if (!active) return null;
  const percent = Math.round(progress);
  return (
    <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span>{t('loadingScene')} · {percent}%</span>
      <span className="loading-bar__track"><span style={{ width: `${percent}%` }} /></span>
    </div>
  );
}
