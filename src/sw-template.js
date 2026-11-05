// Service worker template; vite.config.ts fills in the version and file list.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `bagerikoll-${VERSION}`;
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bagerikoll-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  // The page itself: from the server when online, so an update is seen at once.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('index.html', MATCH)));
    return;
  }
  event.respondWith(caches.match(request, MATCH).then((hit) => hit ?? fetch(request)));
});
