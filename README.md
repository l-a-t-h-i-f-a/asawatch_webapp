# AsaWatch Web App (PWA)

Versi web dari aplikasi Flutter `asawatch` — pendamping jam tangan AsaWatch untuk memantau
**respons gula darah terhadap makanan**. Satu unit kerjanya adalah **sesi makan**: pengguna
memotret piring, menekan tombol di jam saat selesai makan (t0), lalu jam mengukur empat titik —
baseline pra-makan, t0, +1 jam, +2 jam — masing-masing membawa gula darah, detak jantung,
tekanan darah, dan SpO₂. Dari situ aplikasi menghitung puncak, kenaikan dari baseline, waktu
pemulihan, dan membandingkannya lintas sesi.

Sistemnya **disamakan dengan aplikasi Flutter** di `../../Flutter/asawatch`. Dokumen normatifnya
ada di repo itu (`docs/`): `rancangan-ui-sesi-makan.md`, `jadwal-titik-ukur.md`,
`protokol-jam.md` (v1.4), `rancangan-api-laravel.md`, dan rangkumannya `cara-kerja-aplikasi.md`.
Bila kode di sini berselisih dengan dokumen itu, dokumen itulah yang benar.

Tanpa build step: HTML + CSS + JavaScript vanilla (IIFE → `window.*`). Bahasa kode dan UI
seluruhnya Bahasa Indonesia.

## Menjalankan

```bash
python3 -m http.server 8080      # atau: npx serve .
# buka http://localhost:8080/ui/
```

Backend Laravel dituju lewat `ui/js/server-config.js`: dari `localhost` → `http://localhost:8080`
(`php artisan serve --port=8080`; kalau server statis memakai port yang sama, ganti salah satunya),
dari domain lain → same-origin. Lihat [ui/SERVER.md](ui/SERVER.md) untuk CORS dan kontrak API.

Mode pengembangan — padanan `--dart-define` di Flutter, dinyalakan lewat query string (diingat di
`localStorage`) atau dari halaman **Perangkat**:

| URL | Efek |
| --- | --- |
| `ui/dashboard.html?jamPalsu=1` | `JamPalsu` — tanpa perangkat; tombol jam ditekan dari halaman Perangkat |
| `?jadwalUji=1` | jadwal dimampatkan 60× (sesi penuh 2 menit); sesinya ditandai `sesi_uji` |
| `?jadwalUji=1&faktor=12` | 12× — pakai ini dengan jam sungguhan (pengukuran butuh puluhan detik) |

Uji cepat tanpa jam: `ui/dashboard.html?jamPalsu=1&jadwalUji=1` → Perangkat → Cari Jam → Foto
Makanan → "Saya Sudah Selesai Makan" → sesi selesai sendiri dalam ±2 menit.

## Struktur

```
asawatch_webapp/
├── index.html            Landing publik → ui/login.html
├── manifest.json, sw.js  PWA; path relatif terhadap scope (aman di sub-path)
├── css/                  tokens (palet/font), main (kerangka), landing
└── ui/
    ├── login.html register.html
    ├── dashboard.html           Beranda tiga wajah: idle / sesi berjalan / sesi baru selesai
    ├── deteksi-makanan.html     kamera → draft; kartu hasil bisa dikoreksi; tombol "Selesai Makan"
    ├── sesi-berjalan.html       timeline 4 titik, dua pintu keluar (selesaikan / batalkan)
    ├── ringkasan-sesi.html?id=  satu angka satu tempat; kurva; tabel per titik
    ├── riwayat.html             per sesi, per tanggal, filter waktu makan / kualitas respons
    ├── analisis.html            sebaran karbohidrat vs kenaikan, pemicu, pemulihan
    ├── gula-darah.html tensi.html detak-jantung.html   detail metrik (per sesi + lintas sesi)
    ├── pindai-kesehatan.html    UKUR_SEKARANG di luar sesi; hasil di memori saja
    ├── kalibrasi-tensi.html     manset di lengan seberang, diukur bersamaan, satu putaran
    ├── perangkat.html           pemasangan, status jam, mode pengembangan, hapus sesi uji
    ├── profil.html bantuan.html
    ├── css/ui.css
    └── js/
        ├── server-config.js  alamat backend, Google Client ID, sakelar mode
        ├── protokol.js       codec BLE byte ↔ JS (port protokol_jam.dart) — murni, tanpa I/O
        ├── model.js          SesiMakan/Jadwal/Nutrisi/Kalibrasi/AnalisisSesi + nilai turunan
        ├── db.js             IndexedDB: sesi (nisan), foto (Blob), entri_jam, anchor, kalibrasi
        ├── server.js         klien API Laravel §5.2 penuh (cursor, upsert, foto, analisis, profil)
        ├── ble.js            JamAsli (Web Bluetooth) + JamPalsu, satu antarmuka
        ├── sesi.js           SesiMakanController — satu-satunya pengelola state sesi
        ├── komponen.js       timeline, petunjuk tombol jam/ukur, ringkasan gizi, kartu sesi
        ├── kurva.js          grafik dari sampel (Chart.js; sumbu x dari sampel, bukan literal)
        ├── shell.js          kerangka, nav 5 slot + tombol tengah, guard login, perakitan App
        └── pages.js          controller tiap halaman (router via <body data-page>)
```

