const CACHE_NAME = 'silver-manager-app-v15';
const APP_SHELL = [
  './',
  './index.html',
  './assets/index-stocktakedetailsfix-20260922-1.js',
  './assets/index-Glot_ggT.css',
  './manifest.webmanifest',
  './registerSW.js',
  './icon.svg',
  './silver-logo.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async()=>{
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        await cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith((async()=>{
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        await cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return caches.match(req);
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached;
    }
  })());
});
