const CACHE_NAME = "survey-reboot-v1";
const ASSETS = ["./", "./index.html", "./app.js", "./styles.css", "./manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map(k => k !== CACHE_NAME && caches.delete(k)))));
  return self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});