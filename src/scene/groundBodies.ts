/**
 * Where the Sun and Earth are relative to the view while standing on the surface. The 3D scene writes
 * this every frame and the arrows read it, so following them never re-renders React.
 */
export interface BodyOnScreen {
  /** Screen position, -1..1 on each axis when in the frame; up is positive. */
  x: number;
  y: number;
  isInFrame: boolean;
  /** Below the flat horizon: not visible whichever way you turn. */
  isBelowHorizon: boolean;
}

export const groundBodies: Record<'sun' | 'earth', BodyOnScreen> = {
  sun: { x: 0, y: 0, isInFrame: false, isBelowHorizon: false },
  earth: { x: 0, y: 0, isInFrame: false, isBelowHorizon: false },
};

/** Margin inside the frame's edge that counts as "you can see it". */
const FRAME_LIMIT = 0.95;

/** `ndcX`, `ndcY` are the projected position; `isBehind` says the camera faces away from it. */
export function toScreen(ndcX: number, ndcY: number, isBehind: boolean, isBelowHorizon: boolean): BodyOnScreen {
  // Behind the camera the projection mirrors, so the way to turn is the opposite side.
  const x = isBehind ? -ndcX : ndcX;
  const y = isBehind ? -ndcY : ndcY;
  return { x, y, isInFrame: !isBehind && Math.abs(x) <= FRAME_LIMIT && Math.abs(y) <= FRAME_LIMIT, isBelowHorizon };
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a ray from the box's centre toward a direction leaves the box: the spot for an edge arrow. */
export function edgePoint(box: Box, dirX: number, dirY: number): { x: number; y: number; angle: number } {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const halfW = (box.right - box.left) / 2;
  const halfH = (box.bottom - box.top) / 2;
  const length = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / length;
  const dy = dirY / length;
  const reach = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: cx + dx * reach, y: cy + dy * reach, angle: Math.atan2(dy, dx) };
}

/** Air kept between her words and a panel beside them, pixels. */
export const BUBBLE_GAP = 12;

/**
 * How far right her words must move to clear a panel on the left, such as the tour's. `panelRight` is
 * null with no panel showing; a panel past the middle of the screen fills the width or sits on the
 * other side, and pushing against it would only send her words off screen.
 */
export function bubbleShift(bubbleLeft: number, panelRight: number | null, viewWidth: number): number {
  if (panelRight === null || panelRight > viewWidth / 2) return 0;
  return Math.max(0, panelRight + BUBBLE_GAP - bubbleLeft);
}
