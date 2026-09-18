/**
 * server-config.js — alamat backend AsaWatch (Laravel).
 *
 * Webapp memakai API yang sama dengan aplikasi Android, sehingga datanya
 * muncul di panel admin yang sama.
 */
window.ASAWATCH_SERVER = {
  /**
   * Alamat backend. Tanpa garis miring di akhir; kosong = domain halaman ini.
   *
   * Saat dibuka dari localhost, webapp memakai Laravel yang berjalan di laptop
   * (`php artisan serve`). Datanya masuk ke database lokal, BUKAN ke panel admin
   * online. Untuk menguji langsung ke server produksi, ganti nilai di bawah
   * menjadi 'https://asawatch.enumatechnology.com' — tapi CORS di sana harus
   * sudah dibuka lebih dulu.
   */
  basisUrl: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : '',

  /** Ditampilkan di daftar perangkat pengguna pada server. */
  namaPerangkat: 'AsaWatch Web',

  /**
   * Client ID Google (tipe Web) — harus SAMA dengan GOOGLE_CLIENT_ID di server,
   * karena server memverifikasi `aud` token terhadap nilai itu.
   *
   * Domain tempat webapp dibuka wajib terdaftar di Google Cloud Console →
   * Credentials → OAuth client → "Authorized JavaScript origins", termasuk
   * http://localhost:8080 untuk pengembangan.
   */
  googleClientId: '409100365490-jg0nbsk5dch08upih5opav80jgcf16kt.apps.googleusercontent.com',

  /**
   * Pengukuran lepas dari webapp (tombol "Ukur Sekarang") ditandai sebagai
   * sesi uji. Penanda pasif: server tetap menyimpan, menampilkan, dan
   * mengekspornya — hanya saja pembaca data bisa membedakannya dari sesi makan
   * sungguhan yang punya empat titik lengkap.
   */
  tandaiSesiUji: true,
};
