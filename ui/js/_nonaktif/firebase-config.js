/**
 * firebase-config.js — ISI BAGIAN INI dengan config dari Firebase Console.
 *
 * Cara mengambilnya:
 *   1. console.firebase.google.com  ->  buat / pilih project
 *   2. Project settings (ikon gerigi)  ->  scroll ke "Your apps"
 *   3. Tambah app Web (ikon </>), lalu salin isi objek firebaseConfig ke bawah ini
 *
 * Selama apiKey masih berisi "GANTI...", aplikasi berjalan dalam MODE LOKAL:
 * data disimpan di browser (IndexedDB) dan login tidak memeriksa apa pun.
 * Begitu config diisi benar, aplikasi otomatis memakai Firebase Auth + Firestore.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDCMDy-OSNCmzdTHjIhCdgtvCu9x51SeLc",
  authDomain: "asawatch-web.firebaseapp.com",
  projectId: "asawatch-web",
  storageBucket: "asawatch-web.firebasestorage.app",
  messagingSenderId: "587463325917",
  appId: "1:587463325917:web:5ff503255e77a3928fc334",
  measurementId: "G-T5YRZ69H7S"
};

/** Versi SDK Firebase yang dimuat dari CDN. */
window.FIREBASE_VERSION = "10.12.2";
