// News Globe service worker: repeat visits start from cache, and the last
// news shown stays readable offline. Registered in production only (main.tsx).
//
// - Pages: network first, the cached shell when offline.
// - /assets/*: cache first. Vite gives every file a content hash, so a cached
//   copy is never stale; old ones are trimmed.
// - /data/*: network first, the last copy when offline.
// Everything else (publishers' images, translation) goes straight to the network.

// shell-v2: v1 could hold a non-page response (see isPage) in place of the app.
const SHELL = 'shell-v2';
const ASSETS = 'assets-v1';
const DATA = 'data-v1';
const KEEP = [SHELL, ASSETS, DATA];
/** Hashed files kept: a few deploys' worth of the globe, region maps and app. */
const MAX_ASSETS = 60;
/** Data files kept: the index and derived files, plus the places and History days opened lately. */
const MAX_DATA = 80;

/**
 * Store a copy and drop the oldest entries beyond `max`. cache.put replaces an existing entry by
 * removing it and appending the new one, so keys() lists the least recently stored first. A failed
 * write (quota, a body that errors) keeps the old copy and never fails the request it came from.
 */
async function store(cache, key, response, max) {
  try {
    await cache.put(key, response);
    await trim(cache, max);
  } catch {
    // Offline copies are best effort.
  }
}

/** Drop the oldest entries (insertion order) beyond `max`. */
async function trim(cache, max) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add('/'))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Opening /data/index.json or an icon in a tab is a navigation too: only an
 * HTML page may become the offline shell.
 */
const isPage = (response) => (response.headers.get('Content-Type') ?? '').startsWith('text/html');

async function networkFirst(request, cacheName, fallbackUrl, accept = () => true, max = Infinity) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && accept(response)) await store(cache, fallbackUrl ?? request, response.clone(), max);
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await store(cache, request, response.clone(), MAX_ASSETS);
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, SHELL, '/', isPage));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request));
  else if (url.pathname.startsWith('/data/')) event.respondWith(networkFirst(request, DATA, undefined, undefined, MAX_DATA));
});
