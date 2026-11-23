// Service worker: aplikacija deluje brez interneta.
const CACHE = 'sahura-v1.3.0';
const FILES = [
  './', './index.html', './css/app.css', './js/app.js', './js/clock.js', './js/store.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      // mimo HTTP predpomnilnika, da "Osveži aplikacijo" res dobi najnovejše datoteke
      const net = same ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
      return net.then(res => {
        if (res.ok && same && !url.search) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
