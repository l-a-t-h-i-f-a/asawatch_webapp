# Sambungan ke server AsaWatch

Webapp memakai **API yang sama dengan aplikasi Android**, jadi datanya masuk ke
database yang sama dan muncul di panel admin `https://asawatch.enumatechnology.com/admin`.

Kontraknya mengikuti `asawatch_apk/docs/rancangan-api-laravel.md`.

## Alamat backend

Diatur di [`js/server-config.js`](js/server-config.js):

| Kondisi | `basisUrl` |
|---|---|
| Dibuka dari `localhost` | `https://asawatch.enumatechnology.com` |
| Dibuka dari domain lain | `''` (kosong = domain halaman itu sendiri) |

Kalau webapp dipasang di domain yang sama dengan API, biarkan kosong — tidak perlu CORS
sama sekali.

## ⚠️ CORS harus dibuka dulu

Server saat ini menolak permintaan dari origin lain. Dicek dengan:

```
curl -i -X OPTIONS -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST" \
  https://asawatch.enumatechnology.com/api/v1/auth/masuk
```

Jawabannya 204 tapi **tanpa header `Access-Control-Allow-Origin`**, karena di
`asawatch_web/config/cors.php` isinya masih `'allowed_origins' => []`.

Selama itu belum diubah, browser akan memblokir semua permintaan dari webapp dan yang
terlihat hanya "Tidak bisa terhubung ke server".

Dua cara menyelesaikannya:

1. **Buka origin-nya di server** — di `config/cors.php`:
   ```php
   'allowed_origins' => [
       'http://localhost:8080',                  // pengembangan
       'https://asawatch.enumatechnology.com',   // produksi
   ],
   ```
   lalu `php artisan config:clear` di server.

2. **Pasang webapp di domain yang sama** (mis. `/app/`) sehingga jadi same-origin.
   Ini cara paling bersih untuk produksi karena CORS tidak ikut bermain.

## Bagaimana data dipetakan

Admin menyimpan data dalam bentuk **sesi makan berisi empat titik ukur**. Webapp
menyesuaikan diri ke bentuk itu:

| Aksi di webapp | Dikirim sebagai |
|---|---|
| Tombol **Ukur Sekarang** | Satu sesi, `status: tidak_lengkap`, nilai di `sampel[1]` (momen t0), tiga titik lain `terlewat` |
| **Simpan Hasil** di Deteksi Makanan | Satu sesi `status: draft` dengan `hasil.total` berisi angka gizi; fotonya menyusul lewat `POST /sesi/{id}/foto` |

Keduanya ditandai `sesi_uji: true` — penanda pasif: server tetap menyimpan, menampilkan,
dan mengekspornya, tapi pembaca data bisa membedakannya dari sesi makan sungguhan yang
punya empat titik lengkap. Matikan lewat `tandaiSesiUji: false` di `server-config.js`.

Pengiriman bersifat **idempoten**: UUID dibuat di sisi webapp dan endpointnya upsert,
jadi kiriman ulang tidak menggandakan baris.

## Saat jaringan mati

- Sesi yang gagal terkirim **diantre** di browser, dan halaman tetap menampilkannya.
- Tombol sinkron di topbar mengirim ulang seluruh antrean.
- Jumlah antrean terlihat di **Pengaturan Perangkat → Menunggu dikirim**.
- **Reset Perangkat** hanya membuang salinan lokal; data di server tidak tersentuh.

## Yang belum tersambung

- **Tujuan Kesehatan** masih disimpan lokal. Endpoint `/target-harian` ada, tapi
  kontraknya belum final di dokumen rancangan (§5.5 menyebut "boleh dikerjakan paling akhir").
- **Masuk dengan Google sudah jalan** lewat `POST /api/v1/auth/google` (ditambahkan di
  backend 6 September 2026). Browser mengambil ID token dari Google Identity Services,
  server memverifikasinya ke kunci publik Google lalu membalas token Sanctum. Tidak ada
  rahasia yang disimpan di webapp.

  **Syaratnya:** `googleClientId` di `js/server-config.js` harus sama dengan
  `GOOGLE_CLIENT_ID` di server, dan domain webapp harus terdaftar di Google Cloud Console →
  Credentials → OAuth client → **Authorized JavaScript origins** (termasuk
  `http://localhost:8080` untuk pengembangan). Kalau belum, tombolnya tidak muncul dan
  halaman menampilkan catatan kecil sebagai gantinya.
- Berkas Firebase dipindah ke [`js/_nonaktif/`](js/_nonaktif/) — tidak dimuat lagi,
  aman dihapus kalau sudah yakin.
