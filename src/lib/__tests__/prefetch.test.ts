import { afterEach, describe, expect, test, vi } from 'vitest';
import { prefetchAll } from '../prefetch';

afterEach(() => vi.unstubAllGlobals());

describe('prefetchAll', () => {
  test('downloads every file and reports the share done after each one', async () => {
    const fetchMock = vi.fn(async () => new Response('x'));
    vi.stubGlobal('fetch', fetchMock);
    const shares: number[] = [];

    await prefetchAll(['a.jpg', 'b.jpg', 'c.png', 'd.png'], (share) => shares.push(share));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(shares).toEqual([0.25, 0.5, 0.75, 1]);
  });

  test('still finishes when a file fails, so the Moon is never held back by a warm-up', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === 'bad.jpg' ? Promise.reject(new Error('offline')) : new Response('x'))));
    const shares: number[] = [];

    await expect(prefetchAll(['ok.jpg', 'bad.jpg'], (share) => shares.push(share))).resolves.toBeUndefined();

    expect(shares.at(-1)).toBe(1);
  });

  test('reports completion at once when there is nothing to fetch', async () => {
    const shares: number[] = [];
    await prefetchAll([], (share) => shares.push(share));
    expect(shares).toEqual([1]);
  });
});
