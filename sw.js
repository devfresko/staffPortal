// ════════════════════════════════════════════════════════════════════════════
// Fresko Staff Portal — Service Worker (sw.js)
// Caches app shell for offline load. GAS/Google API calls are always live.
// Bump CACHE version string whenever index.html or app.js changes.
// ════════════════════════════════════════════════════════════════════════════

var CACHE   = 'fresko-v1';
var SHELL   = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // CDN assets — cached on first visit
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ── Install: pre-cache shell ─────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      // addAll fails if any resource 404s; use individual puts for CDN safety
      return c.add('./index.html').then(function() {
        return c.add('./manifest.json');
      }).then(function() {
        return Promise.all([
          c.add('./icon-192.png').catch(function(){}),
          c.add('./icon-512.png').catch(function(){})
        ]);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k)   { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: serve shell from cache, let API calls pass through ────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Always pass GAS / Google API calls to network (never cache these)
  if (url.indexOf('script.google.com') >= 0 ||
      url.indexOf('googleapis.com')    >= 0 ||
      url.indexOf('google.com/macros') >= 0) {
    return; // let browser handle normally
  }

  // Script tag JSONP calls (same origin or CDN) — network first, cache fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request)
        .then(function(resp) {
          // Cache successful same-origin responses
          if (resp && resp.status === 200 && e.request.method === 'GET') {
            var clone = resp.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return resp;
        })
        .catch(function() {
          // Offline: return cached index.html for navigation requests
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
