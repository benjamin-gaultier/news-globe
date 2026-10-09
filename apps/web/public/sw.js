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

async function networkFirst(request, cacheName, fallbackUrl, accept = () => true) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && accept(response)) await cache.put(fallbackUrl ?? request, response.clone());
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
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    // Oldest first (insertion order): drop what is beyond the limit.
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, SHELL, '/', isPage));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request));
  else if (url.pathname.startsWith('/data/')) event.respondWith(networkFirst(request, DATA));
});
