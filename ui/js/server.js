/**
 * server.js — klien API Laravel AsaWatch.
 *
 * Mengikuti kontrak yang sama dengan aplikasi Android (docs/rancangan-api-laravel.md),
 * supaya data dari webapp muncul di panel admin bersama data dari APK.
 *
 * Bentuk jawaban server:
 *   sukses -> { "data": ..., "meta": ... }
 *   galat  -> { "galat": { "kode": ..., "pesan": ..., "detail": ... } }
 */
(function () {
  'use strict';

  const CFG = window.ASAWATCH_SERVER || {};
  const BASIS = (CFG.basisUrl || '').replace(/\/+$/, '');
  const API = BASIS + '/api/v1';

  const LS_TOKEN = 'aw_token';
  const LS_USER = 'aw_user';

  /** Galat yang membawa kode dari server, supaya pemanggil bisa mencabang. */
  class GalatServer extends Error {
    constructor(pesan, kode, status, detail) {
      super(pesan);
      this.kode = kode || 'galat_server';
      this.status = status || 0;
      this.detail = detail || null;
    }
  }

  const Server = {
    GalatServer,
    basisUrl: BASIS,

    token() { return localStorage.getItem(LS_TOKEN); },
    masukSebagai() { try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; } },

    /* ============================================================
       PERMINTAAN DASAR
       ============================================================ */
    async _minta(metode, jalur, isi, opsi = {}) {
      const headers = { accept: 'application/json' };
      const token = this.token();
      if (token) headers.authorization = 'Bearer ' + token;

      let body;
      if (isi instanceof FormData) {
        body = isi;                                   // biarkan browser menyusun boundary
      } else if (isi !== undefined) {
        headers['content-type'] = 'application/json; charset=utf-8';
        body = JSON.stringify(isi);
      }

      let jawaban;
      try {
        jawaban = await fetch(API + jalur, { method: metode, headers, body });
      } catch (e) {
        // Permintaan yang diblokir CORS gagal persis seperti jaringan mati:
        // fetch menolak tanpa status, tanpa badan. Bedakan lewat navigator.onLine
        // supaya pesannya tidak menuduh koneksi pengguna.
        console.warn('[AsaWatch] Permintaan gagal:', metode, API + jalur,
          '— kalau internet normal, kemungkinan besar origin ' + location.origin +
          ' belum diizinkan di config/cors.php server.', e);

        throw new GalatServer(
          navigator.onLine
            ? 'Server tidak bisa dihubungi dari alamat ini. Kemungkinan izin CORS belum dibuka, atau server sedang mati.'
            : 'Tidak ada koneksi internet.',
          'jaringan_gagal', 0);
      }

      if (jawaban.status === 204) return null;

      let data = null;
      try { data = await jawaban.json(); } catch { /* jawaban tanpa badan */ }

      if (!jawaban.ok) {
        const g = data?.galat || {};
        // Token kedaluwarsa atau dicabut: bersihkan sesi lokal sekali saja.
        if (jawaban.status === 401 && !opsi.diamkan401) {
          localStorage.removeItem(LS_TOKEN);
          localStorage.removeItem(LS_USER);
        }
        throw new GalatServer(
          g.pesan || pesanBawaan(jawaban.status),
          g.kode, jawaban.status, g.detail);
      }

      return data?.data !== undefined ? data.data : data;
    },

    get(jalur, opsi) { return this._minta('GET', jalur, undefined, opsi); },
    post(jalur, isi, opsi) { return this._minta('POST', jalur, isi, opsi); },
    put(jalur, isi, opsi) { return this._minta('PUT', jalur, isi, opsi); },
    hapus(jalur, isi, opsi) { return this._minta('DELETE', jalur, isi, opsi); },

    /* ============================================================
       AUTENTIKASI
       ============================================================ */
    async masuk(email, kataSandi) {
      const data = await this.post('/auth/masuk', {
        email,
        kata_sandi: kataSandi,
        nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
      }, { diamkan401: true });

      this._simpanSesi(data);
      return data;
    },

    async daftar(nama, email, kataSandi) {
      const data = await this.post('/auth/daftar', {
        nama,
        email,
        kata_sandi: kataSandi,
        nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
      }, { diamkan401: true });

      // Sebagian server membalas token langsung saat daftar, sebagian tidak.
      if (data?.token) this._simpanSesi(data);
      return data;
    },

    _simpanSesi(data) {
      if (data?.token) localStorage.setItem(LS_TOKEN, data.token);
      const profil = data?.profil || data?.user || null;
      if (profil) {
        localStorage.setItem(LS_USER, JSON.stringify({
          nama: profil.nama || profil.name || 'Pengguna',
          email: profil.email || '—',
          id: profil.id ?? null,
        }));
      }
    },

    /**
     * Masuk dengan ID token dari Google Identity Services.
     * Server memverifikasi tanda tangannya ke kunci publik Google, lalu
     * membuat/menautkan akun dan membalas token Sanctum.
     */
    async masukGoogle(idToken) {
      const data = await this.post('/auth/google', {
        id_token: idToken,
        nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
      }, { diamkan401: true });

      this._simpanSesi(data);
      return data;
    },

    async keluar() {
      try { await this.post('/auth/keluar', {}, { diamkan401: true }); } catch { /* tetap keluar lokal */ }
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER);
    },

    /** Data user + profil; sekaligus memeriksa token masih berlaku. */
    saya() { return this.get('/auth/saya'); },

    /* ============================================================
       PROFIL
       ============================================================ */
    profil() { return this.get('/profil'); },
    simpanProfil(isi) { return this.put('/profil', isi); },

    /* ============================================================
       SESI MAKAN
       ============================================================ */

    /** Daftar sesi milik pengguna. Filter opsional: { sejak, status, limit }. */
    async daftarSesi(filter = {}) {
      const q = new URLSearchParams(
        Object.entries(filter).filter(([, v]) => v !== undefined && v !== null)).toString();
      const data = await this.get('/sesi' + (q ? '?' + q : ''));
      return Array.isArray(data) ? data : (data?.sesi || []);
    },

    /** Upsert satu sesi. Idempoten — id dibuat klien, kirim ulang aman. */
    kirimSesi(sesi) { return this.put('/sesi/' + sesi.id, badanSesi(sesi)); },

    hapusSesi(id) { return this.hapus('/sesi/' + id); },

    kirimFoto(sesiId, blob, namaBerkas = 'makanan.jpg') {
      const fd = new FormData();
      fd.append('foto', blob, namaBerkas);
      return this.post('/sesi/' + sesiId + '/foto', fd);
    },
  };

  /* ============================================================
     PENYUSUN BADAN SESI — bentuknya persis seperti kiriman APK
     ============================================================ */

  /** Jadwal titik ukur bawaan (detik terhadap t0), lihat docs/jadwal-titik-ukur.md. */
  const JADWAL = [-600, 0, 3600, 7200];

  function badanSesi(sesi) {
    return {
      waktu_foto: sesi.waktuFoto,
      t0: sesi.t0 ?? null,
      status: sesi.status,
      waktu_tidak_pasti: !!sesi.waktuTidakPasti,
      sesi_uji: !!sesi.sesiUji,
      sampel: sesi.sampel,
      hasil: sesi.hasil ?? null,
      diperbarui_pada: sesi.diperbaruiPada || sesi.waktuFoto,
    };
  }

  /** Empat titik kosong; yang tidak terisi tetap dikirim sebagai "terlewat". */
  function sampelKosong() {
    return JADWAL.map((detik, index) => ({
      index,
      detik_relatif_t0: detik,
      status: 'terlewat',
      dari_buffer: false,
      gula_darah: null,
      detak_jantung: null,
      sistolik: null,
      diastolik: null,
      spo2: null,
    }));
  }

  /**
   * Bungkus satu pengukuran lepas (tombol "Ukur Sekarang") menjadi sesi.
   * Nilai ditaruh di index 1 (momen t0); tiga titik lain tetap dikirim
   * sebagai "terlewat" karena kontraknya mewajibkan empat elemen.
   */
  function sesiDariPengukuran(metrik, waktu = Date.now()) {
    const iso = new Date(waktu).toISOString();
    const sampel = sampelKosong();
    sampel[1] = {
      ...sampel[1],
      status: 'terisi',
      gula_darah: metrik.gulaDarah ?? null,
      detak_jantung: metrik.detakJantung ?? null,
      sistolik: metrik.sistolik ?? null,
      diastolik: metrik.diastolik ?? null,
      spo2: metrik.spo2 ?? null,
    };

    return {
      id: uuid(),
      waktuFoto: iso,
      t0: iso,
      status: 'tidak_lengkap',      // hanya satu dari empat titik yang terisi
      waktuTidakPasti: false,
      sesiUji: CFG.tandaiSesiUji !== false,
      sampel,
      hasil: null,
      diperbaruiPada: iso,
    };
  }

  /** Sesi untuk catatan makanan: angka gizi terisi, titik ukur belum ada. */
  function sesiDariMakanan(gizi, waktu = Date.now()) {
    const iso = new Date(waktu).toISOString();
    return {
      id: uuid(),
      waktuFoto: iso,
      t0: null,
      status: 'draft',
      waktuTidakPasti: false,
      sesiUji: CFG.tandaiSesiUji !== false,
      sampel: sampelKosong().map(s => ({ ...s, status: 'menunggu' })),
      hasil: {
        indeks_glikemik_perkiraan: null,
        keyakinan: null,
        dikoreksi_user: true,           // angkanya diketik pengguna, bukan hasil analisis
        zat_tidak_lengkap: [],
        total: {
          kalori: gizi.kalori ?? null,
          karbohidrat: gizi.karbo ?? null,
          protein: gizi.protein ?? null,
          lemak: gizi.lemak ?? null,
          gula_total: gizi.gula ?? null,
          serat: null,
        },
        makanan: [],
      },
      diperbaruiPada: iso,
    };
  }

  /** Ratakan sesi dari server menjadi daftar pengukuran untuk tampilan. */
  function sampelDariSesi(daftarSesi) {
    const keluar = [];
    (daftarSesi || []).forEach(sesi => {
      const dasar = Date.parse(sesi.t0 || sesi.waktu_foto || 0) || 0;
      (sesi.sampel || []).forEach(s => {
        if (s.status !== 'terisi') return;
        const adaIsi = ['gula_darah', 'detak_jantung', 'sistolik', 'diastolik', 'spo2']
          .some(k => s[k] !== null && s[k] !== undefined);
        if (!adaIsi) return;

        keluar.push({
          id: sesi.id + ':' + s.index,
          sesiId: sesi.id,
          index: s.index,
          waktu: dasar + (s.detik_relatif_t0 || 0) * 1000,
          gulaDarah: s.gula_darah,
          detakJantung: s.detak_jantung,
          sistolik: s.sistolik,
          diastolik: s.diastolik,
          spo2: s.spo2,
          sesiUji: !!sesi.sesi_uji,
        });
      });
    });
    return keluar.sort((a, b) => a.waktu - b.waktu);
  }

  /** Catatan makanan terakhir dari daftar sesi (yang punya hasil gizi). */
  function makananDariSesi(daftarSesi) {
    const berhasil = (daftarSesi || [])
      .filter(s => s.hasil && s.hasil.total)
      .sort((a, b) => Date.parse(b.waktu_foto || 0) - Date.parse(a.waktu_foto || 0));
    if (!berhasil.length) return null;

    const s = berhasil[0], t = s.hasil.total;
    return {
      sesiId: s.id,
      waktu: Date.parse(s.waktu_foto || 0) || 0,
      kalori: t.kalori ?? 0,
      karbo: t.karbohidrat ?? 0,
      protein: t.protein ?? 0,
      lemak: t.lemak ?? 0,
      gula: t.gula_total ?? 0,
    };
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function pesanBawaan(status) {
    return {
      400: 'Permintaan tidak dipahami server',
      401: 'Sesi berakhir, silakan masuk lagi',
      403: 'Tidak diizinkan',
      404: 'Data tidak ditemukan',
      422: 'Data yang dikirim tidak valid',
      429: 'Terlalu sering mencoba, tunggu sebentar',
      500: 'Server sedang bermasalah',
    }[status] || ('Gagal (kode ' + status + ')');
  }

  Server.sesiDariPengukuran = sesiDariPengukuran;
  Server.sesiDariMakanan = sesiDariMakanan;
  Server.sampelDariSesi = sampelDariSesi;
  Server.makananDariSesi = makananDariSesi;
  Server.uuid = uuid;

  window.Server = Server;
})();
