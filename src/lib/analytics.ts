import { useNavigator } from '../state/store';

/**
 * Anonymous usage events for Umami (loaded from index.html, counted only on the published site):
 * which parts of the app visitors actually try. No personal data; if the script is blocked or not
 * loaded, every call is a no-op.
 */
export type UsageEvent = 'tour-start' | 'orbit-photo' | 'accuracy-check' | 'stand-at-site' | 'mission-start' | 'site-pick' | 'still-here';

interface Umami {
  track: (event: string, data?: Record<string, string | number>) => void;
}

export function track(event: UsageEvent, data?: Record<string, string | number>): void {
  try {
    (window as Window & { umami?: Umami }).umami?.track(event, data);
  } catch (err: unknown) {
    console.warn('Usage event not sent', err);
  }
}

/**
 * Team members open the site once with `?team`, and that browser is never counted again (Umami
 * skips every browser that has `umami.disabled` in localStorage), so their own visits do not hide
 * the judges' ones.
 */
export function excludeTeamBrowser(search: string): boolean {
  if (!new URLSearchParams(search).has('team')) return false;
  try {
    window.localStorage.setItem('umami.disabled', '1');
    return true;
  } catch (err: unknown) {
    console.warn('Could not exclude this browser from statistics', err);
    return false;
  }
}

/** Counts the moments worth knowing about straight from the app state, so no component needs to. */
export function watchUsage(): () => void {
  return useNavigator.subscribe((s, prev) => {
    if (s.openTool === 'orbit' && prev.openTool !== 'orbit') track('orbit-photo');
    if (s.isValidationOpen && !prev.isValidationOpen) track('accuracy-check');
    if (s.isGroundView && !prev.isGroundView && !s.isTouring) track('stand-at-site');
    if (s.isTouring && !prev.isTouring) track('tour-start');
    if (s.site !== prev.site && !s.isTouring) track('site-pick', { site: s.site.id ?? 'custom' });
  });
}

/** One "still here" a minute while the tab is in front, for an hour at most. */
export const HEARTBEAT_MS = 60_000;
export const MAX_HEARTBEATS = 60;

/**
 * Umami measures a visit from its first to its last event. This is a one-page app, so ten minutes
 * of turning the Moon without opening anything would read as zero. A beat a minute while the tab is
 * visible makes the visit length right to the minute; a tab left in the background adds nothing.
 */
export function startHeartbeat(isVisible: () => boolean = () => document.visibilityState === 'visible'): () => void {
  let beats = 0;
  const timer = window.setInterval(() => {
    if (!isVisible()) return;
    beats += 1;
    track('still-here', { minute: beats });
    if (beats >= MAX_HEARTBEATS) window.clearInterval(timer);
  }, HEARTBEAT_MS);
  return () => window.clearInterval(timer);
}
