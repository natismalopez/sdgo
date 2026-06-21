// SDGo! Service Worker — v26
// Estrategia: network-first para el HTML (para que las versiones nuevas lleguen
// solas al recargar, sin que el alumno limpie caché) y la API siempre por red.
const CACHE = 'sdgo-v48';
const ASSETS = ['./index.html','./manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Nunca interferir con la API (Apps Script): siempre red, sin caché.
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleusercontent.com') !== -1) {
    return;
  }

  // HTML / navegación: network-first (trae la versión nueva; si no hay red, caché).
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(c => c || caches.match(req)))
    );
    return;
  }

  // Resto de recursos: caché primero, con respaldo a red.
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
