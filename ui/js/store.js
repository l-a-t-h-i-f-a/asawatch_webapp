/**
 * store.js — lapisan data untuk halaman-halaman UI.
 *
 * Sumber kebenaran ada di server Laravel (API yang sama dengan aplikasi
 * Android), sehingga data webapp muncul di panel admin bersama data APK.
 * Salinan terakhir disimpan di browser supaya halaman tetap terbaca saat
 * jaringan mati, dan kiriman yang gagal diantre untuk dicoba lagi.
 */
(function () {
  'use strict';

  const LS = {
    user: 'aw_user',
    token: 'aw_token',
    settings: 'aw_settings',
    goals: 'aw_goals',
    foto: 'aw_food_foto',
    device: 'aw_device',
    lastSync: 'aw_last_sync',
    cache: 'aw_cache_sesi',
    antrean: 'aw_antrean_sesi',
  };

  const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Cache penuh:', e); } };

  /* ---------- ambang normal tiap metrik ---------- */
  const METRICS = {
    detak: { key: 'detakJantung', label: 'Detak Jantung', unit: 'bpm', lo: 60, hi: 100, tone: 'red', icon: 'i-heart', color: '#e5484d', page: 'detak-jantung.html' },
    gula: { key: 'gulaDarah', label: 'Gula Darah', unit: 'mg/dL', lo: 70, hi: 140, tone: 'green', icon: 'i-drop', color: '#2fa360', page: 'gula-darah.html' },
    tensi: { key: 'sistolik', label: 'Tensi', unit: 'mmHg', lo: 90, hi: 140, tone: 'blue', icon: 'i-gauge', color: '#3d82f6', page: 'tensi.html' },
    spo2: { key: 'spo2', label: 'SpO2', unit: '%', lo: 95, hi: 100, tone: 'violet', icon: 'i-activity', color: '#8b6cf0', page: '' },
  };

  const DEFAULT_GOALS = [
    { id: 'langkah', nama: 'Langkah Harian', target: '8.000 langkah', progres: 75, icon: 'i-steps', tone: 'green' },
    { id: 'berat', nama: 'Berat Badan', target: '70 kg', progres: 65, icon: 'i-scale', tone: 'blue' },
    { id: 'air', nama: 'Minum Air', target: '2,5 Liter / hari', progres: 60, icon: 'i-water', tone: 'cyan' },
    { id: 'tidur', nama: 'Tidur', target: '7–8 jam / malam', progres: 70, icon: 'i-moon', tone: 'violet' },
    { id: 'jantung', nama: 'Detak Jantung', target: '60–100 bpm', progres: 100, icon: 'i-heart', tone: 'red' },
  ];

  const DEFAULT_SETTINGS = { notif: true, monitor: true, simulasi: false, pengingatMenit: 60 };

  const Sv = () => window.Server;
  let muatan = null;          // janji pemuatan sesi yang sedang berjalan
  let daring = true;          // hasil percobaan terakhir ke server

  const Store = {
    METRICS,

    async ready() { /* tidak ada yang perlu disiapkan; disediakan agar pemanggil lama aman */ },

    /** Sumber data yang sedang dipakai — ditampilkan di halaman Pengaturan. */
    sumber() {
      if (!Sv()?.token()) return 'belum-masuk';
      return daring ? 'server' : 'offline';
    },

    /* ============================================================
       SESI — pengambilan & cache
       ============================================================ */

    /** Ambil sesi dari server; jatuh ke salinan lokal bila gagal. */
    async muatSesi(paksa = false) {
      if (muatan && !paksa) return muatan;
      muatan = (async () => {
        try {
          const sesi = await Sv().daftarSesi({ limit: 100 });
          daring = true;
          writeJSON(LS.cache, sesi);
          localStorage.setItem(LS.lastSync, String(Date.now()));
          return sesi;
        } catch (e) {
          daring = false;
          if (e.status !== 401) console.warn('Gagal memuat sesi:', e.message);
          return readJSON(LS.cache, []);
        }
      })();
      return muatan;
    },

    /** Semua pengukuran terisi, terurut dari paling lama. */
    async samples() {
      const sesi = await Store.muatSesi();
      return Sv().sampelDariSesi(sesi);
    },

    async samplesOf(metricId) {
      const m = METRICS[metricId];
      const semua = await Store.samples();
      return semua.filter(s => s[m.key] !== null && s[m.key] !== undefined && s[m.key] !== 0);
    },

    /** Simpan satu hasil pengukuran sebagai sesi baru di server. */
    async addSample(metrik) {
      const sesi = Sv().sesiDariPengukuran(metrik);
      const tersimpan = await Store._kirimAtauAntre(sesi);
      Store._tambahKeCache(sesi);
      return tersimpan ? { ...metrik, sesiId: sesi.id } : null;
    },

    /**
     * Kirim sesi; bila jaringan gagal, antre untuk dicoba lagi.
     * Galat selain jaringan (401/422) dilempar supaya halaman bisa bereaksi.
     */
    async _kirimAtauAntre(sesi) {
      try {
        await Sv().kirimSesi(sesi);
        daring = true;
        localStorage.setItem(LS.lastSync, String(Date.now()));
        return true;
      } catch (e) {
        if (e.status === 0 || e.status >= 500) {
          daring = false;
          const antrean = readJSON(LS.antrean, []);
          antrean.push(sesi);
          writeJSON(LS.antrean, antrean);
          return false;
        }
        throw e;
      }
    },

    /** Masukkan sesi baru ke salinan lokal supaya tampilan langsung berubah. */
    _tambahKeCache(sesi) {
      const cache = readJSON(LS.cache, []);
      cache.unshift({
        id: sesi.id,
        waktu_foto: sesi.waktuFoto,
        t0: sesi.t0,
        status: sesi.status,
        sesi_uji: sesi.sesiUji,
        sampel: sesi.sampel,
        hasil: sesi.hasil,
      });
      writeJSON(LS.cache, cache.slice(0, 100));
      muatan = Promise.resolve(readJSON(LS.cache, []));
    },

    /** Jumlah sesi yang menunggu dikirim ulang. */
    jumlahAntrean() { return readJSON(LS.antrean, []).length; },

    /** Coba kirim ulang semua sesi yang tertahan. */
    async kirimAntrean() {
      const antrean = readJSON(LS.antrean, []);
      if (!antrean.length) return { terkirim: 0, sisa: 0 };

      const sisa = [];
      let terkirim = 0;
      for (const sesi of antrean) {
        try { await Sv().kirimSesi(sesi); terkirim++; }
        catch { sisa.push(sesi); }
      }
      writeJSON(LS.antrean, sisa);
      daring = sisa.length === 0;
      if (terkirim) localStorage.setItem(LS.lastSync, String(Date.now()));
      return { terkirim, sisa: sisa.length };
    },

    /** Buang salinan lokal — data di server tidak disentuh. */
    async bersihkanCacheLokal() {
      const n = readJSON(LS.cache, []).length;
      localStorage.removeItem(LS.cache);
      localStorage.removeItem(LS.antrean);
      localStorage.removeItem(LS.foto);
      muatan = null;
      return n;
    },

    stats(samples, metricId) {
      const m = METRICS[metricId];
      const vals = samples.map(s => s[m.key]).filter(v => typeof v === 'number');
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return { last: vals[vals.length - 1], max: Math.max(...vals), min: Math.min(...vals), avg: sum / vals.length, n: vals.length };
    },

    /* ============================================================
       CATATAN MAKANAN
       ============================================================ */
    async foodTerakhir() {
      const sesi = await Store.muatSesi();
      const f = Sv().makananDariSesi(sesi);
      const foto = localStorage.getItem(LS.foto) || null;
      return f ? { ...f, foto } : null;
    },

    /** Catatan gizi dikirim sebagai sesi ber-`hasil`; fotonya menyusul. */
    async simpanFood(gizi, fotoDataUrl) {
      const sesi = Sv().sesiDariMakanan(gizi);
      const tersimpan = await Store._kirimAtauAntre(sesi);
      Store._tambahKeCache(sesi);

      if (fotoDataUrl) {
        try { localStorage.setItem(LS.foto, fotoDataUrl); } catch { }
        if (tersimpan) {
          try {
            const blob = await (await fetch(fotoDataUrl)).blob();
            await Sv().kirimFoto(sesi.id, blob);
          } catch (e) { console.warn('Foto gagal diunggah:', e.message); }
        }
      }
      return tersimpan ? { ...gizi, sesiId: sesi.id } : null;
    },

    /* ============================================================
       TUJUAN KESEHATAN (masih lokal — endpoint target-harian belum final)
       ============================================================ */
    async muatTujuan() { return readJSON(LS.goals, DEFAULT_GOALS); },
    goals() { return readJSON(LS.goals, DEFAULT_GOALS); },
    async tambahTujuan(g) {
      const baru = { icon: 'i-target', tone: 'green', progres: 0, ...g, id: g.id || ('g' + Date.now()) };
      writeJSON(LS.goals, [...Store.goals(), baru]);
      return baru;
    },
    async hapusTujuan(id) { writeJSON(LS.goals, Store.goals().filter(g => g.id !== id)); },

    /* ============================================================
       IDENTITAS & PREFERENSI
       ============================================================ */
    user() { return readJSON(LS.user, null) || { nama: 'Pengguna', email: '—' }; },

    /** Perbarui nama di server (email tidak bisa diubah lewat endpoint profil). */
    async setUser(u) {
      writeJSON(LS.user, u);
      try { await Sv().simpanProfil({ nama: u.nama }); }
      catch (e) { console.warn('Profil gagal disimpan ke server:', e.message); }
    },

    /** Segarkan identitas dari server; sekaligus memastikan token masih sah. */
    async segarkanIdentitas() {
      try {
        const data = await Sv().saya();
        const nama = data?.nama || data?.profil?.nama || data?.user?.nama;
        const email = data?.email || data?.user?.email;
        if (nama || email) {
          writeJSON(LS.user, { ...Store.user(), ...(nama && { nama }), ...(email && { email }) });
        }
        daring = true;
        return true;
      } catch (e) {
        if (e.status === 401) return false;
        daring = false;
        return true;                       // offline bukan berarti sesi berakhir
      }
    },

    async logout() {
      try { await Sv().keluar(); } catch { }
      localStorage.removeItem(LS.token);
      localStorage.removeItem(LS.user);
      localStorage.removeItem(LS.cache);
      muatan = null;
    },

    settings() { return { ...DEFAULT_SETTINGS, ...readJSON(LS.settings, {}) }; },
    setSetting(k, v) { const s = Store.settings(); s[k] = v; writeJSON(LS.settings, s); },

    device() { return readJSON(LS.device, { nama: 'AsaWatch X1', baterai: null, terhubung: false }); },
    setDevice(d) { writeJSON(LS.device, { ...Store.device(), ...d }); },

    lastSync() { const t = Number(localStorage.getItem(LS.lastSync)); return t ? new Date(t) : null; },
    tandaiSync() { localStorage.setItem(LS.lastSync, String(Date.now())); },
  };

  /* ============================================================
     Helper tampilan bersama
     ============================================================ */
  const UI = {
    $: (id) => document.getElementById(id),
    ic: (id) => `<svg><use href="#${id}"/></svg>`,

    toast(msg) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), 3000);
    },

    tanggal(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    },
    jam(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    },
    angka(n, digit = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit });
    },

    status(v, m) {
      if (v === null || v === undefined) return { teks: '—', kelas: '' };
      if (v < m.lo) return { teks: 'Rendah', kelas: 'warn' };
      if (v > m.hi) return { teks: 'Tinggi', kelas: 'danger' };
      return { teks: 'Normal', kelas: 'ok' };
    },

    normal(s) {
      return Object.values(METRICS).every(m => {
        const v = s[m.key];
        return !v || (v >= m.lo && v <= m.hi);
      });
    },

    identitas() {
      const u = Store.user();
      const inisial = (u.nama || 'P').charAt(0).toUpperCase();
      document.querySelectorAll('[data-user="nama"]').forEach(e => e.textContent = u.nama || 'Pengguna');
      document.querySelectorAll('[data-user="email"]').forEach(e => e.textContent = u.email || '—');
      document.querySelectorAll('[data-user="inisial"]').forEach(e => e.textContent = inisial);
      const av = document.getElementById('avatar'); if (av) av.textContent = inisial;
      const tn = document.getElementById('topName'); if (tn) tn.textContent = u.nama || 'Pengguna';
    },
  };

  window.Store = Store;
  window.UI = UI;
})();
