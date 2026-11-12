// v5: earlier versions cached API responses; the new name drops those caches.
const CACHE_NAME = "recomp-life-v5";
const PRECACHE_URLS = ["/", "/workout/configure", "/log", "/progress", "/more"];

// API responses (sync data, session) are per-user and must always be live:
// never cached, never served from cache.
const isApiPath = (pathname) => pathname.startsWith("/api/");

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
      const cacheOne = async (url) => {
        const hit = await cache.match(url);
        if (hit) return hit;
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response.clone());
        return response;
      };

      // A page is useless offline without its scripts and styles, and those
      // have build-hashed names. Pages name some in their HTML; scripts name
      // the lazily loaded ones (the 3D viewers) inside their own source. So
      // follow both, breadth first, until nothing new turns up.
      const queue = data.urls.filter(
        (u) => typeof u === "string" && u.startsWith("/") && !isApiPath(u)
      );
      const seen = new Set(queue);
      const enqueue = (url) => {
        if (!seen.has(url) && seen.size < 600) {
          seen.add(url);
          queue.push(url);
        }
      };

      while (queue.length > 0) {
        const url = queue.shift();
        try {
          const response = await cacheOne(url);
          if (!response.ok) continue;
          const type = response.headers.get("content-type") || "";
          if (type.includes("text/html")) {
            const html = await response.clone().text();
            for (const asset of html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []) {
              enqueue(asset);
            }
          } else if (url.startsWith("/_next/static/") && type.includes("javascript")) {
            const source = await response.clone().text();
            for (const ref of source.match(/static\/(?:chunks|css|media)\/[\w.~-]+\.(?:js|css)/g) || []) {
              enqueue("/_next/" + ref);
            }
          }
        } catch {
          // Offline or failed: leave it for the next warm-up.
        }
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first, falling back to the cache when offline
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;

  // Leave API requests to the browser: straight to the network, no cache.
  if (isApiPath(url.pathname)) return;

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
