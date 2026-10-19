// Laria's service worker (big-12, docs/ux-effortless/speed.md). It has two jobs and no others:
// 1. Receive photos shared to the installed app from the phone's share sheet. The manifest's share target posts them
//    to /compartir/recibir; they are kept on the device in Cache Storage (laria-compartido-v1, read and deleted by
//    lib/share-target.ts) and /compartir opens the listing form with them.
// 2. Show push notifications the person turned on, and open the right page when one is tapped.
// It is registered with the scope /compartir/, so the rest of the site never goes through it, and it caches nothing
// else: pages, images and data always come from the network, as without it.
const SHARE_CACHE = "laria-compartido-v1";
const MAX_SHARED_PHOTOS = 10;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname === "/compartir/recibir") {
    event.respondWith(receiveSharedPhotos(event.request));
  }
});

async function receiveSharedPhotos(request) {
  try {
    const form = await request.formData();
    const photos = form.getAll("fotos").filter((value) => value instanceof File && value.size > 0 && value.type.startsWith("image/")).slice(0, MAX_SHARED_PHOTOS);
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    const sharedAt = String(Date.now());
    await Promise.all(photos.map((photo, index) => cache.put(`/compartir/foto/${index}`, new Response(photo, {
      headers: {
        "Content-Type": photo.type,
        "X-Laria-Name": encodeURIComponent(photo.name || `foto-${index + 1}.jpg`),
        "X-Laria-Order": String(index),
        "X-Laria-Shared-At": sharedAt,
      },
    }))));
    return Response.redirect(`/compartir?fotos=${photos.length}`, 303);
  } catch {
    return Response.redirect("/compartir?fotos=0", 303);
  }
}

self.addEventListener("push", (event) => {
  let message = null;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  const title = message && typeof message.title === "string" ? message.title : "Laria";
  const body = message && typeof message.body === "string" ? message.body : "Tienes un aviso nuevo.";
  const url = message && typeof message.url === "string" ? message.url : "/mi-cuenta/notificaciones";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    lang: "es-PE",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    // One Laria notice on the phone at a time: a newer one replaces it instead of piling up.
    tag: "laria-avisos",
    renotify: false,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/mi-cuenta/notificaciones", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(target.href));
});
