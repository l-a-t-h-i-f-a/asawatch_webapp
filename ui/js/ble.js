/**
 * ble.js — lapisan jam tangan: JamAsli (Web Bluetooth) dan JamPalsu, satu
 * antarmuka. Padanan BleService / BleAsliService / FakeBleService di Flutter.
 *
 * Antarmuka (docs/rancangan-ui-sesi-makan.md §12.5):
 *   event  'status'               StatusPerangkat
 *          'sampel'               { sesiId, sampel }   (sesiId nol = UKUR_SEKARANG)
 *          'selesaiMakanDitekan'  { sesiId, t0, waktuTidakPasti }
 *          'kemajuanUkur'         { sedangMengukur, persen, sisaDetik, macet }
 *          'tahap'                'menyambung' | 'menyandingkan' | 'menyiapkan'
 *          'galat'                { pesan }
 *   method pindai() → {id,nama} | null, sambungkan(id) → HasilSambung,
 *          sambungUlangSenyap(), putuskan(), lupakanPerangkat(),
 *          siapkanSesi, mulaiSesi, mintaUkur, armTitik, batalkanSesi,
 *          ukurSekarang, jamSedangMengukur, kirimKalibrasi, sinkronkan.
 *
 * Keterbatasan web yang disebut apa adanya: bonding milik browser (tidak ada
 * createBond), MTU tidak bisa diminta (paket kependekan TIDAK di-ack, §6),
 * dan tidak ada proses latar — reconnect hanya selagi tab hidup.
 */
