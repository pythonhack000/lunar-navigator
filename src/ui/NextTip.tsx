import { useEffect, useState, type CSSProperties } from 'react';
import { useT, type StringKey } from '../i18n';
import { nextTip, tipDelayMs, type TipId } from '../lib/tips';
import { useNavigator } from '../state/store';

/** On the flat map there is no surface to stand on. */
const FLAT_UNAVAILABLE: readonly TipId[] = ['stand'];
const ACTIVITY = ['pointerdown', 'wheel', 'keydown'] as const;

const TEXT: Record<TipId, StringKey> = {
  luna: 'tip.luna',
  pick: 'tip.pick',
  stand: 'tip.stand',
  time: 'tip.time',
  photo: 'tip.photo',
  mission: 'tip.mission',
};

/** Where LUNA's speech bubble goes: just left of her button, level with it. Null while she is hidden. */
function useLunaSpot(isWanted: boolean): CSSProperties | null {
  const [spot, setSpot] = useState<CSSProperties | null>(null);
  useEffect(() => {
    if (!isWanted) return undefined;
    const place = () => {
      const rect = document.querySelector('.luna-launcher')?.getBoundingClientRect();
      const isVisible = rect && rect.width > 0 && rect.right > 0;
      setSpot(isVisible ? { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + LUNA_GAP_PX } : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isWanted]);
  return spot;
}

const LUNA_GAP_PX = 12;

/**
 * The next thing worth trying, as one quiet line over the Moon: click anywhere, stand at the site,
 * run time, see the photo from orbit, play a mission. Each one is gone for good once done.
 */
export function NextTip() {
  const t = useT();
  const landed = useNavigator((s) => s.landed);
  const isLunaBusy = useNavigator((s) => s.isLunaBusy);
  const isTouring = useNavigator((s) => s.isTouring);
  const openTool = useNavigator((s) => s.openTool);
  const isValidationOpen = useNavigator((s) => s.isValidationOpen);
  const isGroundView = useNavigator((s) => s.isGroundView);
  const playing = useNavigator((s) => s.playing);
  const doneTips = useNavigator((s) => s.doneTips);
  const markTip = useNavigator((s) => s.markTip);
  const [shownTip, setShownTip] = useState<TipId | null>(null);

  // Doing the thing anywhere, the tour included, counts.
  useEffect(() => {
    if (isGroundView) markTip('stand');
  }, [isGroundView, markTip]);
  useEffect(() => {
    if (playing) markTip('time');
  }, [playing, markTip]);
  useEffect(() => {
    if (openTool === 'orbit') markTip('photo');
  }, [openTool, markTip]);

  const isFlat = useNavigator((s) => s.graphicsTier === 'none');
  const tip = nextTip(doneTips, isGroundView, isFlat ? FLAT_UNAVAILABLE : []);
  const isQuiet = landed && !isLunaBusy && !isTouring && openTool === null && !isValidationOpen;

  // The idle clock restarts on every touch until the tip has appeared; then it stays put to be read.
  useEffect(() => {
    if (!tip || !isQuiet || shownTip === tip) return undefined;
    const wait = tipDelayMs(tip);
    let timer = window.setTimeout(() => setShownTip(tip), wait);
    const wake = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShownTip(tip), wait);
    };
    ACTIVITY.forEach((type) => window.addEventListener(type, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY.forEach((type) => window.removeEventListener(type, wake));
    };
  }, [tip, isQuiet, shownTip]);

  const lunaSpot = useLunaSpot(tip === 'luna' && shownTip === tip && isQuiet);
  if (!tip || !isQuiet || shownTip !== tip) return null;
  if (tip === 'luna' && !lunaSpot) return null;
  return (
    <div className={`next-tip next-tip--${tip}`} role="status" style={tip === 'luna' ? lunaSpot ?? undefined : undefined}>
      <span className="next-tip__pulse" aria-hidden="true" />
      <p>{t(TEXT[tip], { stand: t('ground.enter'), photo: t('trek.photo') })}</p>
      <button type="button" className="next-tip__close" aria-label={t('tip.close')} onClick={() => markTip(tip)}>×</button>
    </div>
  );
}
