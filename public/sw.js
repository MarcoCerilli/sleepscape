const CACHE = "sleepscape-v3";
const PRECACHE_ASSETS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          const response = await fetch(asset, { cache: "no-cache" });
          if (response && response.ok) {
            await cache.put(asset, response);
          }
        } catch {
          // Ignora errori di rete sul singolo asset per evitare crash dell'installazione
        }
      }
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("sleepscape-") && key !== CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match("/");
        return cached || Response.error();
      })
    );
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname)
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            await cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })
    );
  }
});
