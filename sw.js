/**
 * Service Worker - F&Z Store
 * Caché inteligente y estrategia de network-first
 */

const CACHE_NAME = 'fyz-store-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/auth.css',
  '/css/carrito.css',
  '/css/checkout-modern.css',
  '/css/admin.css',
  '/js/helpers.js',
  '/js/firebase-config.js',
  '/js/auth.js',
  '/js/carrito.js',
  '/js/productos.js',
  '/js/app.js'
];

// Instalar y cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Algunos assets no pudieron cachearse:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia Network-First con caché de fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // APIs externas: network-first
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Archivos estáticos locales: cache-first
  if (request.method === 'GET' && 
      (request.url.includes('.css') || request.url.includes('.js') || 
       request.url.includes('.png') || request.url.includes('.jpg') || 
       request.url.includes('.gif'))) {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request)
          .then((fetchResponse) => {
            if (!fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(request, fetchResponse.clone()));
            return fetchResponse;
          })
          .catch(() => {
            if (request.url.includes('.png') || request.url.includes('.jpg')) {
              return new Response('<svg></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
            }
            return new Response('Network error', { status: 503 });
          });
      })
    );
    return;
  }

  // Otros: network-first
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});
