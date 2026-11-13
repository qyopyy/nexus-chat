/* Acetate installable shell. Network-first so library data stays fresh. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/acetate/offline/") || url.pathname.startsWith("/acetate-offline/")) {
    event.respondWith(caches.match(event.request).then((hit) => hit || new Response("", { status: 404 })));
    return;
  }
  if (!url.pathname.startsWith("/acetate")) return;
  event.respondWith(fetch(event.request));
});
