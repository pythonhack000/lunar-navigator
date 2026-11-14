import { useState } from 'react';
import { DEMO_VIDEO_URL } from '../config';
import { useT } from '../i18n';
import { useNavigator } from '../state/store';

/**
 * Shown when this machine renders the Moon as a slide show (software rendering, no graphics card):
 * says so plainly, suggests turning on hardware acceleration, and offers the demo video when there is
 * one, or the flat map, where every calculation still works. The 3D view stays available, at half resolution.
 */
export function GpuNotice() {
  const t = useT();
  const fps = useNavigator((s) => s.gpuStruggling);
  const [dismissed, setDismissed] = useState(false);
  const setGraphicsTier = useNavigator((s) => s.setGraphicsTier);
  if (fps === null || dismissed) return null;
  const hasVideo = DEMO_VIDEO_URL !== '';
  return (
    <div className="gpu-notice" role="alertdialog" aria-labelledby="gpu-notice-title">
      <strong id="gpu-notice-title">{t('gpu.title')}</strong>
      <p>{t(hasVideo ? 'gpu.body' : 'gpu.bodyNoVideo', { fps: String(fps) })}</p>
      <div className="gpu-notice__actions">
        <button type="button" className="primary-button" onClick={() => setGraphicsTier('none')}>
          {t('gpu.flat')}
        </button>
        {hasVideo && (
          <a className="ghost-button" href={DEMO_VIDEO_URL} target="_blank" rel="noopener noreferrer">
            {t('gpu.video')}
          </a>
        )}
        <button type="button" className="ghost-button" onClick={() => setDismissed(true)}>
          {t('gpu.continue')}
        </button>
      </div>
    </div>
  );
}
