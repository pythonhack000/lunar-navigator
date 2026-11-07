import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { edgePoint, groundBodies, type Box } from '../scene/groundBodies';
import { useNavigator } from '../state/store';

type Body = 'sun' | 'earth';

const BODIES: readonly Body[] = ['sun', 'earth'];
/** Space kept clear for the toolbar on top, the panel on the right and the timeline below. */
const INSET = { left: 90, top: 150, right: 470, bottom: 250 };
const NARROW_INSET_X = 56;
const NARROW_INSET_TOP = 70;
const NARROW_INSET_BOTTOM = 24;
const NARROW_WIDTH = 960;
const MIN_DIRECTION = 0.001;

function frameBox(): Box {
  if (window.innerWidth <= NARROW_WIDTH) {
    const stage = document.querySelector('.stage')?.getBoundingClientRect();
    if (stage) return { left: stage.left + NARROW_INSET_X, top: stage.top + NARROW_INSET_TOP, right: stage.right - NARROW_INSET_X, bottom: stage.bottom - NARROW_INSET_BOTTOM };
  }
  return { left: INSET.left, top: INSET.top, right: window.innerWidth - INSET.right, bottom: window.innerHeight - INSET.bottom };
}

/**
 * While standing on the surface: an arrow at the edge of the view for the Sun and for the Earth,
 * pointing the way to turn. It disappears once the body is in the frame, and a click turns you to it.
 */
export function GroundArrows() {
  const t = useT();
  const isGroundView = useNavigator((s) => s.isGroundView);
  const lookFromGround = useNavigator((s) => s.lookFromGround);
  const buttons = useRef<Partial<Record<Body, HTMLButtonElement | null>>>({});
  const labels = useRef<Partial<Record<Body, HTMLSpanElement | null>>>({});
  const icons = useRef<Partial<Record<Body, SVGSVGElement | null>>>({});

  useEffect(() => {
    if (!isGroundView) return;
    let frame = 0;
    const words: Record<Body, { name: string; below: string }> = {
      sun: { name: t('sun'), below: t('ground.belowHorizon') },
      earth: { name: t('earth'), below: t('ground.belowHorizon') },
    };
    const tick = () => {
      const box = frameBox();
      for (const body of BODIES) {
        const el = buttons.current[body];
        if (!el) continue;
        const state = groundBodies[body];
        el.style.display = state.isInFrame ? 'none' : 'inline-flex';
        const size = Math.hypot(state.x, state.y);
        const point = edgePoint(box, size < MIN_DIRECTION ? 0 : state.x, size < MIN_DIRECTION ? -1 : -state.y);
        el.style.transform = `translate(calc(${point.x}px - 50%), calc(${point.y}px - 50%))`;
        const icon = icons.current[body];
        if (icon) icon.style.transform = `rotate(${point.angle}rad)`;
        const label = labels.current[body];
        if (label) label.textContent = state.isBelowHorizon ? `${words[body].name} · ${words[body].below}` : words[body].name;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Labels follow the language through t, which is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroundView, useNavigator.getState().lang]);

  if (!isGroundView) return null;
  return (
    <div className="ground-arrows" data-tour="ground-arrows">
      {BODIES.map((body) => (
        <button
          key={body}
          type="button"
          ref={(el) => {
            buttons.current[body] = el;
          }}
          className={`ground-arrow ground-arrow--${body}`}
          aria-label={t(body)}
          onClick={() => lookFromGround(body)}
        >
          <svg
            ref={(el) => {
              icons.current[body] = el;
            }}
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M2 8h10M8 3.5 12.5 8 8 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span
            ref={(el) => {
              labels.current[body] = el;
            }}
          >
            {t(body)}
          </span>
        </button>
      ))}
    </div>
  );
}
