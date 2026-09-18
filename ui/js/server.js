/**
 * server.js — klien API Laravel AsaWatch.
 *
 * Mengikuti kontrak yang sama dengan aplikasi Android
 * (asawatch/docs/rancangan-api-laravel.md), supaya data webapp muncul di panel
 * admin bersama data dari APK. Padanan auth_http_service.dart,
 * sesi_server_service.dart, dan profil_server_service.dart.
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
  const M = window.Model;

  const LS_TOKEN = 'aw_token';
  const LS_USER = 'aw_user';
  const BATAS_WAKTU_MS = 15000;

  /** Galat yang membawa kode dari server, supaya pemanggil bisa mencabang. */
  class GalatServer extends Error {
    constructor(pesan, kode, status, detail) {
      super(pesan);
      this.kode = kode || 'galat_server';
      this.status = status || 0;
      this.detail = detail || null;
    }
    get jaringan() { return this.status === 0; }
  }

  /** Pendengar 401 dari endpoint ber-token (PenjagaSesi) — dipasang shell. */
  let _onTokenDitolak = null;

  const Server = {
    GalatServer,
    basisUrl: BASIS,

    token() { return localStorage.getItem(LS_TOKEN); },
    masukSebagai() { try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; } },
    setOnTokenDitolak(cb) { _onTokenDitolak = cb; },

    /* ============================================================
       PERMINTAAN DASAR
       ============================================================ */
    async _minta(metode, jalur, isi, opsi = {}) {
      const headers = { accept: 'application/json' };
      const token = this.token();
      if (token) headers.authorization = 'Bearer ' + token;

      let body;
      if (isi instanceof FormData) body = isi;
      else if (isi !== undefined) {
        headers['content-type'] = 'application/json; charset=utf-8';
        body = JSON.stringify(isi);
      }

      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), opsi.batasWaktuMs || BATAS_WAKTU_MS);
      let jawaban;
      try {
        jawaban = await fetch((opsi.absolut ? '' : API) + jalur, { method: metode, headers, body, signal: ctl.signal });
      } catch (e) {
        clearTimeout(tm);
        if (e.name === 'AbortError') throw new GalatServer('Server tidak menjawab tepat waktu.', 'waktu_habis', 0);
        // Permintaan yang diblokir CORS gagal persis seperti jaringan mati.
        console.warn('[AsaWatch] Permintaan gagal:', metode, jalur,
          '— kalau internet normal, kemungkinan origin ' + location.origin + ' belum diizinkan di config/cors.php server.', e);
        throw new GalatServer(
          navigator.onLine
            ? 'Server tidak bisa dihubungi dari alamat ini. Kemungkinan izin CORS belum dibuka, atau server sedang mati.'
            : 'Tidak ada koneksi internet.',
          'jaringan_gagal', 0);
      }
      clearTimeout(tm);

      if (jawaban.status === 204) return null;
      let data = null;
      try { data = await jawaban.json(); } catch { /* tanpa badan */ }

      if (!jawaban.ok) {
        const g = data?.galat || {};
        // Token ditolak: bersihkan sesi lokal sekali saja dan beri tahu penjaga —
        // kecuali di endpoint masuk, tempat 401 berarti kata sandi salah.
        if (jawaban.status === 401 && !opsi.diamkan401) {
          localStorage.removeItem(LS_TOKEN);
          localStorage.removeItem(LS_USER);
          _onTokenDitolak?.();
        }
        throw new GalatServer(g.pesan || pesanBawaan(jawaban.status), g.kode, jawaban.status, g.detail);
      }
      if (opsi.mentah) return data;
      return data?.data !== undefined ? data.data : data;
    },

    get(jalur, opsi) { return this._minta('GET', jalur, undefined, opsi); },
    post(jalur, isi, opsi) { return this._minta('POST', jalur, isi, opsi); },
    put(jalur, isi, opsi) { return this._minta('PUT', jalur, isi, opsi); },
    hapus(jalur, isi, opsi) { return this._minta('DELETE', jalur, isi, opsi); },

    /* ============================================================
       AUTENTIKASI — HasilMasuk: kredensialSalah | tidakAdaJaringan |
       serverBermasalah | waktuHabis | emailSudahDipakai
       ============================================================ */

    /**
     * `galat.kode` dibaca SEBELUM status HTTP: kata sandi salah dijawab 422
     * validasi_gagal, bukan 401 — status saja akan menuduh server rusak.
     */
    _petakanGalatMasuk(e, { daftar = false } = {}) {
      if (!(e instanceof GalatServer)) return { jenis: 'serverBermasalah', pesan: 'Terjadi kesalahan. Coba lagi.', bisaDiulang: true };
      if (e.kode === 'waktu_habis') return { jenis: 'waktuHabis', pesan: 'Server tidak menjawab. Coba lagi sebentar lagi.', bisaDiulang: true };
      if (e.status === 0) return { jenis: 'tidakAdaJaringan', pesan: e.message, bisaDiulang: true };
      if (daftar && e.kode === 'validasi_gagal' && e.detail && e.detail.email) {
        return { jenis: 'emailSudahDipakai', pesan: 'Email ini sudah terdaftar. Masuk dengan email itu, atau pakai email lain.', bisaDiulang: false };
      }
      if (['tidak_terautentikasi', 'kredensial_salah', 'validasi_gagal'].includes(e.kode) || e.status === 401 || e.status === 422) {
        return {
          jenis: 'kredensialSalah', bisaDiulang: false,
          pesan: daftar ? (e.message || 'Data pendaftaran tidak valid.') : 'Email atau kata sandi salah. Periksa lagi, lalu coba masuk.',
        };
      }
      return { jenis: 'serverBermasalah', pesan: 'Server sedang bermasalah. Bukan kata sandi Anda — coba lagi nanti.', bisaDiulang: true };
    },

    async masuk(email, kataSandi) {
      try {
        const data = await this.post('/auth/masuk', {
          email, kata_sandi: kataSandi, nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
        }, { diamkan401: true });
        this._simpanSesi(data, email);
        return data;
      } catch (e) { throw Object.assign(e, { hasil: this._petakanGalatMasuk(e) }); }
    },

    /** Daftar langsung mengembalikan token — tidak ada langkah "sekarang masuk". */
    async daftar(nama, email, kataSandi) {
      try {
        const data = await this.post('/auth/daftar', {
          nama, email, kata_sandi: kataSandi, nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
        }, { diamkan401: true });
        if (data?.token) this._simpanSesi(data, email);
        return data;
      } catch (e) { throw Object.assign(e, { hasil: this._petakanGalatMasuk(e, { daftar: true }) }); }
    },

    /** Masuk dengan ID token Google; server yang memverifikasi ke kunci publik Google. */
    async masukGoogle(idToken) {
      try {
        const data = await this.post('/auth/google', {
          id_token: idToken, nama_perangkat: CFG.namaPerangkat || 'AsaWatch Web',
        }, { diamkan401: true });
        this._simpanSesi(data, null);
        return data;
      } catch (e) { throw Object.assign(e, { hasil: this._petakanGalatMasuk(e) }); }
    },

    _simpanSesi(data, emailDikirim) {
      if (data?.token) localStorage.setItem(LS_TOKEN, data.token);
      const profil = data?.profil || data?.user || null;
      // `masuk` tidak mengembalikan email; alamat yang baru diketik adalah satu-
      // satunya yang pasti benar — token diterbitkan untuk alamat itu.
      localStorage.setItem(LS_USER, JSON.stringify({
        nama: profil?.nama || profil?.name || 'Pengguna',
        email: emailDikirim || profil?.email || '—',
        id: profil?.id ?? null,
      }));
    },

    /** Mencabut token di server dulu, tapi tetap berhasil tanpa sinyal. */
    async keluar() {
      try { await this.post('/auth/keluar', {}, { diamkan401: true }); } catch { /* tetap keluar lokal */ }
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER);
    },

    /** Data user + profil; sekaligus memeriksa token masih berlaku. */
    saya() { return this.get('/auth/saya'); },

    /* ============================================================
       PROFIL (§5.1) — semua field boleh null
       ============================================================ */
    async profil() { return profilDariJson(await this.get('/profil')); },
    async simpanProfil(p) { return profilDariJson(await this.put('/profil', profilKeJson(p))); },

    /* ============================================================
       SESI MAKAN (§5.2)
       ============================================================ */

    /**
     * Semua sesi milik pengguna, mengikuti `meta.next_cursor`. Gagal → null,
     * bukan [] — "tidak tahu" tidak boleh terbaca sebagai "tidak ada".
     */
    async daftarSesi() {
      const semua = [];
      let kursor = null;
      try {
        for (let halaman = 0; halaman < 40; halaman++) {
          const isi = await this.get('/sesi' + (kursor ? '?cursor=' + encodeURIComponent(kursor) : ''), { mentah: true });
          const data = Array.isArray(isi?.data) ? isi.data : (Array.isArray(isi) ? isi : null);
          if (!data) return null;
          for (const baris of data) {
            const s = sesiDariJson(baris);
            if (s) semua.push({ sesi: s, urlFoto: urlFotoDariJson(baris) });
          }
          const berikut = isi?.meta?.next_cursor;
          if (typeof berikut !== 'string' || !berikut || berikut === kursor) break;
          kursor = berikut;
        }
        return semua;
      } catch (e) {
        if (e.status !== 401) console.warn('[Server] Gagal mengambil sesi:', e.message);
        return null;
      }
    },

    /** Upsert satu sesi. Idempoten — id dibuat klien, kirim ulang aman. */
    async kirimSesi(sesi) {
      try {
        await this.put('/sesi/' + sesi.id, badanSesi(sesi));
        return true;
      } catch (e) {
        if (e.status === 401) throw e;
        // Bukan diam-diam: log dengan status dan kepala badan. Tetap bukan layar.
        console.warn(`[Server] PUT /sesi/${sesi.id} ditolak ${e.status} ${e.kode}: ${String(e.message).slice(0, 200)}`);
        return false;
      }
    },

    /** Soft delete. 404 dihitung sukses: pertanyaannya "masih ada?", bukan "terhapus?". */
    async hapusSesi(id) {
      try { await this.hapus('/sesi/' + id); return true; }
      catch (e) { if (e.status === 404) return true; if (e.status === 401) throw e; return false; }
    },

    async kirimFoto(sesiId, blob, namaBerkas = 'makanan.jpg') {
      const fd = new FormData();
      fd.append('foto', blob, namaBerkas);
      try { await this.post('/sesi/' + sesiId + '/foto', fd); return true; }
      catch (e) { if (e.status === 401) throw e; console.warn('[Server] Foto gagal diunggah:', e.message); return false; }
    },

    /**
     * Unduh foto lewat URL bertanda tangan — tetap butuh Bearer (signed berada di
     * dalam grup auth:sanctum). 403 = tanda tangan terikat host lain; biarkan kosong.
     */
    async unduhFoto(url) {
      try {
        const r = await fetch(url, { headers: { authorization: 'Bearer ' + this.token() } });
        if (!r.ok) return null;
        return await r.blob();
      } catch { return null; }
    },

    /**
     * Minta analisis gizi (§6). POST lalu poll GET dengan backoff 2→4→8 s
     * sekitar satu menit; `gagal` adalah status, bukan HTTP 500. Pemanggil
     * melihat satu panggilan yang mengembalikan HasilDeteksi atau null.
     */
    async mintaAnalisis(sesiId) {
      const jalur = '/sesi/' + sesiId + '/analisis';
      try {
        await this.post(jalur, {}, { mentah: true });
      } catch (e) {
        if (e.status === 401) throw e;
        return null;
      }
      for (const jeda of [2000, 4000, 8000, 8000, 8000, 8000, 8000, 8000]) {
        await new Promise(r => setTimeout(r, jeda));
        let isi;
        try { isi = await this.get(jalur, { mentah: true }); } catch (e) { if (e.status === 401) throw e; return null; }
        const status = isi?.status ?? isi?.data?.status;
        if (status === 'selesai') return hasilDariJson(isi.hasil ?? isi.data?.hasil);
        if (status === 'gagal') return null;
      }
      return null; // masih antre setelah semua jeda habis
    },

    /* ============================================================
       KALIBRASI (§5.3) — riwayat, bukan satu baris yang ditimpa
       ============================================================ */
    async kirimKalibrasi(k) {
      const p = k.putaran[0];
      try {
        await this.post('/kalibrasi', {
          waktu: k.waktu, sisi: k.sisi,
          sistolik_referensi: p.sistolikReferensi, diastolik_referensi: p.diastolikReferensi,
          sistolik_jam: p.sistolikJam, diastolik_jam: p.diastolikJam,
        });
        return true;
      } catch (e) { if (e.status === 401) throw e; return false; }
    },
  };

  /* ============================================================
     JSON ⇄ model (§5.2)
     ============================================================ */
  const _waktu = (w) => new Date(w).toISOString();
  const _nutrisiKeJson = (n) => Object.fromEntries(M.ZatGizi.map(z => [z.kawat, n?.[z.kunci] ?? null]));
  const _nutrisiDariJson = (j) => Object.fromEntries(M.ZatGizi.map(z => [z.kunci, _num(j?.[z.kawat])]));
  const _num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null));
  const _int = (v) => { const n = _num(v); return n == null ? null : Math.round(n); };

  function badanSesi(sesi) {
    return {
      waktu_foto: _waktu(sesi.waktuFoto),
      t0: sesi.t0 ? _waktu(sesi.t0) : null,
      status: M.statusKeKawat(sesi.status),
      waktu_tidak_pasti: !!sesi.waktuTidakPasti,
      sesi_uji: !!sesi.sesiUji,
      sampel: sesi.sampel.map(s => ({
        index: s.index,
        detik_relatif_t0: s.detikRelatifT0,
        status: s.status,
        dari_buffer: !!s.dariBuffer,
        gula_darah: s.gulaDarah ?? null,
        detak_jantung: s.detakJantung ?? null,
        sistolik: s.sistolik ?? null,
        diastolik: s.diastolik ?? null,
        spo2: s.spo2 ?? null,
      })),
      hasil: sesi.hasil ? hasilKeJson(sesi.hasil) : null,
      // Waktu perubahan terakhir (stempel repo), BUKAN waktu pengiriman.
      diperbarui_pada: _waktu(sesi.diperbaruiPada || sesi.waktuFoto),
    };
  }

  function hasilKeJson(h) {
    return {
      indeks_glikemik_perkiraan: h.indeksGlikemikPerkiraan ?? null,
      keyakinan: h.keyakinan ?? null,
      dikoreksi_user: !!h.dikoreksiUser,
      zat_tidak_lengkap: (h.zatTidakLengkap || []).map(k => M.ZatGizi.find(z => z.kunci === k)?.kawat || k),
      total: _nutrisiKeJson(h.total),
      makanan: (h.makanan || []).map((m, i) => ({
        urutan: i, nama: m.nama, porsi: m.porsi, estimasi_gram: m.estimasiGram, nutrisi: _nutrisiKeJson(m.nutrisi),
      })),
    };
  }

  function hasilDariJson(j) {
    if (!j || typeof j !== 'object' || !j.total) return null;
    const makanan = Array.isArray(j.makanan) ? j.makanan
      .filter(m => m && typeof m === 'object')
      .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
      .map(m => ({ nama: String(m.nama || 'Makanan'), porsi: String(m.porsi || ''), estimasiGram: _num(m.estimasi_gram) ?? 0, nutrisi: _nutrisiDariJson(m.nutrisi) }))
      : [];
    return {
      makanan,
      // Total disimpan apa adanya, tidak dijumlahkan ulang dari makanan (§5.2).
      total: _nutrisiDariJson(j.total),
      indeksGlikemikPerkiraan: typeof j.indeks_glikemik_perkiraan === 'string' ? j.indeks_glikemik_perkiraan : null,
      keyakinan: _num(j.keyakinan),
      zatTidakLengkap: (Array.isArray(j.zat_tidak_lengkap) ? j.zat_tidak_lengkap : []).map(k => M.ZatGizi.dariKawat(k)?.kunci).filter(Boolean),
      dikoreksiUser: j.dikoreksi_user === true,
    };
  }

  /** Satu sesi dari JSON §5.2, atau null bila bentuknya tidak bisa dipercaya. */
  function sesiDariJson(d) {
    if (!d || typeof d.id !== 'string' || !d.id) return null;
    const waktuFoto = Date.parse(d.waktu_foto || '');
    if (Number.isNaN(waktuFoto)) return null;
    const status = M.statusDariKawat(d.status);
    if (!status) return null;

    const sampel = [];
    for (const s of Array.isArray(d.sampel) ? d.sampel : []) {
      if (!s || typeof s !== 'object') continue;
      if (!Number.isInteger(s.index) || !Number.isInteger(s.detik_relatif_t0)) continue;
      if (!['menunggu', 'terisi', 'terlewat'].includes(s.status)) continue;
      sampel.push({
        index: s.index, detikRelatifT0: s.detik_relatif_t0, status: s.status, dariBuffer: s.dari_buffer === true,
        gulaDarah: _int(s.gula_darah), detakJantung: _int(s.detak_jantung),
        sistolik: _int(s.sistolik), diastolik: _int(s.diastolik), spo2: _int(s.spo2),
      });
    }
    sampel.sort((a, b) => a.index - b.index);
    // §5.2 menjanjikan selalu empat elemen; sesi tanpa sampel dilewati, bukan dipaksakan.
    if (!sampel.length) return null;

    const t0 = d.t0 ? Date.parse(d.t0) : NaN;
    // Offset baseline diturunkan di sini, bukan dipercaya dari kawat: draft
    // diunggah sebelum t0 ada, dan server membekukan sampel terisi.
    if (!Number.isNaN(t0) && sampel[0].index === 0) {
      sampel[0] = { ...sampel[0], detikRelatifT0: Math.round((waktuFoto - t0) / 1000) };
    }
    return {
      id: d.id,
      fotoAda: false,   // berkasnya ada di perangkat yang memotret; diunduh terpisah
      waktuFoto: new Date(waktuFoto).toISOString(),
      t0: Number.isNaN(t0) ? null : new Date(t0).toISOString(),
      status, sampel,
      hasil: hasilDariJson(d.hasil),
      waktuTidakPasti: d.waktu_tidak_pasti === true,
      sesiUji: d.sesi_uji === true,
      diperbaruiPada: d.diperbarui_pada && !Number.isNaN(Date.parse(d.diperbarui_pada)) ? new Date(d.diperbarui_pada).toISOString() : null,
      dihapusPada: null,
    };
  }

  function urlFotoDariJson(d) {
    const url = d?.foto?.url;
    return typeof url === 'string' && url ? url : null;
  }

  /* ---------- profil (§5.1) ---------- */
  const _jkKeApp = (v) => ({ 'laki-laki': 'Laki-laki', perempuan: 'Perempuan' })[v] || '';
  const _jkKeServer = (v) => ({ 'Laki-laki': 'laki-laki', Perempuan: 'perempuan' })[v] || null;
  const _atauNull = (s) => (s === undefined || s === null || String(s).trim() === '' ? null : s);

  function profilDariJson(d) {
    if (!d) return null;
    return {
      nama: d.nama || '', tanggalLahir: d.tanggal_lahir || '', jenisKelamin: _jkKeApp(d.jenis_kelamin),
      golonganDarah: d.golongan_darah || '', tinggi: d.tinggi_cm == null ? '' : String(d.tinggi_cm),
      berat: d.berat_kg == null ? '' : String(d.berat_kg),
      diperbaruiPada: d.diperbarui_pada || null,
    };
  }
  /** String kosong dikirim sebagai null: "" gagal validator tanggal padahal artinya "belum diisi". */
  function profilKeJson(p) {
    return {
      nama: _atauNull(p.nama), tanggal_lahir: _atauNull(p.tanggalLahir), jenis_kelamin: _jkKeServer(p.jenisKelamin),
      golongan_darah: _atauNull(p.golonganDarah), tinggi_cm: _num(p.tinggi), berat_kg: _num(p.berat),
    };
  }

  function pesanBawaan(status) {
    return {
      400: 'Permintaan tidak dipahami server', 401: 'Sesi berakhir, silakan masuk lagi', 403: 'Tidak diizinkan',
      404: 'Data tidak ditemukan', 409: 'Versi data di server lebih baru', 422: 'Data yang dikirim tidak valid',
      429: 'Terlalu sering mencoba, tunggu sebentar', 500: 'Server sedang bermasalah',
    }[status] || ('Gagal (kode ' + status + ')');
  }

  Server.badanSesi = badanSesi;
  Server.sesiDariJson = sesiDariJson;
  Server.hasilDariJson = hasilDariJson;
  Server.urlFotoDariJson = urlFotoDariJson;
  window.Server = Server;
})();
