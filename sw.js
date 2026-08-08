// Fresko Staff Portal — Service Worker v4.0
// Smart caching: static assets cached, GAS API never cached

const CACHE = 'fresko-v4';
const STATIC = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Install: precache static assets
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC).catch(function(err) {
        console.warn('[SW] Precache partial fail:', err);
      });
    })
  );
});

// Activate: remove old caches instantly
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // NEVER cache GAS API calls
  if (url.includes('script.google.com') || url.includes('macros/s/')) return;

  // Navigation (HTML): network first, cache fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Static CDN assets: cache first, network fallback + update
  if (url.includes('cdnjs') || url.includes('jsdelivr') || url.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        var fetchPromise = fetch(e.request).then(function(res) {
          if (res && res.status === 200) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});
