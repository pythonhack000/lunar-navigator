import { useEffect, useState, type ReactNode } from 'react';
import { useT, type StringKey } from '../i18n';
import { useNavigator } from '../state/store';

const STORAGE_KEY = 'lsn.controlsHintSeen';
/** Long enough to watch each gesture loop twice, short enough not to sit over the Moon. */
const VISIBLE_MS = 16000;

type Gesture = { icon: ReactNode; label: StringKey };

/** Mouse arrow sliding sideways: hold and drag. */
const DragIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path className="gesture-track" d="M8 38h32" />
    <g className="gesture-slide">
      <path className="gesture-fill" d="M20 10l12 12-6 1 4 8-3 1.5-4-8-5 4z" />
    </g>
  </svg>
);

/** Two fingers on a touchpad moving up and down: zoom. */
const ZoomIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect className="gesture-track" x="4" y="8" width="28" height="32" rx="5" />
    <g className="gesture-bob">
      <circle className="gesture-fill" cx="14" cy="24" r="3.5" />
      <circle className="gesture-fill" cx="22" cy="24" r="3.5" />
    </g>
    <path className="gesture-line" d="M41 12v24M38 15l3-3 3 3M38 33l3 3 3-3" />
  </svg>
);

/** A turning arrow: right-drag or Shift-drag rotates and tilts. */
const RotateIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <g className="gesture-spin">
      <path className="gesture-line" d="M36 24a12 12 0 1 1-4-9" />
      <path className="gesture-fill" d="M34 9l1 9-9-1z" />
    </g>
  </svg>
);

/** A click with a ripple: pick any spot. */
const ClickIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle className="gesture-ripple" cx="20" cy="18" r="6" />
    <path className="gesture-fill" d="M20 18l12 12-6 1 4 8-3 1.5-4-8-5 4z" />
  </svg>
);

/** One finger dot sliding sideways: move on a touch screen. */
const FingerDragIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path className="gesture-track" d="M8 36h32" />
    <g className="gesture-slide">
      <circle className="gesture-fill" cx="18" cy="24" r="5" />
    </g>
  </svg>
);

/** Two finger dots spreading apart: pinch to zoom. */
const PinchIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <g className="gesture-pinch-a">
      <circle className="gesture-fill" cx="19" cy="29" r="4.5" />
    </g>
    <g className="gesture-pinch-b">
      <circle className="gesture-fill" cx="29" cy="19" r="4.5" />
    </g>
    <path className="gesture-line" d="M12 36l-3 3M36 12l3-3" />
  </svg>
);

/** Two finger dots moving up and down together: tilt. */
const TiltIcon = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <g className="gesture-bob">
      <circle className="gesture-fill" cx="19" cy="24" r="4.5" />
      <circle className="gesture-fill" cx="29" cy="24" r="4.5" />
    </g>
    <path className="gesture-line" d="M24 8v5M22 10l2-2 2 2M24 40v-5M22 38l2 2 2-2" />
  </svg>
);

const MOUSE: Gesture[] = [
  { icon: DragIcon, label: 'nav.drag' },
  { icon: ZoomIcon, label: 'nav.zoom' },
  { icon: RotateIcon, label: 'nav.rotate' },
  { icon: ClickIcon, label: 'nav.pick' },
];

const TOUCH: Gesture[] = [
  { icon: FingerDragIcon, label: 'nav.dragTouch' },
  { icon: PinchIcon, label: 'nav.zoomTouch' },
  { icon: TiltIcon, label: 'nav.rotateTouch' },
  { icon: ClickIcon, label: 'nav.pickTouch' },
];

const readSeen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode: the card simply shows again on the next visit.
  }
};

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
/** The phone layout (index.css, mobile tabs): here the card and LUNA's greeting would share the screen. */
const isPhoneLayout = () => window.matchMedia?.('(max-width: 960px)').matches ?? false;

/**
 * Shows, with small looping pictures, how to move around the Moon: once after landing, then on
 * demand from a "?" button, because not every visitor has used a 3D globe before.
 */
export function ControlsHint() {
  const t = useT();
  const landed = useNavigator((s) => s.landed);
  const isGroundView = useNavigator((s) => s.isGroundView);
  const isLunaBusy = useNavigator((s) => s.isLunaBusy);
  const waitsForLuna = isLunaBusy && isPhoneLayout();
  const [isOpen, setOpen] = useState(() => !readSeen());

  useEffect(() => {
    if (!isOpen || !landed || isGroundView || waitsForLuna) return;
    const timer = window.setTimeout(() => {
      markSeen();
      setOpen(false);
    }, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, landed, isGroundView, waitsForLuna]);

  // On phones it waits for LUNA's greeting or tour, so the two never talk at once on a first visit.
  if (!landed || isGroundView || waitsForLuna) return null;

  if (!isOpen) {
    return (
      <button type="button" className="controls-hint-toggle" aria-label={t('nav.show')} title={t('nav.show')} onClick={() => setOpen(true)}>
        ?
      </button>
    );
  }

  const close = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <div className="controls-hint" role="note" aria-label={t('nav.title')}>
      <ul>
        {(isTouch() ? TOUCH : MOUSE).map(({ icon, label }) => (
          <li key={label}>
            {icon}
            <span>{t(label)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="controls-hint__close" aria-label={t('nav.close')} onClick={close}>
        ×
      </button>
    </div>
  );
}
