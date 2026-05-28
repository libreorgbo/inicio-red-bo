/**
 * sw.js — Service Worker PWA - inicio.red.bo
 * Cache First para assets, Network First para API
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/components.css',
  '/js/app.js',
  '/js/modules/search.js',
  '/js/modules/directory.js',
  '/js/modules/auth.js',
  '/manifest.json',
  '/icons/default-favicon.svg'
];

// Routes to NEVER cache
const NO_CACHE_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
  /^\/dashboard/,
  /^\/r\//
];

// ─────────────────────────────────────────────────────────────
// INSTALL
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] install cache error:', err))
  );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE — clean old caches
// ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Skip no-cache patterns (API, auth, dashboard)
  const shouldSkip = NO_CACHE_PATTERNS.some(p => p.test(url.pathname));
  if (shouldSkip) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache First for static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network First for HTML pages
  event.respondWith(networkFirst(request));
});

// ─────────────────────────────────────────────────────────────
// STRATEGIES
// ─────────────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback to cached index.html for SPA navigation
    const indexCache = await caches.match('/index.html');
    if (indexCache) return indexCache;
    return new Response('Offline — no cached version available', { status: 503 });
  }
}

function isStaticAsset(pathname) {
  return /\.(css|js|svg|png|jpg|webp|woff2?|ico)$/.test(pathname);
}
