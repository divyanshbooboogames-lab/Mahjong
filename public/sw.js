// Scorejong Service Worker - enables PWA install + offline caching
var CACHE = 'scorejong-v3';
var PRECACHE = ['/', '/mahjong-scorer-core.js', '/mahjong-scorer-ext.js'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(PRECACHE); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Skip API calls and POST requests - always go to network
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(function(r) {
      // Cache successful GET responses
      if (r.status === 200) {
        var clone = r.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
      }
      return r;
    }).catch(function() {
      // Offline fallback - serve from cache
      return caches.match(e.request);
    })
  );
});
