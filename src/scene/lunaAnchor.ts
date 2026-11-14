import { Vector3 } from 'three';

/** The 3D model from the bottom of its disc to the tips of its antennae, in model units. */
export const MODEL_HEIGHT = 2.74;
/** The model's origin sits this share of its height below its middle. */
const ORIGIN_BELOW_MIDDLE = 0.11;
/** Whichever 2D LUNA is on screen: the launcher, the one flying the tour, or the one in her panel. */
const BOT_SELECTORS = ['.luna-launcher', '.tour-bot', '.luna-head-bot'] as const;
/** The flight's own time, 0..1, by which she has finished changing. */
const TRANSFORM_UNTIL = 0.3;
/** The progress at which the change ends: she leaves the 2D LUNA's place only then. */
export const TRANSFORM_PROGRESS = 4 * TRANSFORM_UNTIL ** 3;
const HALFWAY = 0.5;
const EDGE_ON_DEG = 90;
const FLAT_DEPTH = 0.03;
/** How far her volume overshoots as it fills out, so it reads as a pop rather than a slide. */
const POP = 1.7;
const BOT_VAR_FLASH = '--luna-flash';
const BOT_VAR_RING = '--luna-ring';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where 2D LUNA stands, for the 3D one to take over from: camera space, and her size for a given distance. */
export interface LunaAnchor {
  place: Vector3;
  sizeOverDistance: number;
  /** The 2D LUNA herself, who plays her half of the change. */
  element?: HTMLElement;
}

export interface TransformStage {
  /** The flat 2D LUNA's turn away from you, or null once the model has taken over. */
  botTurnDeg: number | null;
  isModelShown: boolean;
  /** The model's turn still left to face you, radians. */
  modelTurnRad: number;
  /** Her depth front to back: nearly flat as she comes out, full when done. */
  modelDepth: number;
  /** The burst of light at the moment of the change, 0..1. */
  flash: number;
}

/**
 * How far through the change she is, 0..1, from the descent's progress. The flight eases in and out as
 * a cubic, so this undoes that to run at an even pace: the same on the way down and on the way back.
 */
export function transformShare(progress: number): number {
  return Math.min(1, Math.cbrt(Math.max(0, progress) / 4) / TRANSFORM_UNTIL);
}

const easeOutBack = (t: number): number => 1 + (POP + 1) * (t - 1) ** 3 + POP * (t - 1) ** 2;

/** The flat bot turns edge-on, there is a burst of light, and the model comes round out of that edge, filling out. */
export function transformStage(share: number): TransformStage {
  const flash = Math.sin(Math.PI * share);
  if (share < HALFWAY) return { botTurnDeg: (share / HALFWAY) * EDGE_ON_DEG, isModelShown: false, modelTurnRad: Math.PI / 2, modelDepth: FLAT_DEPTH, flash };
  const rest = (share - HALFWAY) / HALFWAY;
  return {
    botTurnDeg: null,
    isModelShown: true,
    modelTurnRad: (Math.PI / 2) * (1 - rest) ** 2,
    modelDepth: FLAT_DEPTH + (1 - FLAT_DEPTH) * easeOutBack(rest),
    flash,
  };
}

/** Plays the 2D half of the change on the page. */
export function styleLunaBot(element: HTMLElement, stage: TransformStage, share: number): void {
  const art = element.querySelector<HTMLElement>('svg');
  element.style.visibility = 'visible';
  element.style.pointerEvents = 'none';
  element.style.opacity = '1';
  element.style.setProperty(BOT_VAR_FLASH, String(stage.flash));
  element.style.setProperty(BOT_VAR_RING, String(share));
  if (!art) return;
  art.style.visibility = stage.botTurnDeg === null ? 'hidden' : 'visible';
  art.style.transform = stage.botTurnDeg === null ? '' : `perspective(420px) rotateY(${stage.botTurnDeg}deg)`;
}

/** Hands the 2D LUNA back to the page's own styles. */
export function clearLunaBot(element: HTMLElement): void {
  const art = element.querySelector<HTMLElement>('svg');
  element.style.removeProperty('visibility');
  element.style.removeProperty('pointer-events');
  element.style.removeProperty('opacity');
  element.style.removeProperty(BOT_VAR_FLASH);
  element.style.removeProperty(BOT_VAR_RING);
  art?.style.removeProperty('visibility');
  art?.style.removeProperty('transform');
}

export function lunaAnchorFromRects(bot: ScreenRect, canvas: ScreenRect, fovDeg: number): LunaAnchor | null {
  if (bot.width <= 0 || bot.height <= 0 || canvas.height <= 0) return null;
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const aspect = canvas.width / canvas.height;
  const middleY = bot.top - canvas.top + bot.height * (0.5 + ORIGIN_BELOW_MIDDLE);
  const middleX = bot.left - canvas.left + bot.width / 2;
  const ndcX = (middleX / canvas.width) * 2 - 1;
  const ndcY = 1 - (middleY / canvas.height) * 2;
  return {
    place: new Vector3(ndcX * tanHalf * aspect, ndcY * tanHalf, -1).normalize(),
    sizeOverDistance: (bot.height * 2 * tanHalf) / (MODEL_HEIGHT * canvas.height),
  };
}

/** The tour's 2D LUNA can still be flying to her next spot, so the 3D one keeps following where she really is. */
export function refreshLunaAnchor(anchor: LunaAnchor, canvas: HTMLElement, fovDeg: number): LunaAnchor {
  if (!anchor.element) return anchor;
  // Skipping the tour removes that bot mid-flight: the launcher takes over.
  if (!anchor.element.isConnected) return readLunaAnchor(canvas, fovDeg) ?? anchor;
  const fresh = lunaAnchorFromRects(anchor.element.getBoundingClientRect(), canvas.getBoundingClientRect(), fovDeg);
  return fresh ? { ...fresh, element: anchor.element } : anchor;
}

/** Finds 2D LUNA on the page. She stays in the layout while hidden, so this works during the flight too. */
export function readLunaAnchor(canvas: HTMLElement, fovDeg: number): LunaAnchor | null {
  const canvasRect = canvas.getBoundingClientRect();
  for (const selector of BOT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    const anchor = el && lunaAnchorFromRects(el.getBoundingClientRect(), canvasRect, fovDeg);
    if (anchor) return { ...anchor, element: el };
  }
  return null;
}
