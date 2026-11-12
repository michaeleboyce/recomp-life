const CACHE_NAME = "recomp-life-v2";
const PRECACHE_URLS = ["/", "/workout/configure", "/history", "/program", "/tools"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// The page sends a list of URLs (3D model, exercise photos, exercise pages)
// to fetch ahead of time so they are available on the first offline visit.
// Already-cached URLs are skipped; failures are ignored and retried next time.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "WARM_CACHE" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of data.urls) {
        if (typeof url !== "string" || !url.startsWith("/")) continue;
        try {
          if (await cache.match(url)) continue;
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          // Offline or failed: leave it for the next warm-up.
        }
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first for API/data, cache-first for static assets
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;

  // Skip chrome-extension and non-http requests
  if (!url.protocol.startsWith("http")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for offline use
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, return the cached index page
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});
