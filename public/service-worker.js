const CACHE_NAME = 'clube-da-navalha-v3';
const APP_SHELL = [
  '/',
  '/admin',
  '/cliente',
  '/owner',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/app-180.png',
  '/icons/app-192.png',
  '/icons/app-512.png',
  '/css/style.css',
  '/css/admin-theme.css',
  '/css/owner-theme.css',
  '/js/common.js',
  '/js/admin.js',
  '/js/cliente.js',
  '/js/barbearia.js',
  '/js/pwa.js',
  '/js/owner.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('clube-da-navalha-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && ['/','/admin','/cliente','/owner'].includes(url.pathname)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(url.pathname))
          || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  if (/^\/(css|js|icons)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.svg') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      });
      if (cached) {
        event.waitUntil(update.catch(() => {}));
        return cached;
      }
      return update;
    })());
  }
});
