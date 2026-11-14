/**
 * How much of the sharp texture set a machine gets after the previews:
 * - `full`: the 4K/6K south-pole set and the 8K globe (~110 MB, ~0.5 GB of video memory);
 * - `polar`: the south-pole set only, for GPUs that would choke on the 8K globe;
 * - `previews`: nothing more, so a slow link keeps its bandwidth for the detail tiles near the camera.
 */
export type TextureQuality = 'full' | 'polar' | 'previews';

/** Below this the ~110 MB sharp set would take minutes and starve the detail tiles: about 6 Mbit/s. */
const SLOW_LINK_BYTES_PER_S = 750_000;
/** Same threshold in Mbit/s, for the browser's own estimate. */
const SLOW_LINK_MBPS = (SLOW_LINK_BYTES_PER_S * 8) / 1e6;
/** A measurement from less data than this says more about latency than bandwidth. */
const MIN_SAMPLE_BYTES = 500_000;
/** The browser's connection classes that are always too slow for the sharp set. */
const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g']);
/** The globe's colour and normal maps are 8192 px wide. */
const FULL_TEXTURE_PX = 8192;
/** Software renderers and older integrated graphics, by the WebGL renderer string. */
const WEAK_RENDERER = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|intel\(r\) (uhd|hd) graphics|mali-[gt]?[1-7]\d|adreno \(tm\) [1-5]\d\d|powervr/i;

export interface DownloadSample {
  /** Bytes that came over the network; files served from a cache are left out. */
  bytes: number;
  seconds: number;
}

export function isWeakGpu(renderer: string, maxTextureSize: number): boolean {
  return maxTextureSize < FULL_TEXTURE_PX || WEAK_RENDERER.test(renderer);
}

export type LinkVerdict = 'slow' | 'fast';

export interface LinkSignals {
  /** The first textures' download, timed. */
  sample: DownloadSample;
  /** The browser's data-saver switch. */
  saveData?: boolean;
  /** NetworkInformation (Chromium only): 'slow-2g' | '2g' | '3g' | '4g'. */
  effectiveType?: string;
  /** NetworkInformation's bandwidth estimate, capped at 10 Mbit/s by Chromium. */
  downlinkMbps?: number;
  /** The verdict saved on the last visit. */
  previous?: LinkVerdict | null;
}

/**
 * Slow or fast, from the best evidence available: the data saver, then a real timed download, then
 * the browser's own estimate, then the last visit. Files served from a cache (a returning visitor)
 * are not in the sample at all, so they can never pass for a very fast link.
 */
export function judgeLink({ sample, saveData, effectiveType, downlinkMbps, previous }: LinkSignals): LinkVerdict {
  if (saveData) return 'slow';
  if (sample.bytes >= MIN_SAMPLE_BYTES && sample.seconds > 0) {
    return sample.bytes / sample.seconds < SLOW_LINK_BYTES_PER_S ? 'slow' : 'fast';
  }
  if (effectiveType && SLOW_CONNECTION_TYPES.has(effectiveType)) return 'slow';
  if (downlinkMbps !== undefined && downlinkMbps > 0) return downlinkMbps < SLOW_LINK_MBPS ? 'slow' : 'fast';
  return previous ?? 'fast';
}

export function textureQuality({ slowLink, weakGpu }: { slowLink: boolean; weakGpu: boolean }): TextureQuality {
  if (slowLink) return 'previews';
  return weakGpu ? 'polar' : 'full';
}
