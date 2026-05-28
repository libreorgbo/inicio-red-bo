/* sw.js - Service Worker PWA - inicio.red.bo */
'use strict';

const CACHE_NAME = 'inicio-red-bo-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/app.js',
  '/js/render.js',
  '/js/sidebar.js',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First for static, Network-First for API
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: Network-First with fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: Cache-First
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// Background sync for offline link clicks
self.addEventListener('sync', event => {
  if (event.tag === 'click-sync') {
    event.waitUntil(syncClicks());
  }
});

async function syncClicks() {
  // Will sync queued link clicks when back online
  console.log('[SW] Syncing pending clicks');
}
