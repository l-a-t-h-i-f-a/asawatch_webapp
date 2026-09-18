/**
 * db.js — penyimpanan lokal (IndexedDB). Padanan lapisan repository + drift di
 * aplikasi Flutter: semua tersimpan lokal dulu, server menyusul.
 *
 * Store:
 *   sesi       key id      — sesi makan; nisan = baris dengan dihapusPada terisi
 *   foto       key sesiId  — Blob foto makanan
 *   entri_jam  autoinc     — kotak masuk mentah jam (§6 protokol); diproses = 0/1
 *   anchor     key bootId  — jangkar waktu jam (milik perangkat keras)
 *   kalibrasi  key waktu   — riwayat kalibrasi tensi (milik orang)
 *   meta       key kunci   — seqTerakhir, bootIdTerakhir, dst.
 */
(function () {
  'use strict';

  const NAMA = 'asawatch';
  const VERSI = 1;
  let _db = null;

  function buka() {
    if (_db) return Promise.resolve(_db);
    return new Promise((selesai, gagal) => {
      if (!('indexedDB' in window)) return gagal(new Error('Browser ini tidak mendukung IndexedDB.'));
      const req = indexedDB.open(NAMA, VERSI);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('sesi')) d.createObjectStore('sesi', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('foto')) d.createObjectStore('foto', { keyPath: 'sesiId' });
        if (!d.objectStoreNames.contains('entri_jam')) {
          const s = d.createObjectStore('entri_jam', { keyPath: 'no', autoIncrement: true });
          s.createIndex('diproses', 'diproses');
        }
        if (!d.objectStoreNames.contains('anchor')) d.createObjectStore('anchor', { keyPath: 'bootId' });
        if (!d.objectStoreNames.contains('kalibrasi')) d.createObjectStore('kalibrasi', { keyPath: 'waktu' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'kunci' });
      };
      req.onsuccess = () => { _db = req.result; _db.onversionchange = () => { _db.close(); _db = null; }; selesai(_db); };
      req.onerror = () => gagal(req.error || new Error('Basis data gagal dibuka.'));
      req.onblocked = () => gagal(new Error('Basis data terkunci oleh tab lain.'));
    });
  }

  function _tx(store, mode, kerja) {
    return buka().then(d => new Promise((selesai, gagal) => {
      const tx = d.transaction(store, mode);
      const hasil = kerja(Array.isArray(store) ? store.map(s => tx.objectStore(s)) : tx.objectStore(store));
      tx.oncomplete = () => selesai(hasil && hasil._nilai !== undefined ? hasil._nilai : hasil);
      tx.onerror = () => gagal(tx.error);
      tx.onabort = () => gagal(tx.error || new Error('Transaksi dibatalkan.'));
    }));
  }
  const _req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

  const DB = {
    buka,

    /* ---------- sesi ---------- */

    /** Semua sesi yang belum dinisankan. Nisan disaring di sini, bukan di pemanggil. */
    async muatSemuaSesi() {
      const semua = await _tx('sesi', 'readonly', s => _req(s.getAll()));
      return semua.filter(x => !x.dihapusPada);
    },

    async muatSesi(id) {
      const s = await _tx('sesi', 'readonly', st => _req(st.get(id)));
      return s && !s.dihapusPada ? s : null;
    },

    /** Nisan yang belum dikirim ke server (id + dihapusPada). */
    async muatNisan() {
      const semua = await _tx('sesi', 'readonly', s => _req(s.getAll()));
      return semua.filter(x => x.dihapusPada);
    },

    /**
     * Simpan sesi dan STEMPEL diperbaruiPada di sini, bukan di pemanggil;
     * mengembalikan sesi yang tersimpan supaya pemanggil memakai stempelnya
     * (aturan 409 konflik_versi).
     */
    async simpanSesi(sesi, { stempel = true } = {}) {
      const tersimpan = stempel ? { ...sesi, diperbaruiPada: new Date().toISOString() } : { ...sesi };
      await _tx('sesi', 'readwrite', s => s.put(tersimpan));
      return tersimpan;
    },

    /** Nisankan: anak (foto) dibuang, yang tersisa id + dihapusPada. */
    async nisankanSesi(id) {
      const kapan = new Date().toISOString();
      await _tx(['sesi', 'foto'], 'readwrite', ([s, f]) => {
        s.put({ id, dihapusPada: kapan, status: 'dibatalkan', sampel: [] });
        f.delete(id);
      });
      return kapan;
    },

    async hapusSesi(id) {
      await _tx(['sesi', 'foto'], 'readwrite', ([s, f]) => { s.delete(id); f.delete(id); });
    },

    async hapusSemuaSesi() {
      await _tx(['sesi', 'foto'], 'readwrite', ([s, f]) => { s.clear(); f.clear(); });
    },

    /* ---------- foto ---------- */
    simpanFoto(sesiId, blob) { return _tx('foto', 'readwrite', s => s.put({ sesiId, blob })); },
    async muatFoto(sesiId) { const r = await _tx('foto', 'readonly', s => _req(s.get(sesiId))); return r?.blob || null; },
    hapusFoto(sesiId) { return _tx('foto', 'readwrite', s => s.delete(sesiId)); },
    async daftarFoto() { return _tx('foto', 'readonly', s => _req(s.getAllKeys())); },

    /* ---------- kotak masuk jam (§6) ---------- */
    simpanEntriJam(entri) {
      return _tx('entri_jam', 'readwrite', s => _req(s.add({ ...entri, diproses: 0, diterimaPada: Date.now() })));
    },
    tandaiEntriDiproses(no) {
      return _tx('entri_jam', 'readwrite', s => {
        const r = s.get(no);
        r.onsuccess = () => { if (r.result) s.put({ ...r.result, diproses: 1 }); };
      });
    },
    async entriBelumDiproses() {
      return _tx('entri_jam', 'readonly', s => _req(s.index('diproses').getAll(0)));
    },
    hapusSemuaEntriJam() { return _tx('entri_jam', 'readwrite', s => s.clear()); },

    /* ---------- anchor (§4.2) — boleh lebih dari satu per boot ---------- */
    simpanAnchor(a) { return _tx('anchor', 'readwrite', s => s.put(a)); },
    async muatAnchor(bootId) { return _tx('anchor', 'readonly', s => _req(s.get(bootId))); },

    /* ---------- kalibrasi ---------- */
    simpanKalibrasi(k) { return _tx('kalibrasi', 'readwrite', s => s.put(k)); },
    async daftarKalibrasi() {
      const semua = await _tx('kalibrasi', 'readonly', s => _req(s.getAll()));
      return semua.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
    },
    hapusSemuaKalibrasi() { return _tx('kalibrasi', 'readwrite', s => s.clear()); },

    /* ---------- meta ---------- */
    async meta(kunci, bawaan = null) { const r = await _tx('meta', 'readonly', s => _req(s.get(kunci))); return r ? r.nilai : bawaan; },
    setMeta(kunci, nilai) { return _tx('meta', 'readwrite', s => s.put({ kunci, nilai })); },
  };

  window.DB = DB;
})();
