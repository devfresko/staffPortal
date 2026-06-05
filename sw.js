// Fresko Staff Portal — Service Worker v3.0
// Cache static assets for offline-capable PWA

const CACHE = 'fresko-v3';
const PRECACHE = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE.filter(function(url) {
        return !url.startsWith('https://fonts.googleapis');
      }));
    }).catch(function(err) { console.warn('[SW] precache partial fail:', err); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; })
        .map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Never cache GAS API calls
  if (url.includes('script.google.com') || url.includes('macros/s/')) return;
  // Network-first for HTML (always fresh app)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }
  // Cache-first for static assets (fonts, icons, Chart.js)
  if (url.includes('cdnjs') || url.includes('jsdelivr') || url.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }
  // Default: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(function() { return caches.match(e.request); })
  );
});
