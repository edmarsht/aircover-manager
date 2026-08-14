const CACHE_NAME = 'aircover-manager-v7';
const APP_SHELL = [
  '/',
  '/nouveau/',
  '/detail.html',
  '/parametres/',
  '/offline.html',
  '/styles.css',
  '/app.js',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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

/* Réseau d'abord (pour toujours avoir des données Firestore/Storage à jour),
   avec repli sur le cache si hors-ligne — juste pour l'app shell statique. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached || (event.request.mode === 'navigate' ? caches.match('/offline.html') : undefined)
        )
      )
  );
});
