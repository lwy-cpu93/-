const CACHE_NAME = "a-share-live-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/codes.json",
  "/data/first_review_20.json",
  "/data/new_buy_20.json",
  "/data/analysis_2026-03-04.md"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/live")) {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return resp;
      });
    })
  );
});
