// Service worker: keeps the app working offline.
// Online: always loads the latest version (and saves a copy).
// Offline: falls back to the saved copy.
// Bump VERSION whenever the file list changes.
const VERSION = 'cozy-v10';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/state.js',
  './js/ui.js',
  './js/audio.js',
  './js/haptics.js',
  './js/pixel.js',
  './js/sprites.js',
  './js/games/merge/merge.js',
  './js/games/merge/data.js',
  './js/games/aquarium/aquarium.js',
  './js/games/aquarium/data.js',
  './js/games/cafe/cafe.js',
  './js/games/cafe/data.js',
  './js/games/rhythm/rhythm.js',
  './js/games/rhythm/music.js',
  './js/games/town/town.js',
  './js/games/town/data.js',
  './js/games/town/avatar.js',
  './assets/fonts/Jersey10.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // 'no-cache' makes the browser re-check with the server every time (cheap when nothing
    // changed), so a new version shows up on the next launch instead of up to 10 min later.
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
