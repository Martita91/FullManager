/**
 * Service worker for the player app.
 *
 * Deliberately conservative. This is a server-rendered app whose pages show
 * live scores, so caching HTML would mean showing yesterday's result with no
 * indication it is stale. Navigations always go to the network; only the built
 * static assets — which are content-hashed and therefore safe forever — are
 * served from cache.
 *
 * Its other job is to exist: an installable app needs a service worker with a
 * fetch handler before the browser will offer to add it to a home screen.
 */

const CACHE = "full-manager-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Hashed build output only. Anything else may change under the same URL. */
function isImmutableAsset(url) {
  return url.origin === self.location.origin && /\/_build\/|\/assets\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Everything else — including every page and every API call — goes to the
  // network. Offline means offline, which is honest.
});
