// Keeps the heavy NASA data (textures, tiles, elevation grids) in the browser after the first
// visit, so returning visitors open the Moon without downloading it again, even on a slow link.
// Data files are cache-first: each is downloaded once. Bump DATA_VERSION whenever a file under
// textures/, tiles/ or data/ changes, and the old cache is dropped on the next visit.
// Pages and code are not touched, so a new deploy shows up immediately.
const DATA_VERSION = 2;
const CACHE = `lunar-data-v${DATA_VERSION}`;
const DATA = /\/(textures|tiles|data)\//;
// NASA Moon Trek map tiles never change for a given address, so they are kept the same way.
const TREK = 'https://trek.nasa.gov/tiles/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('lunar-data-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Tells the page a file came from this cache, so it is not mistaken for a very fast network.
const CACHE_HEADER = 'x-lunar-cache';
function markCached(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHE_HEADER, '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isOurs = url.origin === self.location.origin && DATA.test(url.pathname);
  if (request.method !== 'GET' || !(isOurs || request.url.startsWith(TREK))) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return markCached(cached);
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    }),
  );
});
