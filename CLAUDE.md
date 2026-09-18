# CLAUDE.md

Panduan untuk Claude Code saat bekerja di repo ini.

## Proyek

`asawatch_webapp` — PWA pendamping jam AsaWatch, **versi web dari aplikasi Flutter
`asawatch`** (`/home/rad/project/Project Enuma/Flutter/asawatch`). Konsepnya *sesi makan*
episodik, bukan pemantauan kontinu. Seluruh teks UI, nama berkas, dan nama variabel memakai
**Bahasa Indonesia** (`beranda`, `riwayat`, `sesi`, `perangkat`, `kalibrasi`).

**Dokumen normatif ada di repo Flutter, bukan di sini.** Baca sebelum mengubah permukaan sesi:
`docs/rancangan-ui-sesi-makan.md` (UI), `docs/jadwal-titik-ukur.md` (jadwal & jendela),
`docs/protokol-jam.md` v1.4 (BLE — bila `ui/js/protokol.js` berselisih dengannya, salah satunya
bug), `docs/rancangan-api-laravel.md` (server), dan rangkumannya `docs/cara-kerja-aplikasi.md`.
`CLAUDE.md` di repo Flutter berisi alasan di balik hampir setiap keputusan; port di sini
mengikutinya, dan daftar aturannya dirangkum di [README.md](README.md) §"Aturan yang dibawa".

Tanpa build step, tanpa package.json, tanpa test runner. Vanilla JS IIFE yang mengekspor ke
`window.*`; Chart.js dari CDN hanya di halaman bergrafik.

## Perintah

```bash
python3 -m http.server 8080          # lalu buka http://localhost:8080/ui/
node --check ui/js/*.js sw.js        # cek sintaks
```

Uji alur tanpa jam: `ui/app.html?jamPalsu=1&jadwalUji=1` (sesi penuh 2 menit). Dengan jam
sungguhan pakai `&faktor=12`. Untuk uji headless: satu proses Chrome per profil — profil yang
dibunuh di tengah jalan meninggalkan IndexedDB terkunci, jadi jalankan banyak halaman lewat CDP
dalam satu sesi, bukan `--dump-dom` berulang.

## Arsitektur

```
pages.js (controller per rute; shell.js router hash #/<nama>, satu dokumen)
   │  membaca satu controller lewat App.siap, menggambar ulang pada event 'ubah'
   ▼
sesi.js  SesiMakanController ── ble.js (JamAsli | JamPalsu) ── protokol.js (byte ↔ JS murni)
   ├─ db.js     IndexedDB: sesi/foto/entri_jam/anchor/kalibrasi (lokal dulu)
   └─ server.js API §5.2 (menyusul, boleh gagal diam)
shell.js  merakit App (DB → jam → controller), nav 5 slot + tombol tengah, guard login
model.js  nilai turunan sesi, jadwal, gizi, kalibrasi, AnalisisSesi — dihitung, tak disimpan
komponen.js / kurva.js  potongan tampilan & grafik bersama
```

Hal yang menjelaskan sebagian besar bentuk kode:

- **Satu pengelola state**: `SesiMakanController`. Halaman tidak memegang state sesi sendiri;
  mereka menggambar ulang dari controller. Render halaman bersifat async (foto dari IndexedDB),
  jadi tiap `gambar()` membawa nomor generasi dan render yang lebih lama dibuang.
- **Hitung mundur detik-detikan lokal** (`Komponen.pasangHitungMundur`), bukan event controller.
- **`db.simpanSesi` menstempel `diperbaruiPada` dan mengembalikannya**; pemanggil memakai hasil
  tulisan, bukan salinannya (409 `konflik_versi`). Simpan dulu, baru kirim, berurutan.
- **Jam palsu** (`JamPalsu`) tidak pernah dihapus — satu-satunya cara demo tanpa perangkat.
  `buatJamBawaan()` memakainya dengan `percepatan: 10` supaya pengukuran 2 s muat di jendela
  jadwal uji; ia meniru NAK 0x05 selagi sensor sibuk dan v1.3 (UKUR dilayani di semua status).
- **Keterbatasan web** tidak diakali: tanpa proses latar (timer hidup selagi tab terbuka; jadwal
  dihitung ulang dari t0 saat halaman dibuka), bonding milik browser, MTU tak bisa diminta (paket
  Sampel kependekan **tidak di-ack**), token di `localStorage`.

## Gaya

Palet & font di `css/tokens.css` (hijau `#2fa360`, latar `#f3f8f4`, Plus Jakarta Sans); komponen
sesi di `ui/css/ui.css`. Dua tingkat kartu: `.card.utama` (satu hal yang meminta sesuatu, satu
angka hero) dan `.card.sekunder` (sekadar tersedia). Semua nilai user/server yang masuk
`innerHTML` lewat `UI.esc()`.
