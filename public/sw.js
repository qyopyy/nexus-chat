/* Nexus service worker — push notifications for new messages */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nexus", body: event.data ? event.data.text() : "New message" };
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const looking = wins.some((c) => c.focused && c.visibilityState === "visible");
      const ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent);
      // already looking at Nexus → the app plays its own sound; iOS requires every push to show something
      if (looking && !ios) return;
      await self.registration.showNotification(data.title || "Nexus", {
        body: data.body || "New message",
        icon: data.icon || "/icon-512.png",
        badge: "/icon-512.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/", conversation_id: data.conversation_id || null },
        vibrate: [60, 40, 60],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (new URL(c.url).origin === self.location.origin) {
          c.postMessage({ type: "nexus:open", url, conversation_id: event.notification.data?.conversation_id });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
