/**
 * server-config.js — alamat backend AsaWatch (Laravel) dan sakelar mode
 * pengembangan. Padanan `--dart-define` di aplikasi Flutter (lib/konfigurasi.dart).
 *
 * Webapp memakai API yang sama dengan aplikasi Android, sehingga datanya
 * muncul di panel admin yang sama.
 */
(function () {
  const q = new URLSearchParams(location.search);
  const lokal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  window.ASAWATCH_SERVER = {
    /**
     * Alamat backend. Tanpa garis miring di akhir.
     *
     * Saat dibuka dari localhost, webapp memakai Laravel yang berjalan di laptop
     * (`php artisan serve --port=8080`). Datanya masuk ke database lokal, BUKAN ke
     * panel admin online.
     *
     * Di domain mana pun selain itu, webapp menuju server produksi. Karena webapp
     * dipasang di domain yang BERBEDA dari API, origin webapp wajib terdaftar di
     * `config/cors.php` server (lihat ui/SERVER.md) — tanpa itu browser memblokir
     * semua permintaan. Kalau suatu saat webapp dipasang same-origin dengan API,
     * nilai ini boleh dikosongkan ('') supaya CORS tidak ikut bermain.
     */
    basisUrl: lokal ? 'http://localhost:8080' : 'https://asawatch.enumatechnology.com',

    /** Ditampilkan di daftar perangkat pengguna pada server. */
    namaPerangkat: 'AsaWatch Web',

    /**
     * Client ID Google (tipe Web) — harus SAMA dengan GOOGLE_CLIENT_ID di server,
     * karena server memverifikasi `aud` token terhadap nilai itu. Domain webapp
     * wajib terdaftar di Google Cloud Console → Authorized JavaScript origins.
     */
    googleClientId: '409100365490-jg0nbsk5dch08upih5opav80jgcf16kt.apps.googleusercontent.com',

    /**
     * Mode pengembangan — padanan PAKAI_JAM_PALSU / PAKAI_JADWAL_UJI /
     * FAKTOR_JADWAL_UJI di Flutter. Bisa dinyalakan lewat query string
     * (`?jamPalsu=1&jadwalUji=1&faktor=12`) yang lalu diingat di localStorage,
     * atau lewat halaman Perangkat.
     *
     * Sesi yang direkam dengan jadwal uji SELALU ditandai `sesi_uji: true`:
     * tidak ada jalan memakai jadwal dua menit tanpa sesinya ikut tertandai.
     */
    pakaiJamPalsu: q.has('jamPalsu') ? q.get('jamPalsu') !== '0' : null,
    pakaiJadwalUji: q.has('jadwalUji') ? q.get('jadwalUji') !== '0' : null,
    faktorJadwalUji: q.has('faktor') ? Number(q.get('faktor')) || 60 : null,
  };

  // Sakelar dari query string diingat, supaya navigasi antar halaman tidak
  // membuangnya. Nilai null = "tidak disebut", biarkan pengaturan tersimpan.
  try {
    const s = JSON.parse(localStorage.getItem('aw_settings') || '{}');
    const C = window.ASAWATCH_SERVER;
    let ubah = false;
    if (C.pakaiJamPalsu !== null) { s.simulasi = C.pakaiJamPalsu; ubah = true; }
    if (C.pakaiJadwalUji !== null) { s.jadwalUji = C.pakaiJadwalUji; ubah = true; }
    if (C.faktorJadwalUji !== null) { s.faktorJadwalUji = C.faktorJadwalUji; ubah = true; }
    if (ubah) localStorage.setItem('aw_settings', JSON.stringify(s));
  } catch { /* localStorage tidak tersedia */ }
})();