Urutan muat skrip di tiap halaman: `server-config → protokol → model → db → server → ble → sesi →
komponen → kurva → shell → pages`. `shell.js` merakit `window.App` (DB → jam → controller) dan
halaman menunggu `App.siap`.

## Aturan yang dibawa dari Flutter (jangan dilanggar)

- **Hanya satu sesi aktif.** Memotret saat ada sesi menawarkan "akhiri sesi berjalan" dulu.
- **t0 milik jam.** Sesi mulai hanya saat peristiwa `TOMBOL_SELESAI_MAKAN` tiba. Tombol "Saya Sudah
  Selesai Makan" mengirim `MULAI_SESI` (payload `sesiId` saja, tanpa waktu) dan **tidak mengubah
  layar** sampai jam menjawab. Tombol fisik jam disebut lebih dulu dan tidak boleh dihapus.
- **ARM dulu, baru UKUR baseline.** Jam yang belum di-ARM menolak baseline diam-diam.
- **Jadwal adalah data** (`Model.jadwalNormal`, `jadwalUji`): jendela +1 jam 55–70 mnt, +2 jam
  110–150 mnt. Terlalu cepat **ditahan** (tombol mati + hitung mundur); terlalu lambat **diterima
  dan ditandai telat**. `ARM_TITIK` dikirim saat jendela terbuka, bukan di awal sesi.
- **Tenggat** 30 menit setelah titik terakhir menutup sesi `tidakLengkap` — kecuali jam **terbukti**
  sedang mengukur (dibaca dari karakteristik Status), maksimal 12 × 30 s.
- **Sampel di-dedup** `(sesiId, index)`; `UKUR_SEKARANG` (sesiId nol) tidak pernah mengisi slot sesi.
- **Angka yang belum ada ditulis "—"**, tidak pernah nilai lama. Nutrisi `null` ≠ 0.
- **Simpan dulu, baru kirim, berurutan.** `diperbaruiPada` distempel `db.js`, bukan pemanggil;
  yang naik ke server adalah hasil tulisan (mencegah 409 `konflik_versi`).
- **Batal = nisan** (`dihapusPada`) yang disapu sebelum unggah/unduh; `DELETE` 404 = sukses.
- **Unduh hanya ke bawah**: sesi lokal tidak pernah ditimpa, sesi berjalan di server dilewati,
  offset baseline dihitung ulang `waktuFoto − t0`, gagal ambil = `null` bukan `[]`.
- **Sesi uji** tetap disimpan dan tampil berlencana, tetapi tidak ikut Analisis maupun ringkasan
  hari ini. **Ganti akun** membersihkan riwayat/foto/kalibrasi/kotak masuk sebelum unggahan pertama;
  jam dan anchor tetap. **Keluar tidak menghapus** apa pun.
- **Kemampuan jam** (handshake) menentukan metrik yang tampil; `null` = tampilkan semua; nilai
  yang sudah ada tidak pernah disembunyikan. Baterai kritis (<10%, ambang milik firmware) membuat
  jam menolak mengukur — satu kalimat `alasanJamTidakBisaUkur` dipakai empat permukaan.

## Protokol jam (Web Bluetooth)

`ui/js/protokol.js` adalah port setia `protokol_jam.dart`: layanan `a5a70001-…`, karakteristik
Info/Kontrol/Peristiwa/Sampel/Status, opcode `0x01–0x0A`, paket Info 20 B, Sampel 31 B,
Peristiwa 26 B, Status 8/10 B. `ui/js/ble.js` menjalankan urutan §5.1 (baca Info → langgani →
`ANCHOR_WAKTU` → `SINKRON`), menunggu ACK/NAK di Peristiwa (5 s × 3, hormati `bolehRetry`),
meng-ack entri **setelah** tersimpan di `entri_jam`, dan mesin denyut pengukuran §5.6.

Keterbatasan web yang disebut apa adanya:

- **Tidak ada proses latar.** Timer (`ARM_TITIK`, tenggat, pengingat, ukur otomatis) hidup hanya
  selagi tab terbuka. Jadwal dihitung ulang dari `t0` saat halaman dibuka lagi, jadi sesinya tetap
  benar; pengingat memakai Notification API selagi tab hidup.
- **Bonding** milik browser; `bondBasi` hanya bisa diselesaikan lewat pengaturan Bluetooth sistem.
- **MTU** tidak bisa diminta. Paket Sampel < 31 byte **tidak di-ack** (§6) dan dicatat sebagai
  tanda MTU masih 23.
- Web Bluetooth: Chrome/Edge, HTTPS atau `localhost`.
- Token disimpan di `localStorage` (tidak ada secure storage di web).

## Yang belum ada (sama seperti Flutter)

Target harian/tujuan kesehatan, sinkron kursor §7, deteksi nutrisi lokal (server §6 yang dipakai;
tanpa akun angka gizi diisi manual), foreground service.
