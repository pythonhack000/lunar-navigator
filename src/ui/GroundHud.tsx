import { useEffect } from 'react';
import { landingFor } from '../data/landings';
import { useT } from '../i18n';
import { HOUR_MS } from '../lib/format';
import { useNavigator } from '../state/store';
import { GROUND_QUESTIONS, groundQuestionLabel } from './groundLines';

/** Controls while standing at the site: look at the Sun or Earth, or go back up to orbit. */
export function GroundHud() {
  const t = useT();
  const isGroundView = useNavigator((s) => s.isGroundView);
  const lookFromGround = useNavigator((s) => s.lookFromGround);
  const showFromGround = useNavigator((s) => s.showFromGround);
  const exitGroundView = useNavigator((s) => s.exitGroundView);
  const isMenuOpen = useNavigator((s) => s.isGroundMenuOpen);
  const isTouring = useNavigator((s) => s.isTouring);
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const time = useNavigator((s) => s.time);
  const landing = landingFor(site.id);

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

  const isOnLandingDay = landing !== undefined && Math.abs(time - Date.parse(landing.time)) < HOUR_MS;
  const isNow = Math.abs(time - Date.now()) < HOUR_MS;

  return (
    <div className="ground-hud" role="toolbar" aria-label={t('ground.title')}>
      <div className="ground-hud__bar">
        <span className="ground-hud__title">{t('ground.title')}</span>
        <button type="button" className="ghost-button" data-tour="look-sun" onClick={() => showFromGround('sun')}>☀ {t('sun')}</button>
        <button type="button" className="ghost-button" data-tour="look-earth" onClick={() => showFromGround('earth')}>◐ {t('earth')}</button>
        <button type="button" className="ghost-button" data-tour="look-luna" onClick={askLuna}>LUNA</button>
        <button type="button" className="primary-button" onClick={exitGroundView}>{t('ground.exit')}</button>
      </div>
      {landing && (
        <div className="segmented ground-hud__when" role="group" aria-label={t('time.field')}>
          <button type="button" className={isOnLandingDay ? 'is-active' : undefined} aria-pressed={isOnLandingDay} onClick={() => useNavigator.getState().visitLanding(landing.siteId)}>
            {t('panel.landingDay', { date: new Date(landing.time).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) })}
          </button>
          <button type="button" className={isNow ? 'is-active' : undefined} aria-pressed={isNow} onClick={() => useNavigator.getState().goToNow()}>{t('now')}</button>
        </div>
      )}
      <span className="muted ground-hud__hint">{t('ground.hint')}</span>
      {isMenuOpen && !isTouring && (
        <div className="ground-sheet-menu">
          {GROUND_QUESTIONS.map((key) => (
            <button key={key} type="button" onClick={() => useNavigator.getState().askOnGround(key)}>{groundQuestionLabel(key, lang)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
