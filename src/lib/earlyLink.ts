import type { DownloadSample } from './textureQuality';

/** Under this (~2 Mbit/s) the opening's 2K Earth and Moon would keep the screen black for many seconds. */
const LIGHT_INTRO_BYTES_PER_S = 250_000;
/** A script smaller than this times the round trip, not the bandwidth. */
const MIN_TIMED_BYTES = 100_000;

/** The fields of a PerformanceResourceTiming entry that matter here. */
export interface ResourceEntry {
  name: string;
  initiatorType: string;
  transferSize: number;
  requestStart: number;
  responseEnd: number;
}

/**
 * The first measure of the link, before any texture: how fast the app's own script arrived. Null when
 * it came from cache (transferSize 0) or is too small to time.
 */
export function bundleSample(entries: readonly ResourceEntry[]): DownloadSample | null {
  const scripts = entries.filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js'));
  const biggest = scripts.reduce<ResourceEntry | null>((best, e) => (!best || e.transferSize > best.transferSize ? e : best), null);
  if (!biggest || biggest.transferSize < MIN_TIMED_BYTES) return null;
  const seconds = (biggest.responseEnd - biggest.requestStart) / 1000;
  return seconds > 0 ? { bytes: biggest.transferSize, seconds } : null;
}

export function wantsLightIntro(sample: DownloadSample | null): boolean {
  return sample !== null && sample.bytes / sample.seconds < LIGHT_INTRO_BYTES_PER_S;
}

/** Reads the browser's resource timings; false if the API is missing. */
export function lightIntroHere(): boolean {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return false;
  return wantsLightIntro(bundleSample(performance.getEntriesByType('resource') as unknown as ResourceEntry[]));
}
