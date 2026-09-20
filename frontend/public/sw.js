/**
 * NEXORA PWA Service Worker
 * ==========================
 * Caches application shell for offline use.
 * Uses network-first strategy for API calls.
 * Does NOT cache dynamic API responses indefinitely.
 * Supports Background Sync for offline queue.
 *
 * Cache Strategy:
 *   - App shell (HTML, JS, CSS, icons): Cache-first
 *   - API calls: Network-first with no caching
 *   - Static assets: Cache-first with network fallback
 *
 * NOTE: This is a manual service worker (no Vite plugin required).
 * Place in /public/sw.js and register from main.tsx.
 */

const CACHE_VERSION = 'nexora-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
];

const STATIC_ASSET_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.png$/,
  /\.svg$/,
  /\.ico$/,
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing NEXORA service worker...');
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Shell cache partial failure:', err);
      });
    }).then(() => {
      console.log('[SW] Shell cached successfully');
      return self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating NEXORA service worker...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('nexora-') && key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls: network-only (no caching for dynamic data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // API offline — return a minimal offline response
        return new Response(
          JSON.stringify({ error: 'OFFLINE', message: 'Backend unavailable. Operating in offline mode.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache-first with network fallback
  const isStaticAsset = STATIC_ASSET_PATTERNS.some((p) => p.test(url.pathname));
  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // HTML navigation: network-first, fallback to cached shell
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((cached) => cached || caches.match('/index.html'));
      })
  );
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'nexora-offline-sync') {
    console.log('[SW] Background Sync triggered: nexora-offline-sync');
    event.waitUntil(
      // Notify all clients to run sync
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGERED' });
        });
      })
    );
  }
});

// ── Push (future) ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'NEXORA Alert', {
        body: data.body || 'Route alert from NEXORA',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.tag || 'nexora-alert',
        data: data,
      })
    );
  } catch (e) {
    console.warn('[SW] Push notification parse error:', e);
  }
});