(function () {
  'use strict';

  const P = window.Protokol;
  const M = window.Model;
  const { ProtokolJam, Opcode, JenisPeristiwa, KodeGalatJam, PesanUkur, GalatJam } = P;

  const LS_ID = 'aw_device_id';
  const LS_NAMA = 'aw_device_nama';
  const tunda = (ms) => new Promise(r => setTimeout(r, ms));

  /** Emitter kecil yang dipakai kedua implementasi. */
  class Emitter {
    constructor() { this._d = {}; }
    on(nama, cb) { (this._d[nama] = this._d[nama] || []).push(cb); return () => this.off(nama, cb); }
    off(nama, cb) { this._d[nama] = (this._d[nama] || []).filter(x => x !== cb); }
    emit(nama, data) { (this._d[nama] || []).slice().forEach(cb => { try { cb(data); } catch (e) { console.warn('[Jam]', e); } }); }
  }

  const HasilSambung = {
    berhasil: 'berhasil', diLuarJangkauan: 'diLuarJangkauan', bukanAsaWatch: 'bukanAsaWatch',
    penyandinganDitolak: 'penyandinganDitolak', penyandinganTidakDijawab: 'penyandinganTidakDijawab',
    bondBasi: 'bondBasi', versiTidakCocok: 'versiTidakCocok',
    pesan(h, nama) {
      return {
        berhasil: '',
        diLuarJangkauan: `${nama} belum bisa disambungkan. Dekatkan jam ke ponsel, lalu coba lagi.`,
        bukanAsaWatch: `${nama} tidak menjawab seperti jam AsaWatch. Pastikan jam yang dipilih benar, lalu coba lagi.`,
        penyandinganDitolak: 'Penyandingan dibatalkan. Jam perlu disandingkan satu kali agar data kesehatan Anda terkirim dengan aman.',
        penyandinganTidakDijawab: 'Permintaan penyandingan belum dijawab. Coba lagi, lalu ketuk "Sandingkan" saat permintaan itu muncul.',
        bondBasi: `${nama} pernah disandingkan dengan data yang sudah tidak berlaku, jadi ponsel dan jam tidak lagi saling mengenali.`,
        versiTidakCocok: 'Versi jam dan versi aplikasi tidak cocok. Perbarui salah satunya, lalu coba lagi.',
      }[h] || 'Gagal menyambung.';
    },
    /** Hanya bondBasi yang tidak pernah pulih dengan mencoba lagi. */
    butuhSandingUlang: (h) => h === 'bondBasi',
  };

  const KemajuanDiam = { sedangMengukur: false, persen: null, sisaDetik: null, macet: false };

  /* ============================================================
     Dasar bersama: status + penyimpanan perangkat
     ============================================================ */
  class JamDasar extends Emitter {
    constructor() {
      super();
      this._status = M.statusPerangkat({ namaPerangkat: localStorage.getItem(LS_NAMA) || null });
    }
    get status() { return this._status; }
    _setStatus(ubah) {
      const s = this._status;
      this._status = M.statusPerangkat({ ...s, ...ubah });
      this.emit('status', this._status);
    }
    _ingatPerangkat(id, nama) {
      if (id) localStorage.setItem(LS_ID, id);
      if (nama) localStorage.setItem(LS_NAMA, nama);
    }
    _lupakanPerangkatTersimpan() {
      localStorage.removeItem(LS_ID);
      localStorage.removeItem(LS_NAMA);
    }
  }

  /* ============================================================
     JAM ASLI — Web Bluetooth
     ============================================================ */
  class JamAsli extends JamDasar {
    constructor() {
      super();
      this.device = null;
      this.server = null;
      this.ch = {};
      this.info = null;
      this._sengajaPutus = false;
      this._antreanGatt = Promise.resolve();
      this._penantiBalasan = [];        // { opcode, selesai, gagal }
      this._penantiUkur = null;         // mesin denyut ukurSekarang
      this._denyut = { terakhir: 0, persen: null, persenSejak: 0, timer: null };
      this._backoffMs = ProtokolJam.backoffAwalMs;
      this._gagalSejak = null;
      this._timerReconnect = null;
      this._onDisconnect = this._onDisconnect.bind(this);
    }

    static didukung() { return !!navigator.bluetooth; }

    /* ---------- pemasangan ---------- */

    /**
     * "Pemindaian" di web adalah dialog pemilih milik browser, disaring ke UUID
     * layanan AsaWatch: perangkat lain tidak pernah sampai ke aplikasi.
     */
    async pindai() {
      if (!JamAsli.didukung()) throw new GalatJam('Web Bluetooth tidak didukung browser ini. Pakai Chrome atau Edge.');
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [ProtokolJam.uuidLayanan] }, { namePrefix: ProtokolJam.awalanNama }],
          optionalServices: [ProtokolJam.uuidLayanan, ProtokolJam.uuidLayananBaterai],
        });
        this.device = device;
        return { id: device.id, nama: device.name || 'AsaWatch' };
      } catch (e) {
        if (e.name === 'NotFoundError') return null;            // dialog ditutup
        if (e.name === 'SecurityError') throw new GalatJam('Halaman harus dibuka lewat HTTPS atau localhost agar Bluetooth bisa dipakai.');
        throw new GalatJam('Gagal membuka pemilih perangkat: ' + (e.message || e));
      }
    }

    /** Sambung ke perangkat yang dipilih pindai() atau yang tersimpan. */
    async sambungkan(idPerangkat) {
      let device = this.device && (!idPerangkat || this.device.id === idPerangkat) ? this.device : null;
      if (!device && navigator.bluetooth?.getDevices) {
        const daftar = await navigator.bluetooth.getDevices().catch(() => []);
        device = daftar.find(d => d.id === (idPerangkat || localStorage.getItem(LS_ID))) || null;
      }
      if (!device) return HasilSambung.diLuarJangkauan;
      this.device = device;
      this._sengajaPutus = false;
      return this._sambung(device);
    }

    /**
     * Sambung ulang tanpa dialog, memakai izin yang sudah ada — HANYA ke id
     * yang tersimpan, bukan perangkat pertama yang kebetulan pernah diizinkan.
     */
    /**
     * Koneksi GATT milik dokumen: setiap ganti halaman memutusnya, dan halaman
     * baru harus menyambung lagi. Chrome hanya mengizinkan `gatt.connect()` pada
     * perangkat dari `getDevices()` SETELAH satu paket iklan diterima lewat
     * `watchAdvertisements()` — tanpa itu connect ditolak diam-diam.
     */
    async sambungUlangSenyap() {
      if (this._status.tersambung || this._status.sedangMenyambung) return false;
      if (!JamAsli.bisaSambungUlangSenyap()) return false;
      const id = localStorage.getItem(LS_ID);
      if (!id) return false;
      try {
        const daftar = await navigator.bluetooth.getDevices();
        const device = daftar.find(d => d.id === id);
        if (!device) return false;
        this.device = device;
        this._sengajaPutus = false;
        this._setStatus({ sedangMenyambung: true });
        if (!device.gatt.connected && typeof device.watchAdvertisements === 'function') {
          const terlihat = await this._tungguIklan(device, 12000);
          if (!terlihat) { this._setStatus({ sedangMenyambung: false }); return false; }   // jam mati / di luar jangkauan
        }
        return (await this._sambung(device, { senyap: true })) === HasilSambung.berhasil;
      } catch (e) {
        console.warn('[Jam] Sambung ulang senyap gagal:', e.message);
        this._setStatus({ sedangMenyambung: false });
        return false;
      }
    }

    /** `getDevices()` masih di balik flag Chrome (#enable-web-bluetooth-new-permissions-backend). */
    static bisaSambungUlangSenyap() { return !!navigator.bluetooth?.getDevices; }

    /** Tunggu satu paket iklan dari perangkat, maksimal `batasMs`. */
    _tungguIklan(device, batasMs) {
      return new Promise((selesai) => {
        const ctl = new AbortController();
        const timer = setTimeout(() => { ctl.abort(); selesai(false); }, batasMs);
        device.addEventListener('advertisementreceived', () => { clearTimeout(timer); ctl.abort(); selesai(true); }, { once: true });
        device.watchAdvertisements({ signal: ctl.signal }).catch(() => { clearTimeout(timer); selesai(false); });
      });
    }

    async _sambung(device, { senyap = false } = {}) {
      if (this._status.tersambung) return HasilSambung.berhasil;
      this._setStatus({ sedangMenyambung: true, namaPerangkat: device.name || this._status.namaPerangkat });
      this.emit('tahap', 'menyambung');
      try {
        device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        device.addEventListener('gattserverdisconnected', this._onDisconnect);

        // Web Bluetooth tidak punya batas waktu sendiri; 15 detik = paging langsung.
        this.server = await Promise.race([
          device.gatt.connect(),
          tunda(15000).then(() => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }),
        ]);

        let layanan;
        try { layanan = await this.server.getPrimaryService(ProtokolJam.uuidLayanan); }
        catch { await this._putusDiam(); return this._gagalSambung(HasilSambung.bukanAsaWatch); }

        this.emit('tahap', 'menyiapkan');
        const ambil = (uuid) => layanan.getCharacteristic(uuid);
        this.ch = {
          info: await ambil(ProtokolJam.uuidInfo),
          kontrol: await ambil(ProtokolJam.uuidKontrol),
          peristiwa: await ambil(ProtokolJam.uuidPeristiwa),
          sampel: await ambil(ProtokolJam.uuidSampel),
          status: await ambil(ProtokolJam.uuidStatus),
        };

        // Urutan §5.1: baca Info → langgani Peristiwa, Sampel, Status → baru
        // ANCHOR_WAKTU dan perintah lain. Balasan datang sebagai notifikasi, dan
        // notifikasi ke karakteristik yang belum dilanggani lenyap tanpa jejak.
        const info = P.bacaInfo(await this._gatt(() => this.ch.info.readValue()));
        try { P.periksaVersi(info); }
        catch (e) { await this._putusDiam(); this.emit('galat', { pesan: e.pesanPengguna }); return this._gagalSambung(HasilSambung.versiTidakCocok); }
        this.info = info;

        await this._gatt(() => this.ch.peristiwa.startNotifications());
        this.ch.peristiwa.addEventListener('characteristicvaluechanged', (e) => this._onPeristiwa(e.target.value));
        await this._gatt(() => this.ch.sampel.startNotifications());
        this.ch.sampel.addEventListener('characteristicvaluechanged', (e) => this._onSampel(e.target.value));
        await this._gatt(() => this.ch.status.startNotifications());
        this.ch.status.addEventListener('characteristicvaluechanged', (e) => this._onStatus(e.target.value));

        this._ingatPerangkat(device.id, device.name);
        this._backoffMs = ProtokolJam.backoffAwalMs;
        this._gagalSejak = null;
        this._setStatus({
          tersambung: true, sedangMenyambung: false, penyandinganHilang: false,
          namaPerangkat: device.name || 'AsaWatch', firmwareBuild: info.firmwareBuild,
          kemampuan: { gulaDarah: info.kemampuan.gulaDarah, tekananDarah: info.kemampuan.tekananDarah, spo2: info.kemampuan.spo2 },
        });

        // Anchor pada setiap koneksi, sebelum perintah lain (§4.2) — lalu tarik buffer.
        const bootTerakhir = await window.DB.meta('bootIdTerakhir', null);
        await this._pasangAnchor(info.bootId);
        if (bootTerakhir !== info.bootId) await window.DB.setMeta('bootIdTerakhir', info.bootId);
        await this.sinkronkan();
        try { const st = P.bacaStatus(await this._gatt(() => this.ch.status.readValue())); this._terapkanStatus(st); } catch { /* opsional */ }
        this._bacaBaterai();
        return HasilSambung.berhasil;
      } catch (e) {
        await this._putusDiam();
        const hasil = this._petakanGalatSambung(e);
        if (!senyap) this.emit('galat', { pesan: HasilSambung.pesan(hasil, device.name || 'Jam') });
        return this._gagalSambung(hasil);
      }
    }

    _gagalSambung(hasil) {
      this._setStatus({ tersambung: false, sedangMenyambung: false, penyandinganHilang: hasil === HasilSambung.bondBasi });
      return hasil;
    }

    _petakanGalatSambung(e) {
      const pesan = String(e?.message || '').toLowerCase();
      if (e?.name === 'TimeoutError' || e?.name === 'NetworkError') return HasilSambung.diLuarJangkauan;
      if (e?.name === 'NotFoundError') return HasilSambung.bukanAsaWatch;
      if (e?.name === 'SecurityError' || pesan.includes('authentication') || pesan.includes('not authorized') || pesan.includes('insufficient')) {
        // Web tidak membedakan kunci basi dari dialog yang ditolak; keduanya
        // hanya pulih dengan melupakan penyandingan di pengaturan sistem.
        return HasilSambung.bondBasi;
      }
      if (e?.name === 'NotAllowedError') return HasilSambung.penyandinganDitolak;
      return HasilSambung.diLuarJangkauan;
    }

    async _pasangAnchor(bootId) {
      const epochMs = Date.now();
      const uptimeSebelum = this.info?.uptimeS ?? 0;
      await this._tulis(P.tulisAnchorWaktu(epochMs, bootId), Opcode.anchorWaktu);
      // Jam mencatat uptime saat perintah diterima; selisih ke uptime handshake
      // hanya sepersekian detik, dan dokumen sendiri menyebut drift 4–9 s/hari.
      await window.DB.simpanAnchor({ bootId, uptimeS: uptimeSebelum, epochMs });
    }

    async _bacaBaterai() {
      try {
        const svc = await this.server.getPrimaryService(ProtokolJam.uuidLayananBaterai);
        const ch = await svc.getCharacteristic(ProtokolJam.uuidLevelBaterai);
        const v = await this._gatt(() => ch.readValue());
        this._setStatus({ baterai: v.getUint8(0) });
        await this._gatt(() => ch.startNotifications());
        ch.addEventListener('characteristicvaluechanged', (e) => this._setStatus({ baterai: e.target.value.getUint8(0) }));
      } catch { /* tidak semua firmware punya */ }
    }

    async putuskan() {
      this._sengajaPutus = true;
      clearTimeout(this._timerReconnect);
      await this._putusDiam();
      this._setStatus({ tersambung: false, sedangMenyambung: false });
    }

    async _putusDiam() {
      try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* sudah putus */ }
      this.server = null; this.ch = {};
    }

    /** Lupakan jam: putus, cabut izin browser, buang id tersimpan. */
    async lupakanPerangkat() {
      await this.putuskan();
      try { await this.device?.forget?.(); } catch { /* tidak semua browser */ }
      this.device = null;
      this._lupakanPerangkatTersimpan();
      this._setStatus({ tersambung: false, namaPerangkat: null, kemampuan: null, penyandinganHilang: false });
    }

    /** Padanan lupakanPenyandingan: web hanya bisa mencabut izin; kunci ada di OS. */
    async lupakanPenyandingan() {
      try { await this.device?.forget?.(); return true; } catch { return false; }
    }

    _onDisconnect() {
      const sengaja = this._sengajaPutus;
      this.server = null; this.ch = {};
      // Semua penanti balasan gugur; penanti ukur diberi kalimatnya sendiri.
      this._penantiBalasan.splice(0).forEach(p => p.gagal(new GalatJam(PesanUkur.terputus)));
      if (this._penantiUkur) this._penantiUkur.gagal(new GalatJam(PesanUkur.terputus));
      this._hentikanDenyut();
      this._setStatus({ tersambung: false, sedangMenyambung: false });
      if (!sengaja) this._jadwalkanReconnect();
    }

    /** Backoff 1 s → … → 60 s, lalu 5 menit setelah 10 menit gagal beruntun (§8). */
    _jadwalkanReconnect() {
      if (!this.device || this._sengajaPutus) return;
      clearTimeout(this._timerReconnect);
      const jeda = this._backoffMs;
      this._gagalSejak = this._gagalSejak ?? Date.now();
      this._timerReconnect = setTimeout(async () => {
        if (this._status.tersambung || this._sengajaPutus) return;
        const hasil = await this._sambung(this.device, { senyap: true });
        if (hasil !== HasilSambung.berhasil) {
          if (HasilSambung.butuhSandingUlang(hasil)) return; // tidak pernah pulih sendiri (§4.5 alur pemasangan)
          this._backoffMs = ProtokolJam.backoffBerikutnya(jeda, Date.now() - this._gagalSejak);
          this._jadwalkanReconnect();
        }
      }, jeda);
    }

    /* ---------- GATT: satu operasi pada satu waktu ---------- */
    _gatt(kerja) {
      const p = this._antreanGatt.then(kerja, kerja);
      this._antreanGatt = p.catch(() => { });
      return p;
    }

    /**
     * Tulis ke Kontrol dan tunggu ACK/NAK di Peristiwa (5 s × 3, §7). NAK yang
     * bolehRetry diulang setelah jedanya; yang tidak, dilempar sebagai GalatJam.
     * ACK_EVENT tidak pernah dibalas dan tidak ditunggu.
     */
    async _tulis(bytes, opcode, { tungguAck = true } = {}) {
      if (!this.ch.kontrol) throw new GalatJam('Jam belum tersambung.');
      let terakhir = null;
      for (let percobaan = 1; percobaan <= ProtokolJam.maksPercobaan; percobaan++) {
        const penanti = tungguAck ? this._tungguBalasan(opcode) : null;
        try {
          await this._gatt(() => this.ch.kontrol.writeValueWithResponse(bytes));
          if (!tungguAck) return true;
          const balasan = await penanti;
          if (balasan.kode === JenisPeristiwa.ack) return true;
          const g = balasan.kodeGalat;
          terakhir = new GalatJam(g ? g.pesan : 'Jam menolak perintah (kode ' + balasan.payload + ').', g);
          if (!g || !g.bolehRetry) throw terakhir;
          await tunda(KodeGalatJam.jedaRetryMs(g));
        } catch (e) {
          if (penanti) penanti.batal?.();
          if (e instanceof GalatJam && e.kode && !e.kode.bolehRetry) throw e;
          terakhir = e instanceof GalatJam ? e : new GalatJam('Jam tidak membalas ' + Opcode.nama(opcode) + '.');
          if (!this.ch.kontrol) throw terakhir;
        }
      }
      throw terakhir || new GalatJam('Jam tidak membalas.');
    }

    _tungguBalasan(opcode) {
      let selesai, gagal, timer;
      const p = new Promise((ok, no) => { selesai = ok; gagal = no; });
      const entri = { opcode, selesai: (v) => { clearTimeout(timer); selesai(v); }, gagal: (e) => { clearTimeout(timer); gagal(e); } };
      timer = setTimeout(() => { this._penantiBalasan = this._penantiBalasan.filter(x => x !== entri); gagal(new GalatJam('Jam tidak membalas ' + Opcode.nama(opcode) + ' dalam 5 detik.')); }, ProtokolJam.timeoutTulisMs);
      this._penantiBalasan.push(entri);
      p.batal = () => { clearTimeout(timer); this._penantiBalasan = this._penantiBalasan.filter(x => x !== entri); };
      return p;
    }

    /* ---------- notifikasi masuk ---------- */

    async _onPeristiwa(dv) {
      const u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      let ev;
      try { ev = P.bacaPeristiwa(u8); }
      catch (e) {
        // Kependekan → tidak di-ack (properti tautan, §6). Isi rusak → ack lalu buang.
        if (u8.length < ProtokolJam.panjangPeristiwa) { console.warn('[Jam] Peristiwa kependekan (MTU?):', P.ringkasPaket('Peristiwa', u8)); return; }
        console.warn('[Jam] Peristiwa tidak terbaca, di-ack lalu dibuang:', e.message, P.ringkasPaket('Peristiwa', u8));
        if (u8[0] !== 0) await this._ack(u8[0]);
        return;
      }

      // ACK/NAK: percakapan sesaat (seq 0), bukan entri buffer.
      if (ev.kode === JenisPeristiwa.ack || ev.kode === JenisPeristiwa.nak) {
        const i = this._penantiBalasan.findIndex(p => p.opcode === ev.opcodeDiack || ev.kode === JenisPeristiwa.nak);
        if (i >= 0) this._penantiBalasan.splice(i, 1)[0].selesai(ev);
        if (ev.kode === JenisPeristiwa.nak && ev.kodeGalat?.kode === 0x09) {
          // boot_id tidak cocok: handshake + anchor ulang (§7).
          this._bacaInfoUlang();
        }
        return;
      }

      // Entri buffer: simpan → ack → proses (§6).
      const no = await window.DB.simpanEntriJam({ jenis: 'peristiwa', ...ev, mentah: Array.from(u8) });
      await this._ack(ev.seq);
      await this._prosesPeristiwa(ev);
      await window.DB.tandaiEntriDiproses(no);
    }

    async _prosesPeristiwa(ev) {
      switch (ev.kode) {
        case JenisPeristiwa.tombolSelesaiMakan: {
          // t0: waktu aplikasi saat peristiwa tiba (§5.3 v1.3); entri buffer
          // diterjemahkan lewat anchor boot-nya; boot tanpa anchor → tidak pasti.
          const { waktu, waktuTidakPasti } = await this._waktuEntri(ev);
          this.emit('selesaiMakanDitekan', { sesiId: ev.sesiId, t0: waktu.toISOString(), waktuTidakPasti });
          break;
        }
        case JenisPeristiwa.sesiKedaluwarsa:
          this.emit('sesiKedaluwarsa', { sesiId: ev.sesiId });
          this.emit('galat', { pesan: 'Tombol Selesai Makan di jam kedaluwarsa (4 jam tidak ditekan).' });
          break;
        case JenisPeristiwa.sesiDibatalkanJam:
          this.emit('sesiDibatalkanJam', { sesiId: ev.sesiId, alasan: ev.payload });
          break;
        case JenisPeristiwa.ukurGagal:
          this.emit('ukurGagal', { sesiId: ev.sesiId, index: ev.payload });
          // Ber-sesiId nol = jawaban UKUR_SEKARANG yang sedang ditunggu (§5.6).
          if (!ev.sesiId && this._penantiUkur) this._penantiUkur.gagal(new GalatJam(PesanUkur.jamMenyerah));
          break;
        case JenisPeristiwa.bufferPenuh:
          console.warn('[Jam] BUFFER_PENUH — entri tertua dibuang, kemungkinan ada data hilang.');
          this.emit('galat', { pesan: 'Memori jam penuh; sebagian data lama mungkin hilang.' });
          break;
        case JenisPeristiwa.boot:
          await this._bacaInfoUlang();
          break;
      }
    }

    async _bacaInfoUlang() {
      try {
        const info = P.bacaInfo(await this._gatt(() => this.ch.info.readValue()));
        this.info = info;
        await this._pasangAnchor(info.bootId);
        await window.DB.setMeta('bootIdTerakhir', info.bootId);
        await this.sinkronkan();
      } catch (e) { console.warn('[Jam] Handshake ulang gagal:', e.message); }
    }

    async _onSampel(dv) {
      const u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      let s;
      try { s = P.bacaSampel(u8); }
      catch (e) {
        if (u8.length < ProtokolJam.panjangSampel) {
          // MTU masih 23: jam memotong PDU diam-diam. JANGAN di-ack — entri tetap
          // di buffer jam dan terbaca benar begitu tautannya benar (§6).
          console.warn('[Jam] Sampel kependekan, tidak di-ack (MTU?):', P.ringkasPaket('Sampel', u8));
          this.emit('galat', { pesan: 'Paket dari jam terpotong (MTU). Coba putuskan lalu sambungkan lagi.' });
          return;
        }
        console.warn('[Jam] Sampel tidak terbaca, di-ack lalu dibuang:', e.message, P.ringkasPaket('Sampel', u8));
        if (u8[0] !== 0) await this._ack(u8[0]);
        return;
      }

      // Jawaban UKUR_SEKARANG: sesiId nol, tidak pernah masuk sesi mana pun.
      const nyata = P.sesiIdNyata(s.sesiId);
      const no = nyata ? await window.DB.simpanEntriJam({ jenis: 'sampel', ...s, mentah: Array.from(u8) }) : null;
      if (s.seq !== 0) await this._ack(s.seq);

      const { waktu, waktuTidakPasti } = await this._waktuEntri(s);
      const sampel = {
        index: s.index, detikRelatifT0: 0, status: M.StatusSampel.terisi, dariBuffer: s.dariBuffer,
        gulaDarah: s.gulaDarah, detakJantung: s.detakJantung, sistolik: s.sistolik, diastolik: s.diastolik, spo2: s.spo2,
        waktu: waktu.toISOString(), waktuTidakPasti: waktuTidakPasti || s.waktuTidakPasti,
      };
      if (!nyata) {
        if (this._penantiUkur) this._penantiUkur.selesai(sampel);
        this.emit('sampelLepas', sampel);
      } else {
        this.emit('sampel', { sesiId: s.sesiId, sampel });
        if (no != null) await window.DB.tandaiEntriDiproses(no);
      }
    }

    /** Waktu absolut sebuah entri: realtime = sekarang; buffer = lewat anchor boot-nya (§4.2). */
    async _waktuEntri(entri) {
      if (!entri.dariBuffer) return { waktu: new Date(), waktuTidakPasti: false };
      if (entri.waktuTidakPasti) return { waktu: new Date(), waktuTidakPasti: true };
      const a = await window.DB.muatAnchor(entri.bootId);
      if (!a) return { waktu: new Date(), waktuTidakPasti: true };
      return { waktu: new Date(a.epochMs + (entri.uptimeS - a.uptimeS) * 1000), waktuTidakPasti: false };
    }

    async _ack(seq) {
      try {
        await this._tulis(P.tulisAckEvent(seq), Opcode.ackEvent, { tungguAck: false });
        await window.DB.setMeta('seqTerakhir', seq);
        // Aplikasi ikut mengurangi sampel_tertunda per ack; paket Status tetap berkuasa (§5.5).
        if (this._status.sampelTertunda > 0) this._setStatus({ sampelTertunda: this._status.sampelTertunda - 1 });
      } catch (e) { console.warn('[Jam] ACK_EVENT gagal:', e.message); }
    }

    _onStatus(dv) {
      let st;
      try { st = P.bacaStatus(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)); }
      catch (e) { console.warn('[Jam] Status tidak terbaca:', e.message); return; }
      this._terapkanStatus(st);
    }

    _terapkanStatus(st) {
      this.statusJam = st;
      this._setStatus({
        baterai: st.baterai, bateraiKritis: st.bateraiKritis, sampelTertunda: st.sampelTertunda,
        sinkronTerakhir: new Date().toISOString(),
      });
      this._denyutStatus(st);
    }

    /* ---------- denyut pengukuran (§5.6) ---------- */

    _denyutStatus(st) {
      const d = this._denyut;
      if (st.sedangMengukur) {
        const kini = Date.now();
        d.terakhir = kini;
        if (st.ukurPersen !== d.persen) { d.persen = st.ukurPersen; d.persenSejak = kini; }
        const macet = st.punyaKemajuan && kini - d.persenSejak >= ProtokolJam.ambangMacetMs;
        const kemajuan = { sedangMengukur: true, persen: st.ukurPersen, sisaDetik: st.ukurSisaDetik, macet };
        this.emit('kemajuanUkur', kemajuan);
        this._penantiUkur?.denyut(kemajuan);
        this._pasangPenjagaDenyut();
      } else if (d.terakhir) {
        // bit0 padam: Sampel boleh menyusul 8 detik (status dulu, sampel kemudian).
        this._hentikanDenyut();
        this.emit('kemajuanUkur', KemajuanDiam);
        this._penantiUkur?.padam();
      }
    }

    _pasangPenjagaDenyut() {
      clearTimeout(this._denyut.timer);
      this._denyut.timer = setTimeout(async () => {
        // Diam tidak langsung diartikan mati: baca Status dulu. Ini juga yang
        // menjaga firmware ≤ v1.3 yang tidak berdenyut sama sekali.
        try {
          const st = P.bacaStatus(await this._gatt(() => this.ch.status.readValue()));
          this._terapkanStatus(st);   // bit0 masih menyala → penjaga dipasang lagi
        } catch {
          this._hentikanDenyut();
          this.emit('kemajuanUkur', KemajuanDiam);
          this._penantiUkur?.gagal(new GalatJam(PesanUkur.denyutBerhenti));
        }
      }, ProtokolJam.denyutUkurBasiMs);
    }

    _hentikanDenyut() {
      clearTimeout(this._denyut.timer);
      this._denyut = { terakhir: 0, persen: null, persenSejak: 0, timer: null };
    }

    /**
     * UKUR_SEKARANG dengan penantian yang dibuktikan denyut, bukan perintah yang
     * terkirim: delapan kejadian, masing-masing kalimatnya sendiri (PesanUkur).
     */
    async ukurSekarang() {
      if (!this._status.tersambung) throw new GalatJam(PesanUkur.terputus);
      if (this._penantiUkur) throw new GalatJam('Pengukuran sebelumnya masih berjalan.');

      let selesaiFn, gagalFn;
      const janji = new Promise((ok, no) => { selesaiFn = ok; gagalFn = no; });
      const timer = {};
      const bersih = () => { Object.values(timer).forEach(clearTimeout); this._penantiUkur = null; };
      const penanti = {
        mulai: false,
        selesai: (s) => { bersih(); selesaiFn(s); },
        gagal: (e) => { bersih(); gagalFn(e); },
        denyut: () => { penanti.mulai = true; clearTimeout(timer.mulai); },
        padam: () => { clearTimeout(timer.hasil); timer.hasil = setTimeout(() => penanti.gagal(new GalatJam(PesanUkur.hasilTidakSampai)), ProtokolJam.tenggatHasilUkurMs); },
      };
      this._penantiUkur = penanti;
      timer.langit = setTimeout(() => penanti.gagal(new GalatJam(PesanUkur.terlaluLama)), ProtokolJam.batasUkurMs);

      try {
        await this._tulis(P.tulisUkurSekarang(), Opcode.ukurSekarang);
      } catch (e) { penanti.gagal(e); return janji; }

      // ACK datang; jam harus mulai berdenyut dalam 20 detik.
      timer.mulai = setTimeout(async () => {
        try {
          const st = P.bacaStatus(await this._gatt(() => this.ch.status.readValue()));
          if (st.sedangMengukur) { this._terapkanStatus(st); return; }
        } catch { /* jatuh ke bawah */ }
        penanti.gagal(new GalatJam(PesanUkur.tidakMulai));
      }, ProtokolJam.tenggatMulaiUkurMs);
      this.emit('kemajuanUkur', { sedangMengukur: true, persen: null, sisaDetik: null, macet: false });
      return janji;
    }

    /** BACA karakteristik Status (bit0) — bukti, bukan asumsi. Gagal = false. */
    async jamSedangMengukur() {
      if (!this.ch.status) return false;
      try { return P.bacaStatus(await this._gatt(() => this.ch.status.readValue())).sedangMengukur; }
      catch { return false; }
    }

    /* ---------- perintah sesi ---------- */
    async siapkanSesi(sesiId) {
      if (!this._status.tersambung) return false;
      try { await this._tulis(P.tulisArmSesi(sesiId), Opcode.armSesi); return true; }
      catch (e) { console.warn('[Jam] ARM_SESI gagal:', e.message); return false; }
    }
    async mulaiSesi(sesiId) {
      if (!this._status.tersambung) return false;
      try { await this._tulis(P.tulisMulaiSesi(sesiId), Opcode.mulaiSesi); return true; }
      catch (e) { this.emit('galat', { pesan: e.pesanPengguna || e.message }); return false; }
    }
    async mintaUkur(sesiId, index) {
      if (!this._status.tersambung) return false;
      try { await this._tulis(P.tulisUkur(sesiId, index), Opcode.ukur); return true; }
      catch (e) { console.warn('[Jam] UKUR gagal:', e.message); this.emit('galat', { pesan: e.pesanPengguna || e.message }); return false; }
    }
    async armTitik(sesiId, index) {
      if (!this._status.tersambung) return false;
      try { await this._tulis(P.tulisArmTitik(sesiId, index), Opcode.armTitik); return true; }
      catch (e) { console.warn('[Jam] ARM_TITIK gagal:', e.message); return false; }
    }
    async batalkanSesi(sesiId) {
      if (!this._status.tersambung) return;
      try { await this._tulis(P.tulisBatalSesi(sesiId), Opcode.batalSesi); } catch (e) { console.warn('[Jam] BATAL_SESI:', e.message); }
    }
    async sinkronkan() {
      if (!this._status.tersambung) return;
      const seq = await window.DB.meta('seqTerakhir', 0);
      try { await this._tulis(P.tulisSinkron(seq), Opcode.sinkron); } catch (e) { console.warn('[Jam] SINKRON:', e.message); }
    }
    async kirimKalibrasi(k) {
      if (!this._status.tersambung) throw new GalatJam('Jam belum tersambung.');
      await this._tulis(P.tulisSetKalibrasi(M.Kalibrasi.offsetSistolik(k), M.Kalibrasi.offsetDiastolik(k)), Opcode.setKalibrasi);
    }
  }

  /* ============================================================
     JAM PALSU — tulang punggung uji dan satu-satunya cara demo tanpa jam
     ============================================================ */
  class JamPalsu extends JamDasar {
    constructor(opsi = {}) {
      super();
      this.percepatan = opsi.percepatan ?? 1;
      this.lewatkan = new Set(opsi.lewatkan || []);
      this.otomatisSelesaiMakan = opsi.otomatisSelesaiMakan ?? null;   // detik tersimulasi; null = tidak
      this.penyandingan = opsi.penyandingan || 'tidakPerlu';
      this.galatUkurSekarang = opsi.galatUkurSekarang || null;
      this.denyutUkur = opsi.denyutUkur ?? true;
      this.metrikGagal = new Set(opsi.metrikGagal || []);
      this.kemampuan = opsi.kemampuan ?? M.KemampuanPerangkat.semua;
      this.bateraiAwal = opsi.baterai ?? 68;
      this.katalog = [
        { id: 'palsu-1', nama: 'AsaWatch X1', kekuatanSinyal: -52, didukung: true },
        { id: 'palsu-2', nama: 'AsaWatch X1 (cadangan)', kekuatanSinyal: -78, didukung: true },
        { id: 'asing', nama: 'Speaker Ruang Tamu', kekuatanSinyal: -60, didukung: false },
      ];
      this._sesiSiap = null; this._sudahDitekan = false;
      this.titikDiarm = null; this.tombolUkurMenyala = false;
      this.sedangMengukurTitik = false; this._sedangUkur = false;
      this._timer = new Set();
      this._benih = 7;
    }

    static didukung() { return true; }
    _jeda(detik) { return Math.max(0, (detik * 1000) / this.percepatan); }
    _nanti(detik, fn) { const t = setTimeout(() => { this._timer.delete(t); fn(); }, this._jeda(detik)); this._timer.add(t); return t; }
    _acak(min, maks) { this._benih = (this._benih * 1103515245 + 12345) & 0x7fffffff; return min + (this._benih % (maks - min + 1)); }

    /** "Pemindaian" palsu: katalog tetap, disaring ke yang didukung (seperti filter UUID di OS). */
    async pindai() {
      await tunda(600);
      const jam = this.katalog.find(d => d.didukung);
      return { id: jam.id, nama: jam.nama };
    }
    daftarKatalog() { return this.katalog.slice(); }

    async sambungkan(idPerangkat) {
      const d = this.katalog.find(x => x.id === (idPerangkat || localStorage.getItem(LS_ID))) || this.katalog[0];
      if (!d.didukung) return HasilSambung.bukanAsaWatch;
      this._setStatus({ sedangMenyambung: true, namaPerangkat: d.nama });
      this.emit('tahap', 'menyambung');
      await tunda(400);
      if (this.penyandingan !== 'tidakPerlu') {
        this.emit('tahap', 'menyandingkan');
        await tunda(800);
        if (this.penyandingan === 'ditolak') return this._gagal(HasilSambung.penyandinganDitolak);
        if (this.penyandingan === 'tidakDijawab') return this._gagal(HasilSambung.penyandinganTidakDijawab);
        if (this.penyandingan === 'bondBasi') return this._gagal(HasilSambung.bondBasi, true);
      }
      this.emit('tahap', 'menyiapkan');
      await tunda(300);
      this._ingatPerangkat(d.id, d.nama);
      this._setStatus({
        tersambung: true, sedangMenyambung: false, namaPerangkat: d.nama, baterai: this.bateraiAwal,
        bateraiKritis: this.bateraiAwal < 10, kemampuan: this.kemampuan, penyandinganHilang: false,
        sinkronTerakhir: new Date().toISOString(), firmwareBuild: 0,
      });
      return HasilSambung.berhasil;
    }
    _gagal(h, hilang = false) { this._setStatus({ tersambung: false, sedangMenyambung: false, penyandinganHilang: hilang }); return h; }

    async sambungUlangSenyap() {
      if (this._status.tersambung) return false;
      if (!localStorage.getItem(LS_ID)) return false;
      return (await this.sambungkan(localStorage.getItem(LS_ID))) === HasilSambung.berhasil;
    }
    async lupakanPenyandingan() { this.penyandingan = 'tidakPerlu'; return true; }
    async putuskan() {
      this._timer.forEach(clearTimeout); this._timer.clear();
      this._setStatus({ tersambung: false, sedangMenyambung: false });
    }
    async lupakanPerangkat() {
      await this.putuskan();
      this._lupakanPerangkatTersimpan();
      this._setStatus({ namaPerangkat: null, kemampuan: null });
    }

    async siapkanSesi(sesiId) {
      if (!this._status.tersambung) return false;
      this._sesiSiap = sesiId; this._sudahDitekan = false;
      if (this.otomatisSelesaiMakan != null) this._nanti(this.otomatisSelesaiMakan, () => this.tekanSelesaiMakan());
      return true;
    }

    /** Tombol fisik "Selesai Makan" di jam ditekan. Ditolak diam-diam bila belum di-ARM. */
    tekanSelesaiMakan({ waktu, waktuTidakPasti = false } = {}) {
      const sesiId = this._sesiSiap;
      if (!sesiId || this._sudahDitekan) return false;
      this._sudahDitekan = true;
      this.emit('selesaiMakanDitekan', { sesiId, t0: (waktu || new Date()).toISOString(), waktuTidakPasti });
      // Index 1 diukur seketika; +1 jam/+2 jam datang lewat UKUR dari aplikasi (v1.3).
      if (!this.lewatkan.has(1)) this._nanti(20, () => this._kirim(sesiId, this._buatSampel(1)));
      return true;
    }

    async mulaiSesi(sesiId) {
      if (!this._status.tersambung || this._sesiSiap !== sesiId) return false;
      if (this._status.bateraiKritis) return false;
      // Jam menekan tombolnya sendiri: peristiwanya tiba lewat jalur yang sama.
      this._nanti(1, () => this.tekanSelesaiMakan());
      return true;
    }

    async mintaUkur(sesiId, index) {
      if (!this._status.tersambung) return false;
      // v1.3: UKUR dilayani di ketiga status (protokol §12), jadi sesi yang
      // dipulihkan setelah jam mati-hidup tetap bisa mengukur titiknya.
      if (index === 0 && this._sesiSiap !== sesiId) return false;   // baseline tetap menuntut ARM lebih dulu
      if (this.lewatkan.has(index)) return false;
      // Jam sungguhan men-NAK 0x05 selagi sensor sibuk (§9.1).
      if (this.sedangMengukurTitik || this._sedangUkur) return false;
      if (this.titikDiarm?.sesiId === sesiId && this.titikDiarm?.index === index) { this.titikDiarm = null; this.tombolUkurMenyala = false; }
      this._ukurBerdenyut(() => this._kirim(sesiId, this._buatSampel(index)));
      return true;
    }

    _ukurBerdenyut(selesai) {
      this.sedangMengukurTitik = true;
      const langkah = 4;
      for (let i = 1; i <= langkah; i++) {
        this._nanti(20 * i / langkah, () => {
          if (!this.denyutUkur) return;
          this.emit('kemajuanUkur', { sedangMengukur: true, persen: Math.round(i * 100 / langkah), sisaDetik: (langkah - i) * 5, macet: false });
        });
      }
      this._nanti(20, () => { this.sedangMengukurTitik = false; this.emit('kemajuanUkur', KemajuanDiam); selesai(); });
    }

    async armTitik(sesiId, index) {
      if (!this._status.tersambung) return false;
      this.titikDiarm = { sesiId, index }; this.tombolUkurMenyala = true;
      this.emit('tombolUkur', { menyala: true, index });
      return true;
    }

    /** Tombol ukur fisik di jam palsu ditekan (halaman Perangkat). */
    tekanTombolUkur() {
      const t = this.titikDiarm;
      if (!t || !this.tombolUkurMenyala) return false;
      this.titikDiarm = null; this.tombolUkurMenyala = false;
      this.emit('tombolUkur', { menyala: false });
      this._ukurBerdenyut(() => this._kirim(t.sesiId, this._buatSampel(t.index)));
      return true;
    }

    async batalkanSesi(sesiId) {
      if (this._sesiSiap === sesiId) { this._sesiSiap = null; this._sudahDitekan = false; }
      if (this.titikDiarm?.sesiId === sesiId) { this.titikDiarm = null; this.tombolUkurMenyala = false; }
    }
    async sinkronkan() { this._setStatus({ sinkronTerakhir: new Date().toISOString(), sampelTertunda: 0 }); }
    async jamSedangMengukur() { return this._status.tersambung && (this.sedangMengukurTitik || this._sedangUkur); }
    async kirimKalibrasi() { if (!this._status.tersambung) throw new GalatJam('Jam belum tersambung.'); await tunda(300); }

    async ukurSekarang() {
      if (!this._status.tersambung) throw new GalatJam(PesanUkur.terputus);
      if (this._sedangUkur) throw new GalatJam('Pengukuran sebelumnya masih berjalan.');
      if (this._status.bateraiKritis) throw new GalatJam(KodeGalatJam[0x06].pesan, KodeGalatJam[0x06]);
      this._sedangUkur = true;
      try {
        await new Promise((ok) => this._ukurBerdenyut(ok));
        if (this.galatUkurSekarang) throw new GalatJam(PesanUkur[this.galatUkurSekarang] || this.galatUkurSekarang);
        const s = this._buatSampel(0);
        s.waktu = new Date().toISOString();
        this.emit('sampelLepas', s);
        return s;
      } finally { this._sedangUkur = false; }
    }

    _buatSampel(index) {
      const g = this.metrikGagal;
      const k = this._status.kemampuan || M.KemampuanPerangkat.semua;
      return {
        index, detikRelatifT0: 0, status: M.StatusSampel.terisi, dariBuffer: false,
        gulaDarah: k.gulaDarah && !g.has('gulaDarah') ? this._acak(index === 0 ? 85 : 95, index === 2 ? 165 : 130) : null,
        detakJantung: !g.has('detakJantung') ? this._acak(64, 92) : null,
        sistolik: k.tekananDarah && !g.has('tekananDarah') ? this._acak(108, 132) : null,
        diastolik: k.tekananDarah && !g.has('tekananDarah') ? this._acak(68, 84) : null,
        spo2: k.spo2 && !g.has('spo2') ? this._acak(95, 99) : null,
        waktu: new Date().toISOString(), waktuTidakPasti: false,
      };
    }
    _kirim(sesiId, sampel) { if (this._status.tersambung) this.emit('sampel', { sesiId, sampel }); }

    /** Untuk demo: putuskan tanpa sengaja (uji reconnect/menungguPerangkat) dan baterai kritis. */
    setBaterai(persen) { this._setStatus({ baterai: persen, bateraiKritis: persen < 10 }); }
  }

  /** Rakit jam sesuai pengaturan — padanan buatBleBawaan() di konfigurasi.dart. */
  function buatJamBawaan(settings) {
    // Percepatan 10: pengukuran jam palsu 2 detik, bukan 20 — jendela jadwal uji
    // (55–70 s) tidak cukup lebar untuk pengukuran selambat jam sungguhan.
    if (settings?.simulasi) return new JamPalsu({ percepatan: 10, otomatisSelesaiMakan: null });
    return new JamAsli();
  }

  window.Jam = { JamAsli, JamPalsu, HasilSambung, KemajuanDiam, buatJamBawaan, LS_ID, LS_NAMA };
})();
