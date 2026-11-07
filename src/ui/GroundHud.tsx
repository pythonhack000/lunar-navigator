import { useEffect } from 'react';
import { useT } from '../i18n';
import { useNavigator } from '../state/store';

/** Controls while standing at the site: look at the Sun or Earth, or go back up to orbit. */
export function GroundHud() {
  const t = useT();
  const isGroundView = useNavigator((s) => s.isGroundView);
  const lookFromGround = useNavigator((s) => s.lookFromGround);
  const exitGroundView = useNavigator((s) => s.exitGroundView);

  useEffect(() => {
    if (!isGroundView) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exitGroundView();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGroundView, exitGroundView]);

  if (!isGroundView) return null;

  // Turns you to her and opens what you can ask.
  const askLuna = () => {
    lookFromGround('luna');
    useNavigator.getState().setGroundMenuOpen(true);
  };

  return (
    <div className="ground-hud" role="toolbar" aria-label={t('ground.title')}>
      <div className="ground-hud__bar">
        <span className="ground-hud__title">{t('ground.title')}</span>
        <button type="button" className="ghost-button" data-tour="look-sun" onClick={() => lookFromGround('sun')}>☀ {t('sun')}</button>
        <button type="button" className="ghost-button" data-tour="look-earth" onClick={() => lookFromGround('earth')}>◐ {t('earth')}</button>
        <button type="button" className="ghost-button" data-tour="look-luna" onClick={askLuna}>LUNA</button>
        <button type="button" className="primary-button" onClick={exitGroundView}>{t('ground.exit')}</button>
      </div>
      <span className="muted ground-hud__hint">{t('ground.hint')}</span>
    </div>
  );
}
