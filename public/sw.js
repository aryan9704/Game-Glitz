// GameGlitz Service Worker
// Cache strategy: cache-first for static assets, network-first for HTML, stale-while-revalidate for images

const CACHE_VERSION = 'gameglitz-v11-audit';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const HTML_CACHE = `${CACHE_VERSION}-html`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const FETCH_TIMEOUT_MS = 5000;

const PRECACHE_STATIC = [
  'css/design-system.css',
  'css/animations.css',
  'css/nav.css',
  'css/home.css',
  'css/premium.css',
  'css/hero-v2.css',
  'css/motion.css',
  'css/immersive.css',
  'css/pages/404.css',
  'css/pages/about.css',
  'css/pages/account.css',
  'css/pages/categories.css',
  'css/pages/checkout-result.css',
  'css/pages/community.css',
  'css/pages/developers.css',
  'css/pages/esports.css',
  'css/pages/faq.css',
  'css/pages/game.css',
  'css/pages/index.css',
  'css/pages/legal.css',
  'css/pages/news.css',
  'css/pages/offline.css',
  'css/pages/pricing.css',
  'css/pages/profile.css',
  'css/pages/reset-password.css',
  'css/pages/sitemap.css',
  'css/pages/store.css',
  'css/pages/support.css',
  'js/nav.js',
  'js/engine.js',
  'js/premium.js',
  'js/hero-v2.js',
  'js/state.js',
  'js/api-client.js',
  'js/game-database.js',
  'js/csp-actions.js',
  'js/pages/404-inline-1.js',
  'js/pages/account-inline-1.js',
  'js/pages/account-inline-2.js',
  'js/pages/categories-inline-1.js',
  'js/pages/community-inline-1.js',
  'js/pages/community-inline-2.js',
  'js/pages/developers-inline-1.js',
  'js/pages/esports-inline-1.js',
  'js/pages/faq-inline-1.js',
  'js/pages/game-inline-1.js',
  'js/pages/index-inline-1.js',
  'js/pages/legal-inline-1.js',
  'js/pages/news-inline-1.js',
  'js/pages/offline-inline-1.js',
  'js/pages/pricing-inline-1.js',
  'js/pages/profile-inline-1.js',
  'js/pages/reset-password-inline-1.js',
  'js/pages/store-inline-1.js',
  'js/pages/store-inline-2.js',
  'js/pages/support-inline-1.js',
  'js/motion.js',
  'js/immersive.js',
  'js/dynamic-bg.js',
  'manifest.json',
  'icon-192.svg',
  'icon-512.svg',
];

const PRECACHE_HTML = [
  'index.html',
  'store.html',
  'community.html',
  'about.html',
  'faq.html',
  'support.html',
  'account.html',
  'legal.html',
  'news.html',
  'esports.html',
  'developers.html',
  'sitemap.html',
  '404.html',
  'offline.html',
  'pricing.html',
  'categories.html',
  'profile.html',
  'game.html',
  'reset-password.html',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_STATIC)),
      caches.open(HTML_CACHE).then((cache) =>
        cache.addAll(PRECACHE_HTML.map((url) => new Request(url, { cache: 'reload' })))
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const allowedCaches = new Set([STATIC_CACHE, HTML_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !allowedCaches.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  const dest = request.destination;

  // ── Images → stale-while-revalidate ──────────────────────────────────────
  if (dest === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // ── CSS / JS / manifest / icons → network-first (avoid stale auth scripts) ──
  if (
    dest === 'style' ||
    dest === 'script' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.svg') ||
    url.pathname === '/manifest.json' ||
    url.pathname.endsWith('manifest.json')
  ) {
    event.respondWith(networkFirstAsset(request, STATIC_CACHE));
    return;
  }

  // ── HTML → network-first with offline fallback ────────────────────────────
  if (
    dest === 'document' ||
    request.headers.get('Accept')?.includes('text/html')
  ) {
    event.respondWith(networkFirstHtml(request));
    return;
  }
});

// ── Strategy: Cache-First ─────────────────────────────────────────────────────
async function fetchWithTimeout(request, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline — resource unavailable', { status: 503 });
  }
}

// ── Strategy: Network-First (static assets) ──────────────────────────────────
async function networkFirstAsset(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Offline — resource unavailable', { status: 503 });
  }
}

// ── Strategy: Network-First (HTML) ────────────────────────────────────────────
async function networkFirstHtml(request) {
  const cache = await caches.open(HTML_CACHE);

  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Fall back to offline page
    const offline = await cache.match('offline.html');
    return (
      offline ||
      new Response(
        '<!DOCTYPE html><html><body><h1>You\'re offline</h1></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      )
    );
  }
}

// ── Strategy: Stale-While-Revalidate ──────────────────────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetchWithTimeout(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response('', { status: 503 });
}
