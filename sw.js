// Service worker AsaWatch. Semua path relatif terhadap scope pendaftaran
// (`self.registration.scope`), supaya pemasangan di sub-path tetap bekerja.
const CACHE_NAME = 'asawatch-v10';
const AKAR = new URL('./', self.registration.scope).pathname;
const r = (p) => AKAR + p;

const ASSETS_TO_CACHE = [
  '', 'index.html', 'css/tokens.css', 'css/landing.css', 'css/main.css', 'ui/css/ui.css',
  'ui/index.html', 'ui/login.html', 'ui/register.html', 'ui/app.html',
  'ui/js/protokol.js', 'ui/js/model.js', 'ui/js/db.js', 'ui/js/server.js', 'ui/js/ble.js',
  'ui/js/sesi.js', 'ui/js/komponen.js', 'ui/js/kurva.js', 'ui/js/shell.js', 'ui/js/pages.js',
  'assets/logo/icon-32.png', 'assets/logo/icon-192.png', 'assets/logo/logo-mark.png', 'assets/logo/logo-asawatch.png',
].map(r);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Satu aset yang gagal tidak boleh menggagalkan pemasangan seluruhnya.
      .then((cache) => Promise.allSettled(ASSETS_TO_CACHE.map((a) => cache.add(a))))
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
  const url = new URL(req.url);
  const sendiri = url.origin === location.origin;

  // Permintaan API dan foto bertanda tangan tidak pernah lewat cache.
  if (!sendiri && !/(jsdelivr|cdnjs|gstatic|googleapis)/.test(url.host)) return;
  if (sendiri && url.pathname.includes('/api/')) return;

  // Berkas *-config.js: selalu dari jaringan — isinya berubah begitu alamat backend diganti.
  if (url.pathname.endsWith('-config.js')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Halaman & berkas aplikasi sendiri: utamakan jaringan supaya perubahan kode
  // langsung terlihat; cache hanya saat offline (fallback terakhir index.html).
  const navigasi = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (navigasi || (sendiri && /\.(js|css|html|json)$/.test(url.pathname))) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const salinan = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, salinan)); } return res; })
        .catch(() => caches.match(req).then((c) => c || (navigasi ? caches.match(r('index.html')) : undefined)))
    );
    return;
  }

  // Sisanya (gambar, font, pustaka CDN): cache dulu, jaringan bila belum ada.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) { const salinan = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, salinan)); }
      return res;
    }).catch(() => cached))
  );
});
