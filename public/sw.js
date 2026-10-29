/* SCSCO service worker. Small on purpose:
 *  - never touches /api or /uploads (login, attendance, fees and photos are always live)
 *  - pages: network first, with a simple offline page if the network is down
 *  - /assets/* (hashed JS/CSS from the build): cached after first load, only if they are NOT html
 * Bump VERSION to force every phone to drop old caches. */
const VERSION = "scsco-v1";
const SHELL = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // photos on Cloudinary, fonts, etc.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return; // always live

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        const type = res.headers.get("content-type") || "";
        if (res.ok && !type.includes("text/html")) cache.put(req, res.clone()); // never cache an html fallback as JS/CSS
        return res;
      }),
    );
  }
});
