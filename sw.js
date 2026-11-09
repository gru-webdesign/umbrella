// Offline cache: the whole game is a few hundred KB, so cache it all on install.
const CACHE = "uff-v1";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "src/game.js",
  "src/music.js",
  "fonts/pixelify-sans-700.woff2",
  "assets/balloon_0.png",
  "assets/balloon_1.png",
  "assets/bg_day.png",
  "assets/bg_dusk.png",
  "assets/bg_menu.png",
  "assets/bird_0.png",
  "assets/bird_1.png",
  "assets/cloud_0.png",
  "assets/cloud_1.png",
  "assets/cloud_2.png",
  "assets/cloud_3.png",
  "assets/dish_0.png",
  "assets/facade_left.png",
  "assets/facade_right.png",
  "assets/hero_death_0.png",
  "assets/hero_death_1.png",
  "assets/hero_death_2.png",
  "assets/hero_dive_0.png",
  "assets/hero_dive_1.png",
  "assets/hero_drift_0.png",
  "assets/hero_drift_1.png",
  "assets/hero_wave_0.png",
  "assets/hero_wave_1.png",
  "assets/pigeon_0.png",
  "assets/pigeon_1.png",
  "assets/plane_0.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// network first (so updates arrive), cache as fallback when offline
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
