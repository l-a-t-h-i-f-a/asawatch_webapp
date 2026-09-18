# Sambungan ke server AsaWatch

Webapp memakai **API yang sama dengan aplikasi Android**, jadi datanya masuk ke
database yang sama dan muncul di panel admin `https://asawatch.enumatechnology.com/admin`.

Kontraknya `asawatch/docs/rancangan-api-laravel.md`; klien di [`js/server.js`](js/server.js)
(padanan `auth_http_service.dart`, `sesi_server_service.dart`, `profil_server_service.dart`).

## Alamat backend

Diatur di [`js/server-config.js`](js/server-config.js):

| Kondisi | `basisUrl` |
|---|---|
| Dibuka dari `localhost` | `http://localhost:8080` (Laravel lokal, `php artisan serve --port=8080`) |
| Dibuka dari domain lain | `''` (kosong = domain halaman itu sendiri) |

Kalau webapp dipasang di domain yang sama dengan API, biarkan kosong — tidak perlu CORS.

## ⚠️ CORS harus dibuka dulu

Server produksi menolak permintaan dari origin lain (`config/cors.php` masih
`'allowed_origins' => []`). Gejalanya di webapp: "Server tidak bisa dihubungi dari alamat ini".
Dua cara: buka origin-nya di server (`http://localhost:8080`, domain produksi webapp) lalu
`php artisan config:clear`, atau pasang webapp same-origin (mis. `/app/`).

## Autentikasi

- `POST /auth/masuk` — `email`, `kata_sandi`, `nama_perangkat`. **`galat.kode` dibaca sebelum
  status HTTP**: kata sandi salah dijawab `422 validasi_gagal`, bukan 401. `tidak_terautentikasi`,
  `kredensial_salah`, `validasi_gagal` → "kredensial salah"; selain itu → "server bermasalah",
  tidak pernah "periksa kata sandi". Galat ditampilkan **di atas tombol**, bukan toast.
- `POST /auth/daftar` — langsung memberi token; `EmailSudahDipakai` dikenali dari `galat.detail.email`.
- `POST /auth/google` — ID token dari Google Identity Services; `googleClientId` harus sama dengan
  `GOOGLE_CLIENT_ID` server dan origin webapp terdaftar di Google Cloud Console.
- `POST /auth/keluar` — dicabut di server dulu, tetap berhasil offline. **Keluar tidak menghapus data.**
- **401 dari endpoint ber-token mana pun** (kecuali `masuk`) → token dibuang, kembali ke login
  dengan alasannya ("Sesi Anda sudah berakhir"). 5xx tidak pernah mengeluarkan siapa pun.

## Sesi makan (§5.2)

Bentuk JSON sama untuk baca dan tulis: `id`, `waktu_foto`, `t0`, `status` (**snake_case**:
`draft`, `menunggu_perangkat`, `berjalan`, `selesai`, `tidak_lengkap`, `dibatalkan`),
`waktu_tidak_pasti`, `sesi_uji`, `sampel[4]` (`index`, `detik_relatif_t0`, `status`,
`dari_buffer`, lima metrik `null` bila gagal — **bukan 0**), `hasil` (`total`, `makanan[]` dengan
`urutan`, `zat_tidak_lengkap`, `keyakinan`, `dikoreksi_user`), `diperbarui_pada`.

| Kapan | Apa |
|---|---|
| Rana ditekan | `PUT /sesi/{id}` draft → `POST /sesi/{id}/foto` (multipart `foto`) → `POST /sesi/{id}/analisis` lalu poll `GET` 2→4→8 s (~1 menit); `gagal` adalah status, bukan HTTP 500 |
| Tiap titik terisi, t0 masuk, sesi berakhir | `PUT /sesi/{id}` (upsert, idempoten; id UUID dibuat klien) |
| Buka aplikasi, tab kembali terlihat, setelah masuk | `kirimRiwayatKeServer()`: sapu nisan (`DELETE /sesi/{id}`, 404 = sukses) → PUT semua riwayat → foto untuk sesi yang server bilang belum punya → analisis bila `hasil` masih kosong → unduh |
| Unduh | `GET /sesi` mengikuti `meta.next_cursor`; lokal tidak ditimpa, sesi berjalan di server dilewati, offset baseline dihitung ulang `waktu_foto − t0`, gagal = `null` |
| Foto | `foto.url` bertanda tangan (kedaluwarsa 1 jam, terikat host) diunduh **dengan Bearer**; hanya Blob-nya yang disimpan (IndexedDB), URL tidak |

`diperbarui_pada` = stempel penulisan lokal (`db.js`), **bukan** waktu kirim — aturan
"terbaru menang" §7.1. Kiriman yang ditolak dicatat di console dengan status & kepala badan,
tidak ditampilkan ke pengguna (yang memperbaiki dirinya sendiri tidak perlu peringatan).

Tanpa akun: sesi tetap utuh di browser; angka gizi diisi manual (`dikoreksi_user: true`).

## Profil (§5.1) & kalibrasi (§5.3)

`GET/PUT /profil` — semua field boleh `null`; string kosong dikirim `null`; `jenis_kelamin`
`laki-laki|perempuan` diterjemahkan di satu tempat; PUT menjawab 201 (dicek kelas 2xx). Gagal
menyimpan ke akun dilaporkan jujur ("tersimpan di browser ini saja").

`POST /kalibrasi` — `waktu`, `sisi`, `sistolik_referensi`, `diastolik_referensi`,
`sistolik_jam`, `diastolik_jam`; offset dihitung di aplikasi. Dikirim best-effort setelah
`SET_KALIBRASI` diterima jam.

## Penyimpanan lokal

IndexedDB `asawatch`: `sesi` (baris nisan = `dihapusPada` terisi, disaring di `muatSemuaSesi`),
`foto` (Blob per sesi), `entri_jam` (kotak masuk mentah jam, di-ack hanya setelah tersimpan),
`anchor` (per `bootId`, milik perangkat keras), `kalibrasi`, `meta` (`seqTerakhir`,
`bootIdTerakhir`). `localStorage`: token, identitas, pengaturan, id jam, email akun terakhir
(untuk mendeteksi ganti akun → `hapusDataLokal()` sebelum unggahan pertama).
