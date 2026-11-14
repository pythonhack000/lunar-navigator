import { useEffect, useRef } from 'react';

export type BotMood = 'idle' | 'talk' | 'think' | 'wave' | 'happy' | 'sad';

type Props = {
  mood?: BotMood;
  /** Where to look, in screen pixels; without it LUNA watches the pointer. */
  lookAt?: { x: number; y: number } | null;
};

/** How far the pupils may travel inside the eyes, in SVG units. */
const GAZE_REACH = 2.2;
/** Beyond this many pixels the gaze is already at full stretch. */
const GAZE_FULL_PX = 320;
/** Share of the way the pupils move each frame: small enough to read as a smooth glance. */
const GAZE_EASE = 0.09;

/**
 * LUNA: a small alien robot hovering on a saucer. Big almond eyes follow the pointer, or whatever she
 * is showing. Moods are CSS only, so a mood change costs nothing.
 */
export function LunaBot({ mood = 'idle', lookAt = null }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  const target = useRef(lookAt);
  useEffect(() => {
    target.current = lookAt;
  }, [lookAt]);

  // The pupils glide toward what she looks at, a little each frame, and keep aiming while she flies.
  useEffect(() => {
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    const gaze = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };
    const tick = () => {
      const el = ref.current;
      const aim = target.current ?? pointer;
      if (el) {
        let wantX = 0;
        let wantY = 0;
        if (aim) {
          const box = el.getBoundingClientRect();
          const dx = aim.x - (box.left + box.width / 2);
          const dy = aim.y - (box.top + box.height / 2);
          const distance = Math.max(Math.hypot(dx, dy), 1e-3);
          const reach = (Math.min(1, distance / GAZE_FULL_PX) * GAZE_REACH) / distance;
          wantX = dx * reach;
          wantY = dy * reach;
        }
        gaze.x += (wantX - gaze.x) * GAZE_EASE;
        gaze.y += (wantY - gaze.y) * GAZE_EASE;
        el.style.setProperty('--gx', `${gaze.x.toFixed(3)}px`);
        el.style.setProperty('--gy', `${gaze.y.toFixed(3)}px`);
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <svg ref={ref} viewBox="0 0 64 70" className={`luna-bot is-${mood}`} aria-hidden="true">
      <path className="bot-beam" d="M22 58 L12 70 H52 L42 58 Z" />
      <g className="bot-body">
        <path className="bot-antenna bot-antenna--left" d="M24 10 C22 6 18 5 15 3" />
        <path className="bot-antenna bot-antenna--right" d="M40 10 C42 6 46 5 49 3" />
        <circle className="bot-tip bot-antenna--left" cx="14" cy="3" r="2.4" />
        <circle className="bot-tip bot-antenna--right" cx="50" cy="3" r="2.4" />
        <rect className="bot-neck" x="28" y="46" width="8" height="6" rx="2" />
        <path className="bot-head" d="M32 7 C46 7 55 17 55 28 C55 40 42 49 32 49 C22 49 9 40 9 28 C9 17 18 7 32 7Z" />
        <path className="bot-seam" d="M16 15 C24 9 40 9 48 15" />
        <g className="bot-eye">
          <path className="bot-eye-shape" d="M14 26 C18 20 27 22 29 31 C24 35 16 33 14 26Z" />
          <circle className="bot-pupil" cx="22" cy="28" r="3.1" />
        </g>
        <g className="bot-eye">
          <path className="bot-eye-shape" d="M50 26 C46 20 37 22 35 31 C40 35 48 33 50 26Z" />
          <circle className="bot-pupil" cx="42" cy="28" r="3.1" />
        </g>
        <rect className="bot-mouth" x="28.5" y="39" width="7" height="1.8" rx="0.9" />
        <ellipse className="bot-saucer" cx="32" cy="55" rx="21" ry="5" />
        <ellipse className="bot-saucer-top" cx="32" cy="53.4" rx="12" ry="2.6" />
        <circle className="bot-light" cx="17" cy="56" r="1.3" />
        <circle className="bot-light" cx="32" cy="58.2" r="1.3" />
        <circle className="bot-light" cx="47" cy="56" r="1.3" />
      </g>
    </svg>
  );
}
