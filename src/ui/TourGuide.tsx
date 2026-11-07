import { useEffect, useState } from 'react';
import { useNavigator } from '../state/store';
import { LunaBot, type BotMood } from './LunaBot';

type Props = {
  /** What to show; null lets LUNA hover beside her panel. */
  selector: string | null;
  /** A soft ring for the game, where the rest of the screen must stay readable. */
  isSoft?: boolean;
  mood: BotMood;
  /** LUNA is about to click what she points at. */
  isPressing?: boolean;
  onBotClick?: () => void;
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const BOT_W = 76;
const BOT_H = 84;
const GAP = 14;
const EDGE = 8;
const RING_PAD = 6;

const isSameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.right - b.right) < 1 && Math.abs(a.bottom - b.bottom) < 1);

const rectOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
};

const boxOf = (selector: string | null): Box | null => rectOf(selector ? document.querySelector(selector) : null);

/** Panels LUNA should hover beside rather than on top of, since she would hide their numbers. */
const HOLDERS = '.site-panel, .tool-dialog, .calendar';
const holderOf = (selector: string | null): Box | null => {
  const el = selector ? document.querySelector(selector) : null;
  return rectOf(el ? el.closest(HOLDERS) : null);
};

/** Follows an element every frame: panels resize, dialogs open and the camera moves things around. */
function useBox(selector: string | null, read: (s: string | null) => Box | null = boxOf): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const next = read(selector);
      setBox((prev) => (isSameBox(prev, next) ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [selector, read]);
  return box;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const botBoxAt = (left: number, top: number): Box => ({ left, top, right: left + BOT_W, bottom: top + BOT_H });

function fitsScreen(b: Box): boolean {
  return b.left >= EDGE && b.top >= EDGE && b.right <= window.innerWidth - EDGE && b.bottom <= window.innerHeight - EDGE;
}

/** The first spot next to the target that is on screen and clear of LUNA's panel. */
function placeBot(target: Box | null, holder: Box | null, panel: Box | null): Box {
  const anchor = holder && target ? { left: holder.left, top: target.top, right: holder.right, bottom: target.bottom } : target ?? panel ?? { left: window.innerWidth - EDGE, top: EDGE, right: window.innerWidth - EDGE, bottom: EDGE + BOT_H };
  const midY = Math.max(EDGE, (anchor.top + anchor.bottom) / 2 - BOT_H / 2);
  const midX = (anchor.left + anchor.right) / 2 - BOT_W / 2;
  const options = [
    botBoxAt(anchor.left - BOT_W - GAP, midY),
    botBoxAt(anchor.right + GAP, midY),
    botBoxAt(midX, anchor.top - BOT_H - GAP),
    botBoxAt(midX, anchor.bottom + GAP),
    botBoxAt(anchor.left - BOT_W - GAP, anchor.top),
  ];
  const clear = options.find((o) => fitsScreen(o) && !(panel && overlaps(o, panel)));
  if (clear) return clear;
  const fallback = options[0];
  const left = Math.min(window.innerWidth - BOT_W - EDGE, Math.max(EDGE, fallback.left));
  const top = Math.min(window.innerHeight - BOT_H - EDGE, Math.max(EDGE, fallback.top));
  return botBoxAt(left, top);
}

/**
 * LUNA leaves her corner, flies up to whatever she is talking about and lights it with a tractor beam.
 * The ring is its own element above the page, so it shows on any button, inside any scrolling panel.
 */
export function TourGuide({ selector, isSoft = false, mood, isPressing = false, onBotClick }: Props) {
  const isOnSurface = useNavigator((s) => s.isCompanion3D || s.isGroundView);
  const target = useBox(selector);
  const holder = useBox(selector, holderOf);
  const panel = useBox('.luna-panel');
  const bot = placeBot(target, holder, panel);
  const botX = (bot.left + bot.right) / 2;
  const botY = (bot.top + bot.bottom) / 2;
  const aim = target ? { x: Math.max(target.left, Math.min(target.right, botX)), y: Math.max(target.top, Math.min(target.bottom, botY)) } : null;
  const beam = aim ? { length: Math.hypot(aim.x - botX, aim.y - botY), angle: Math.atan2(aim.y - botY, aim.x - botX) } : null;

  return (
    <div className="luna-guide">
      {target && (
        <div
          className={`tour-ring${isSoft ? ' is-soft' : ''}${isPressing ? ' is-pressing' : ''}`}
          style={{
            left: target.left - RING_PAD,
            top: target.top - RING_PAD,
            width: target.right - target.left + 2 * RING_PAD,
            height: target.bottom - target.top + 2 * RING_PAD,
          }}
        />
      )}
      {beam && !isOnSurface && <div key={selector} className="tour-beam" style={{ left: botX, top: botY, width: beam.length, transform: `rotate(${beam.angle}rad)` }} />}
      <button type="button" className={isOnSurface ? 'tour-bot is-gone' : 'tour-bot'} aria-label="LUNA" style={{ transform: `translate(${bot.left}px, ${bot.top}px)` }} onClick={onBotClick}>
        <LunaBot mood={mood} lookAt={aim} />
      </button>
    </div>
  );
}
