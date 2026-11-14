import type { DownloadSample } from './textureQuality';

export interface DownloadProgress {
  /** 0..1, never moving backwards. */
  share: number;
  /** Bytes received so far, across all files. */
  bytes: number;
  /** Best current estimate of the total: Content-Length where sent, else what has arrived. */
  totalBytes: number;
  /** Seconds since the downloads started. */
  seconds: number;
}

/** `bytes` counts only what came over the network, so the result times the link. */
export interface PrefetchResult extends DownloadSample {
  /** The bodies of the files listed in `keep`, so their users need not download them again. */
  kept: Map<string, ArrayBuffer>;
}

interface FileState {
  received: number;
  /** Served by the service worker's cache or the browser's HTTP cache: not a measure of the network. */
  fromCache: boolean;
  /** From Content-Length; 0 until the headers arrive or when the server sends none. */
  expected: number;
  headersIn: boolean;
  done: boolean;
}

/** Set by public/sw.js on files it serves from its cache. */
const CACHE_HEADER = 'x-lunar-cache';

/** The browser's HTTP cache: the file's timing entry shows a body but no bytes transferred. */
function httpCacheHit(url: string): boolean {
  if (typeof performance === 'undefined' || !performance.getEntriesByName || typeof location === 'undefined') return false;
  const entry = performance.getEntriesByName(new URL(url, location.href).href).at(-1) as PerformanceResourceTiming | undefined;
  return entry !== undefined && entry.transferSize === 0 && entry.decodedBodySize > 0;
}

function concat(chunks: Uint8Array[], length: number): ArrayBuffer {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

/**
 * Downloads files ahead of use so they sit in the browser (and service worker) cache, reporting
 * progress in bytes as they stream in (so even a link of a few kilobits a second visibly moves), and
 * resolving with the bytes and seconds it took (a measure of the link) plus the bodies of the files
 * in `options.keep`. Used during the opening flight: the 3D scene then starts from cache instead of competing
 * with the flight for the network. A failed file still counts as done; the scene loads it again
 * itself and reports any real error there.
 */
export interface PrefetchOptions {
  /** Files whose bodies the caller wants back. */
  keep?: readonly string[];
  /** Known byte sizes, so the total is right before the headers arrive. */
  sizeOf?: (url: string) => number | undefined;
}

export async function prefetchAll(
  urls: string[],
  onProgress: (progress: DownloadProgress) => void,
  { keep = [], sizeOf }: PrefetchOptions = {},
): Promise<PrefetchResult> {
  const kept = new Map<string, ArrayBuffer>();
  if (urls.length === 0) {
    onProgress({ share: 1, bytes: 0, totalBytes: 0, seconds: 0 });
    return { bytes: 0, seconds: 0, kept };
  }
  const started = performance.now();
  const files = urls.map((url): FileState => {
    const known = sizeOf?.(url) ?? 0;
    return { received: 0, fromCache: false, expected: known, headersIn: known > 0, done: false };
  });
  let lastShare = 0;

  const report = () => {
    const bytes = files.reduce((n, f) => n + f.received, 0);
    const totalBytes = files.reduce((n, f) => n + Math.max(f.expected, f.received), 0);
    const allSized = files.every((f) => f.done || (f.headersIn && f.expected > 0));
    // Until every size is known, files count equally; then the bar follows the bytes.
    const byFiles = files.filter((f) => f.done).length / files.length;
    const byBytes = totalBytes > 0 ? bytes / totalBytes : 0;
    lastShare = Math.max(lastShare, Math.min(1, allSized ? byBytes : byFiles));
    onProgress({ share: lastShare, bytes, totalBytes, seconds: (performance.now() - started) / 1000 });
  };

  await Promise.all(
    urls.map(async (url, index) => {
      const file = files[index];
      try {
        const res = await fetch(url);
        // A known size stays: Content-Length of a gzipped file counts compressed bytes, the stream does not.
        if (!file.headersIn) file.expected = Number(res.headers.get('content-length')) || 0;
        file.headersIn = true;
        const chunks: Uint8Array[] = [];
        const reader = res.body?.getReader();
        if (!reader) {
          const whole = new Uint8Array(await res.arrayBuffer());
          chunks.push(whole);
          file.received = whole.length;
        } else {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            file.received += value.length;
            report();
          }
        }
        file.fromCache = res.headers.get(CACHE_HEADER) === '1' || httpCacheHit(url);
        if (keep.includes(url)) kept.set(url, concat(chunks, file.received));
      } catch (e) {
        console.warn('Prefetch failed; the scene will retry', url, e);
      } finally {
        file.done = true;
        report();
      }
    }),
  );
  if (lastShare < 1) {
    lastShare = 1;
    report();
  }
  const networkBytes = files.reduce((n, f) => n + (f.fromCache ? 0 : f.received), 0);
  return { bytes: networkBytes, seconds: (performance.now() - started) / 1000, kept };
}

/** Below this the speed so far is mostly connection set-up, not bandwidth. */
const MIN_ESTIMATE_SECONDS = 1;

/** Seconds left at the speed so far, or null while there is nothing to go on (or nothing left). */
export function remainingSeconds({ bytes, totalBytes, seconds }: DownloadProgress): number | null {
  if (bytes <= 0 || seconds < MIN_ESTIMATE_SECONDS || totalBytes <= bytes) return null;
  return (totalBytes - bytes) / (bytes / seconds);
}
