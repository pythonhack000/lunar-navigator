/**
 * Downloads files ahead of use so they sit in the browser (and service worker) cache, reporting the
 * share finished after each one. Used during the opening flight: the 3D scene then starts from
 * cache instead of competing with the flight for the network. A failed file still counts as done;
 * the scene loads it again itself and reports any real error there.
 */
export async function prefetchAll(urls: string[], onProgress: (share: number) => void): Promise<void> {
  if (urls.length === 0) {
    onProgress(1);
    return;
  }
  let done = 0;
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        // Reading the body is what completes the download into the cache.
        await res.arrayBuffer();
      } catch (e) {
        console.warn('Prefetch failed; the scene will retry', url, e);
      } finally {
        done += 1;
        onProgress(done / urls.length);
      }
    }),
  );
}
