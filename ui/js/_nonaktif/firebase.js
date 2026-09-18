/**
 * firebase.js — inisialisasi Firebase Auth + Firestore.
 *
 * Dimuat sebagai <script type="module">. Berkas lain (store.js, pages.js, shell.js)
 * cukup memakai window.FB:
 *
 *   await FB.ready;            // tunggu SDK siap & status login diketahui
 *   FB.aktif                   // true bila config sudah diisi
 *   FB.uid                     // uid pengguna yang sedang masuk (null bila belum)
 *   FB.masuk / daftar / keluar / masukGoogle
 *   FB.fs                      // fungsi Firestore yang dipakai store.js
 *
 * Bila config belum diisi, FB.aktif = false dan aplikasi memakai penyimpanan lokal.
 */

const cfg = window.FIREBASE_CONFIG || {};
const terkonfigurasi = !!cfg.apiKey && !String(cfg.apiKey).startsWith('GANTI');
const VERSI = window.FIREBASE_VERSION || '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${VERSI}`;

/** Cermin ringan ke localStorage supaya penjaga sesi yang sinkron tetap bekerja. */
function simpanSesi(user) {
  if (user) {
    localStorage.setItem('aw_token', user.uid);
    localStorage.setItem('aw_user', JSON.stringify({
      nama: user.displayName || (user.email || '').split('@')[0] || 'Pengguna',
      email: user.email || '—',
      uid: user.uid,
    }));
  } else {
    localStorage.removeItem('aw_token');
    localStorage.removeItem('aw_user');
  }
}

const FB = {
  aktif: terkonfigurasi,
  uid: null,
  user: undefined,   // undefined = status login belum diketahui
  auth: null,
  db: null,
  fs: null,
  _pendengar: [],

  /** Daftarkan callback saat status login berubah. */
  onUser(cb) {
    FB._pendengar.push(cb);
    if (FB.user !== undefined) cb(FB.user);
  },
  _umumkan(user) {
    FB.user = user;
    FB.uid = user ? user.uid : null;
    simpanSesi(user);
    FB._pendengar.forEach(cb => { try { cb(user); } catch (e) { console.warn(e); } });
  },

  async masuk(email, sandi) {
    await FB.ready;
    if (!FB.aktif) throw new Error('mode-lokal');
    const { signInWithEmailAndPassword } = FB._authApi;
    const cred = await signInWithEmailAndPassword(FB.auth, email, sandi);
    return cred.user;
  },

  async daftar(nama, email, sandi) {
    await FB.ready;
    if (!FB.aktif) throw new Error('mode-lokal');
    const { createUserWithEmailAndPassword, updateProfile } = FB._authApi;
    const cred = await createUserWithEmailAndPassword(FB.auth, email, sandi);
    if (nama) await updateProfile(cred.user, { displayName: nama });
    FB._umumkan(cred.user);
    return cred.user;
  },

  async masukGoogle() {
    await FB.ready;
    if (!FB.aktif) throw new Error('mode-lokal');
    const { GoogleAuthProvider, signInWithPopup } = FB._authApi;
    const cred = await signInWithPopup(FB.auth, new GoogleAuthProvider());
    return cred.user;
  },

  async keluar() {
    await FB.ready;
    if (FB.aktif) { const { signOut } = FB._authApi; await signOut(FB.auth); }
    simpanSesi(null);
  },

  /** Pesan galat Firebase dalam bahasa Indonesia. */
  pesanGalat(e) {
    const kode = (e && e.code) || '';
    return {
      'auth/invalid-email': 'Format email tidak valid',
      'auth/missing-password': 'Password belum diisi',
      'auth/weak-password': 'Password minimal 6 karakter',
      'auth/email-already-in-use': 'Email sudah terdaftar',
      'auth/invalid-credential': 'Email atau password salah',
      'auth/wrong-password': 'Email atau password salah',
      'auth/user-not-found': 'Akun tidak ditemukan',
      'auth/too-many-requests': 'Terlalu banyak percobaan, coba lagi nanti',
      'auth/network-request-failed': 'Tidak bisa terhubung ke server',
      'auth/popup-closed-by-user': 'Jendela login ditutup',
      'auth/operation-not-allowed': 'Metode login ini belum diaktifkan di Firebase Console',
    }[kode] || (e && e.message) || 'Terjadi kesalahan';
  },
};

/* ---------- pemuatan SDK ---------- */
FB.ready = (async () => {
  if (!terkonfigurasi) {
    console.info('[AsaWatch] Firebase belum dikonfigurasi — berjalan dalam mode lokal. ' +
      'Isi ui/js/firebase-config.js untuk menyalakan Auth + Firestore.');
    FB._umumkan(null);
    return;
  }

  try {
    const [{ initializeApp }, authApi, fsApi] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);

    const app = initializeApp(cfg);
    FB._authApi = authApi;
    FB.auth = authApi.getAuth(app);

    // Cache offline: data tetap terbaca tanpa internet, tulisan diantre otomatis.
    try {
      FB.db = fsApi.initializeFirestore(app, {
        localCache: fsApi.persistentLocalCache({ tabManager: fsApi.persistentMultipleTabManager() }),
      });
    } catch {
      FB.db = fsApi.getFirestore(app);
    }

    FB.fs = fsApi;

    // Tunggu status login pertama diketahui sebelum halaman mengambil keputusan.
    await new Promise(res => {
      const lepas = authApi.onAuthStateChanged(FB.auth, user => {
        FB._umumkan(user);
        res();
      }, err => { console.warn('[AsaWatch] auth:', err); FB._umumkan(null); res(); });
      FB._lepasAuth = lepas;
    });
  } catch (e) {
    console.error('[AsaWatch] Gagal memuat Firebase, kembali ke mode lokal:', e);
    FB.aktif = false;
    FB._umumkan(null);
  }
})();

window.FB = FB;
