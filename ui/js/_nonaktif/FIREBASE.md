# Menyalakan Firebase (Auth + Firestore)

Aplikasi berjalan dalam **mode lokal** selama config belum diisi — data disimpan di
IndexedDB browser dan login menerima input apa pun. Setelah langkah di bawah selesai,
aplikasi otomatis pindah ke Firebase Auth + Firestore tanpa perlu ubah kode lagi.

## 1. Buat project

1. Buka <https://console.firebase.google.com> → **Add project**.
2. Google Analytics boleh dilewati.

## 2. Aktifkan Authentication

**Build → Authentication → Get started → Sign-in method**, lalu aktifkan:

- **Email/Password** (wajib)
- **Google** (dipakai tombol "Masuk/Daftar dengan Google" di halaman auth)

Hanya Google yang disediakan sebagai login sosial.

## 3. Buat Firestore

**Build → Firestore Database → Create database** → pilih lokasi terdekat
(`asia-southeast2` Jakarta) → mulai dari **production mode**.

Lalu buka tab **Rules**, timpa isinya dengan berkas [`../firestore.rules`](../firestore.rules),
dan tekan **Publish**. Aturannya: tiap pengguna hanya bisa membaca/menulis dokumen di
bawah `users/{uid}` miliknya sendiri.

## 4. Salin config ke aplikasi

**Project settings** (ikon gerigi) → bagian **Your apps** → tambah app **Web** (`</>`) →
salin objek `firebaseConfig`, lalu tempel ke [`js/firebase-config.js`](js/firebase-config.js):

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza....",
  authDomain: "namaproject.firebaseapp.com",
  projectId: "namaproject",
  storageBucket: "namaproject.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

> `apiKey` Firebase memang tidak rahasia — ia hanya penunjuk project. Yang menjaga
> datamu adalah security rules di langkah 3, bukan kunci ini.

## 5. Izinkan domainmu

**Authentication → Settings → Authorized domains**. `localhost` sudah ada secara
bawaan; tambahkan domain produksi saat aplikasi dideploy.

## Struktur data di Firestore

```
users/{uid}                    nama, email
users/{uid}/sampel/{autoId}    detakJantung, gulaDarah, sistolik, diastolik, spo2, waktu
users/{uid}/makanan/{autoId}   kalori, karbo, protein, lemak, gula, waktu
users/{uid}/tujuan/{id}        nama, target, progres, icon, tone
```

Foto makanan tetap disimpan di browser (localStorage), tidak diunggah — Firebase
Storage butuh akun billing diaktifkan, dan untuk kebutuhan sekarang belum perlu.

## Yang berubah setelah aktif

| Hal | Mode lokal | Firebase aktif |
|---|---|---|
| Login | Terima apa pun, langsung masuk | Akun sungguhan; salah sandi ditolak |
| Data pengukuran | IndexedDB, per-browser | Firestore, ikut ke perangkat mana pun |
| Offline | Selalu lokal | SDK menyimpan cache & mengantre tulisan sendiri |
| Tombol sinkron | Memanggil API Laravel | Tidak perlu — Firestore mengirim otomatis |
| Keluar dari tab lain | — | Tab lain ikut diarahkan ke halaman masuk |

## Cek cepat

Buka console browser. Kalau muncul
`[AsaWatch] Firebase belum dikonfigurasi — berjalan dalam mode lokal`,
berarti `firebase-config.js` belum terisi. Kalau tidak ada pesan itu dan kamu bisa
mendaftar akun baru lewat `register.html`, Firebase sudah jalan — cek juga di Console
bahwa dokumen `users/{uid}/sampel` bertambah setiap kali menekan "Ukur Sekarang".
