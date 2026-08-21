const CACHE_NAME = 'curva-s-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './engine.js',
  './seed-data.js',
  './pets-links.js',
  './firebase-config.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intenta traer la version mas nueva del servidor.
// Solo usa la copia guardada si no hay conexion (para que la app siga
// funcionando en terreno con mala senal), y esa copia se refresca sola
// cada vez que SI hay conexion.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('googleapis.com')
      || url.includes('jsdelivr.net') || url.includes('gstatic.com')
      || url.includes('cdnjs.cloudflare.com')) {
    return; // no interceptar Firebase ni CDNs externos (jsDelivr ya maneja su propio cache)
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
