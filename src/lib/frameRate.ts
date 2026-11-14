/** Below this the camera visibly jumps instead of moving: the 3D view is a slide show. */
export const STRUGGLE_FPS = 8;
/** Windows in a row that must fall below it, so one hiccup (a texture upload, a tab switch) does not count. */
const STRUGGLE_WINDOWS = 2;

/** True when the latest measured windows (frames per second, oldest first) all fall below STRUGGLE_FPS. */
export function isStruggling(windows: readonly number[]): boolean {
  if (windows.length < STRUGGLE_WINDOWS) return false;
  return windows.slice(-STRUGGLE_WINDOWS).every((fps) => fps < STRUGGLE_FPS);
}
