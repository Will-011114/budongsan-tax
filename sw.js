// 항상 최신 데이터를 먼저 받고, 인터넷이 안 되면 저장해둔 걸 보여줌
const CACHE = "sejeum-v1";
const CORE = ["./", "index.html", "app.js", "calc.js", "manifest.webmanifest", "icon.svg",
  "data/tax-rules.json", "data/guide.json", "data/updates.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
