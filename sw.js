const CACHE_NAME = 'shirotabi-v1';
const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

const scopedUrl = (path) => {
  const relativePath = path === '/' ? './' : path.replace(/^\//, '');
  return new URL(relativePath, self.registration.scope).toString();
};

const CACHE_URLS = CACHE_FILES.map(scopedUrl);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        CACHE_URLS.map((url) => fetch(url)
          .then((response) => {
            if (!response.ok) throw new Error(`Cache failed: ${url}`);
            return cache.put(url, response);
          })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(scopedUrl('/index.html'));
          }
          return undefined;
        }))
  );
});
