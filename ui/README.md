# AsaWatch — UI multi-halaman

Versi tampilan dengan **satu berkas HTML per halaman**, mengikuti desain HealthWatch.
Data yang ditampilkan diambil dari sumber asli, bukan angka tetap:

- **API Laravel** yang sama dengan aplikasi Android, sehingga data ikut muncul di panel
  admin — lihat [SERVER.md](SERVER.md)
- **Salinan lokal** di browser untuk dibaca saat jaringan mati, plus antrean kirim ulang
- **Web Bluetooth** untuk membaca perangkat (ada Mode Simulasi untuk uji tanpa jam)

## Halaman

| Berkas | Isi |
|---|---|
| `login.html` | Masuk — submit langsung membuka `dashboard.html` |
| `register.html` | Daftar akun |
| `dashboard.html` | Beranda: kartu metrik, grafik, status hari ini, perangkat |
| `detak-jantung.html` / `gula-darah.html` / `tensi.html` | Detail per metrik: nilai terakhir, statistik, grafik, tabel |
| `deteksi-makanan.html` | Kamera/unggah foto + catatan kalori & makro |
| `riwayat.html` | Seluruh pengukuran, filter jenis, paginasi |
| `profil.html` | Profil dan pintasan pengaturan |
| `pengaturan-perangkat.html` | Koneksi jam, saklar pengaturan, pemakaian aplikasi |
| `tujuan-kesehatan.html` | Daftar tujuan + tambah/hapus |
| `bantuan.html` | Topik bantuan & kontak |

`index.html` di folder ini hanya pengalih: ke `dashboard.html` bila sudah pernah masuk,
selain itu ke `login.html`. Landing page publik ada di `../index.html`.

Halaman aplikasi (selain login/daftar) menolak dibuka tanpa sesi — `shell.js` melempar
pengunjung ke `login.html` bila `aw_token` kosong.

## Berkas pendukung

- `js/shell.js` — sprite ikon, sidebar, topbar, bottom nav (disuntik ke tiap halaman)
- `js/server-config.js` — alamat backend & penanda sesi uji
- `js/server.js` — klien API Laravel (auth, sesi, profil, foto)
- `js/store.js` — lapisan data: server + salinan lokal + antrean offline
- `js/device.js` — koneksi Bluetooth ke jam, sambung ulang otomatis, mode simulasi
- `js/pages.js` — controller tiap halaman (dipilih lewat `<body data-page="…">`)
- `css/ui.css` — tambahan di atas `../css/main.css`

## Menjalankan

```bash
cd asawatch_webapp
python -m http.server 8080
```

Lalu buka <http://localhost:8080/> untuk landing, atau <http://localhost:8080/ui/> untuk langsung ke aplikasi. Web Bluetooth butuh Chrome/Edge dan HTTPS di produksi.
