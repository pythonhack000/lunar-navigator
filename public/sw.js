// Keeps the heavy NASA data (textures, tiles, elevation grids) in the browser after the first
// visit, so returning visitors open the Moon without downloading it again, even on a slow link.
// Data files are cache-first: each is downloaded once. Bump DATA_VERSION whenever a file under
// textures/, tiles/ or data/ changes, and the old cache is dropped on the next visit.
// Pages and code are not touched, so a new deploy shows up immediately.
const DATA_VERSION = 1;
const CACHE = `lunar-data-v${DATA_VERSION}`;
const DATA = /\/(textures|tiles|data)\//;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('lunar-data-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !DATA.test(new URL(request.url).pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    }),
  );
});
