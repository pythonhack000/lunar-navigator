import { afterEach, describe, expect, test, vi } from 'vitest';
import { prefetchAll, remainingSeconds, type DownloadProgress } from '../prefetch';

afterEach(() => vi.unstubAllGlobals());

/** A response whose body arrives in the given chunks, with an honest Content-Length. */
function chunked(...parts: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  const length = parts.reduce((n, p) => n + encoder.encode(p).length, 0);
  return new Response(body, { headers: { 'content-length': String(length) } });
}

describe('prefetchAll', () => {
  test('downloads every file and ends on a full bar', async () => {
    const fetchMock = vi.fn(async () => chunked('xx'));
    vi.stubGlobal('fetch', fetchMock);
    const seen: DownloadProgress[] = [];

    await prefetchAll(['a.jpg', 'b.jpg', 'c.png', 'd.png'], (p) => seen.push(p));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(seen.at(-1)?.share).toBe(1);
    expect(seen.at(-1)?.bytes).toBe(8);
    expect(seen.at(-1)?.totalBytes).toBe(8);
  });

  test('reports bytes as they stream in, not only when a file completes, and never moves backwards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chunked('aaaa', 'bbbb', 'cccc')));
    const seen: DownloadProgress[] = [];

    await prefetchAll(['big.bin'], (p) => seen.push(p));

    const bytes = seen.map((p) => p.bytes);
    expect(bytes).toContain(4);
    expect(bytes).toContain(8);
    const shares = seen.map((p) => p.share);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });

  test('hands back the files it was asked to keep, so they are not downloaded twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => chunked(url === 'grid.bin' ? 'GRID' : 'img')));

    const result = await prefetchAll(['grid.bin', 'a.jpg'], () => {}, { keep: ['grid.bin'] });

    expect(new TextDecoder().decode(result.kept.get('grid.bin'))).toBe('GRID');
    expect(result.kept.has('a.jpg')).toBe(false);
  });

  test('knows the real total from the start when the sizes are given, before any header arrives', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('abcd')));
    const seen: DownloadProgress[] = [];

    await prefetchAll(['a.jpg', 'b.jpg'], (p) => seen.push(p), { sizeOf: () => 4 });

    expect(seen.every((p) => p.totalBytes === 8)).toBe(true);
  });

  test('still finishes when a file fails, so the Moon is never held back by a warm-up', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === 'bad.jpg' ? Promise.reject(new Error('offline')) : chunked('x'))));
    const seen: DownloadProgress[] = [];

    await expect(prefetchAll(['ok.jpg', 'bad.jpg'], (p) => seen.push(p))).resolves.toMatchObject({ bytes: 1 });

    expect(seen.at(-1)?.share).toBe(1);
  });

  test('reports how many bytes it fetched and how long that took, as a measure of the link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chunked('12345')));

    const result = await prefetchAll(['a.jpg', 'b.jpg'], () => {});

    expect(result.bytes).toBe(10);
    expect(result.seconds).toBeGreaterThanOrEqual(0);
  });

  test('leaves files served from the service worker cache out of the link measurement', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === 'cached.jpg' ? new Response('12345', { headers: { 'x-lunar-cache': '1' } }) : chunked('123'))));

    const result = await prefetchAll(['cached.jpg', 'fresh.jpg'], () => {});

    expect(result.bytes).toBe(3);
  });

  test('reports completion at once when there is nothing to fetch', async () => {
    const seen: DownloadProgress[] = [];
    await prefetchAll([], (p) => seen.push(p));
    expect(seen.map((p) => p.share)).toEqual([1]);
  });
});

describe('remainingSeconds', () => {
  const at = (bytes: number, totalBytes: number, seconds: number) => ({ share: 0, bytes, totalBytes, seconds });

  test('extrapolates the speed so far onto what is left', () => {
    expect(remainingSeconds(at(1_000_000, 4_000_000, 10))).toBeCloseTo(30);
  });

  test('says nothing until there is a speed to go on, or once done', () => {
    expect(remainingSeconds(at(0, 4_000_000, 5))).toBeNull();
    expect(remainingSeconds(at(100, 4_000_000, 0.2))).toBeNull();
    expect(remainingSeconds(at(4_000_000, 4_000_000, 10))).toBeNull();
  });
});
