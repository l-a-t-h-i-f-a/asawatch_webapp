const CACHE_NAME = 'asawatch-v8';

// Aset yang dipakai berulang: landing, shell aplikasi, dan gaya/logika bersama.
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/landing.css',
  '/css/main.css',
  '/ui/css/ui.css',
  '/ui/login.html',
  '/ui/dashboard.html',
  '/js/bluetooth.js',
  '/ui/js/device.js',
  '/ui/js/server.js',
  '/ui/js/shell.js',
  '/ui/js/store.js',
  '/ui/js/pages.js',
  '/js/database.js',
  '/js/api.js',
  '/assets/logo/logo2.jpeg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => n !== CACHE_NAME ? caches.delete(n) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Berkas *-config.js: selalu ambil dari jaringan, jangan pernah dari cache —
  // isinya berubah begitu alamat backend diganti.
  if (req.url.includes('-config.js')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Halaman (HTML): utamakan jaringan supaya perubahan landing/aplikasi langsung terlihat,
  // jatuh ke cache hanya saat offline.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const salinan = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, salinan));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Berkas milik aplikasi sendiri (HTML/JS/CSS di domain ini): utamakan jaringan.
  // Cache-first di sini membuat perubahan kode tidak pernah terlihat sampai versi
  // cache dinaikkan — gejalanya "kok masih tampilan lama", dan susah ditebak.
  const sendiri = new URL(req.url).origin === location.origin;
  if (sendiri && /\.(js|css|html)$/.test(new URL(req.url).pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const salinan = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, salinan));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Sisanya (gambar, font, pustaka dari CDN): cache dulu, jaringan bila belum ada.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && sendiri) {
        const salinan = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, salinan));
      }
      return res;
    }).catch(() => cached))
  );
});
