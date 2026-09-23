/*
 * Push, inside the service worker. Imported by the generated worker
 * (vite.config.js, workbox.importScripts). A notification shows its title and
 * the plain sentence under it; tapping it opens the page it is about, in the
 * app window if one is open.
 */
self.addEventListener("push", (event) => {
  let m;
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { title: "Sentryfi", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || "Sentryfi", {
      body: m.body || "",
      tag: m.tag,
      renotify: Boolean(m.urgent),
      requireInteraction: Boolean(m.urgent),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { href: m.href || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w || open).navigate(href));
      return self.clients.openWindow(href);
    })
  );
});
