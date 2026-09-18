/**
 * device.js — lapisan koneksi ke perangkat AsaWatch (IoT).
 *
 * Membungkus AsaWatchBluetooth (protokol asli di ../js/bluetooth.js) dan
 * menambahkan hal-hal yang dibutuhkan aplikasi:
 *   • pemilihan perangkat yang lebih toleran (service UUID atau nama)
 *   • sambung ulang otomatis saat koneksi putus mendadak
 *   • sambung ulang senyap saat halaman dibuka (tanpa dialog pemilih)
 *   • pengukuran dengan progres nyata dari jam + penyimpanan hasil ke Store
 *   • mode simulasi untuk menguji alur tanpa perangkat fisik
 *
 * Dipakai lewat window.Perangkat.
 */
(function () {
  'use strict';

  /** Boleh ditimpa dari halaman bila firmware memakai UUID lain. */
  const KONFIG = Object.assign({
    serviceUUID: (window.PROTOCOL && window.PROTOCOL.SERVICE_UUID) || '0000fff0-0000-1000-8000-00805f9b34fb',
    namePrefix: 'AsaWatch',
    jedaSambungUlang: [2000, 5000, 10000],   // backoff percobaan ke-1..3
    batasUkurMs: 90000,                       // menyerah bila jam tak kunjung mengirim sampel
  }, window.ASAWATCH_BLE || {});

  const dengar = {};                          // nama peristiwa -> [callback]
  const pancar = (nama, data) => (dengar[nama] || []).forEach(cb => {
    try { cb(data); } catch (e) { console.warn('[Perangkat]', e); }
  });

  /* ============================================================
     SIMULATOR — meniru jam sungguhan untuk uji coba
     ============================================================ */
  const Simulator = {
    terhubung: false,

    async sambung() {
      await tunda(600);
      this.terhubung = true;
      P._terhubung({ nama: 'AsaWatch X1 (Simulasi)', baterai: 85 });
      pancar('kemampuan', { gulaDarah: true, detakJantung: true, tekananDarah: true, spo2: true });
      return true;
    },

    async putus() {
      this.terhubung = false;
      P._terputus(true);
    },

    async ukur() {
      // Progres bertahap seperti laporan jam sungguhan
      for (let persen = 0; persen < 100; persen += 12) {
        pancar('progres', { persen, sisaDetik: Math.round((100 - persen) / 12), status: 0 });
        await tunda(260);
      }
      pancar('progres', { persen: 100, sisaDetik: 0, status: 1 });

      const acak = (min, maks) => Math.round(min + Math.random() * (maks - min));
      return {
        detakJantung: acak(62, 96),
        gulaDarah: acak(88, 138),
        sistolik: acak(105, 132),
        diastolik: acak(68, 86),
        spo2: acak(95, 99),
        sesiId: 'simulasi',
        index: Date.now() % 100000,
      };
    },
  };

  const tunda = ms => new Promise(r => setTimeout(r, ms));

  /* ============================================================
     PERANGKAT
     ============================================================ */
  const P = {
    ble: null,
    mode: 'ble',              // 'ble' | 'simulasi'
    terhubung: false,
    sedangMenyambung: false,
    sedangMengukur: false,
    baterai: null,
    kemampuan: null,
    nama: null,
    _sengajaPutus: false,
    _percobaan: 0,

    /** Daftarkan pendengar: status | sampel | progres | baterai | kemampuan | galat */
    on(nama, cb) { (dengar[nama] = dengar[nama] || []).push(cb); },

    /** Mode simulasi dibaca dari pengaturan; bisa diubah dari halaman Pengaturan. */
    simulasiAktif() { return !!window.Store?.settings().simulasi; },

    dukunganBluetooth() { return !!navigator.bluetooth; },

    /* ---------- status internal ---------- */
    _terhubung({ nama, baterai }) {
      this.terhubung = true;
      this.sedangMenyambung = false;
      this._percobaan = 0;
      this.nama = nama || this.nama || 'AsaWatch';
      if (baterai !== undefined && baterai !== null) this.baterai = baterai;
      window.Store?.setDevice({ nama: this.nama, baterai: this.baterai, terhubung: true });
      pancar('status', { terhubung: true, nama: this.nama, baterai: this.baterai, mode: this.mode });
    },

    _terputus(sengaja) {
      this.terhubung = false;
      this.sedangMenyambung = false;
      window.Store?.setDevice({ terhubung: false });
      pancar('status', { terhubung: false, nama: this.nama, mode: this.mode, sengaja: !!sengaja });
      if (!sengaja) this._jadwalkanSambungUlang();
    },

    /** Coba sambung lagi beberapa kali dengan jeda menaik. */
    _jadwalkanSambungUlang() {
      if (this.mode !== 'ble' || this._sengajaPutus) return;
      const jeda = KONFIG.jedaSambungUlang[this._percobaan];
      if (jeda === undefined) {
        pancar('galat', { pesan: 'Koneksi terputus dan gagal tersambung ulang. Coba sambungkan manual.' });
        return;
      }
      this._percobaan++;
      pancar('menyambungUlang', { percobaan: this._percobaan, jeda });
      setTimeout(async () => {
        if (this.terhubung || this._sengajaPutus) return;
        try {
          await this.ble.connect();
        } catch {
          this._jadwalkanSambungUlang();
        }
      }, jeda);
    },

    /* ---------- pemasangan pendengar protokol ---------- */
    _pasangPendengarBle() {
      const ble = this.ble;
      if (ble._terpasang) return;
      ble._terpasang = true;

      ble.on('connected', () => this._terhubung({ nama: ble.device?.name }));
      ble.on('disconnected', () => this._terputus(this._sengajaPutus));
      ble.on('battery', ({ level, critical }) => {
        this.baterai = level;
        window.Store?.setDevice({ baterai: level });
        pancar('baterai', { level, kritis: critical });
        if (critical) pancar('galat', { pesan: 'Baterai jam kritis, segera isi daya.' });
      });
      ble.on('kemampuan', (k) => { this.kemampuan = k; pancar('kemampuan', k); });
      ble.on('measureProgress', (p) => pancar('progres', p));
      ble.on('sampel', (s) => this._simpanSampel(s));
      ble.on('handshakeWarning', (e) =>
        console.warn('[Perangkat] Jam tidak membalas handshake:', e?.message || e));
      ble.on('error', (e) => pancar('galat', { pesan: e?.message || String(e) }));
    },

    /** Sampel yang datang sendiri dari jam (terjadwal maupun hasil "ukur"). */
    async _simpanSampel(s) {
      const bersih = {
        detakJantung: bulat(s.detakJantung),
        gulaDarah: bulat(s.gulaDarah),
        sistolik: bulat(s.sistolik),
        diastolik: bulat(s.diastolik),
        spo2: bulat(s.spo2),
      };
      const adaIsi = Object.values(bersih).some(v => v !== null);
      if (!adaIsi) return null;

      const tersimpan = await window.Store?.addSample(bersih);
      pancar('sampel', { ...bersih, tersimpan: !!tersimpan, asal: s.sesiId || null });
      return tersimpan;
    },

    /* ============================================================
       SAMBUNG
       ============================================================ */
    async sambung() {
      if (this.sedangMenyambung || this.terhubung) return;
      this._sengajaPutus = false;
      this._percobaan = 0;
      this.mode = this.simulasiAktif() ? 'simulasi' : 'ble';

      if (this.mode === 'simulasi') {
        this.sedangMenyambung = true;
        pancar('status', { terhubung: false, menyambung: true, mode: 'simulasi' });
        return Simulator.sambung();
      }

      if (!this.dukunganBluetooth()) {
        pancar('galat', { pesan: 'Web Bluetooth tidak didukung browser ini. Pakai Chrome atau Edge, atau nyalakan Mode Simulasi.' });
        return;
      }
      if (!window.AsaWatchBluetooth) {
        pancar('galat', { pesan: 'Modul bluetooth.js gagal dimuat.' });
        return;
      }

      this.sedangMenyambung = true;
      pancar('status', { terhubung: false, menyambung: true, mode: 'ble' });

      try {
        this.ble = this.ble || new window.AsaWatchBluetooth();
        this._pasangPendengarBle();

        // Pemilih perangkat: terima yang mengiklankan service kita ATAU bernama AsaWatch.
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: [KONFIG.serviceUUID] },
            { namePrefix: KONFIG.namePrefix },
          ],
          optionalServices: [KONFIG.serviceUUID, 'battery_service'],
        });

        this.ble.device = device;
        device.addEventListener('gattserverdisconnected', () => this.ble._onDisconnected());
        localStorage.setItem('aw_device_id', device.id || '');
        localStorage.setItem('aw_device_nama', device.name || 'AsaWatch');

        await this.ble.connect();
        await this._bacaBateraiStandar();
        return true;
      } catch (e) {
        this.sedangMenyambung = false;
        if (e.name === 'NotFoundError') {
          pancar('galat', { pesan: 'Tidak ada perangkat dipilih. Pastikan jam menyala dan Bluetooth aktif.' });
        } else if (e.name === 'SecurityError') {
          pancar('galat', { pesan: 'Halaman harus dibuka lewat HTTPS atau localhost.' });
        } else {
          pancar('galat', { pesan: 'Gagal menyambung: ' + (e.message || e) });
        }
        pancar('status', { terhubung: false, mode: this.mode });
        return false;
      }
    },

    /**
     * Sambung ulang tanpa dialog, memakai izin yang sudah pernah diberikan.
     * Dipanggil saat halaman dibuka; diam saja bila tidak didukung/tidak ketemu.
     */
    async sambungUlangSenyap() {
      if (this.terhubung || this.simulasiAktif()) return false;
      if (!navigator.bluetooth?.getDevices) return false;   // hanya Chrome versi baru

      try {
        const idTersimpan = localStorage.getItem('aw_device_id');
        const daftar = await navigator.bluetooth.getDevices();
        const device = daftar.find(d => d.id === idTersimpan) || daftar[0];
        if (!device) return false;

        this.ble = this.ble || new window.AsaWatchBluetooth();
        this._pasangPendengarBle();
        this.ble.device = device;
        device.addEventListener('gattserverdisconnected', () => this.ble._onDisconnected());

        this.sedangMenyambung = true;
        await this.ble.connect();
        await this._bacaBateraiStandar();
        return true;
      } catch {
        this.sedangMenyambung = false;
        return false;                                       // jam mungkin di luar jangkauan
      }
    },

    /** Baterai lewat profil standar BLE, bila firmware menyediakannya. */
    async _bacaBateraiStandar() {
      try {
        const svc = await this.ble.server?.getPrimaryService('battery_service');
        const ch = await svc.getCharacteristic('battery_level');
        const level = (await ch.readValue()).getUint8(0);
        this.baterai = level;
        window.Store?.setDevice({ baterai: level });
        pancar('baterai', { level, kritis: level <= 15 });
      } catch { /* opsional, tidak semua firmware punya */ }
    },

    async putus() {
      this._sengajaPutus = true;
      if (this.mode === 'simulasi') return Simulator.putus();
      try { await this.ble?.disconnect(); } catch { }
      this._terputus(true);
    },

    /* ============================================================
       UKUR
       ============================================================ */
    async ukurSekarang() {
      if (!this.terhubung) {
        pancar('galat', { pesan: 'Sambungkan jam terlebih dahulu.' });
        return null;
      }
      if (this.sedangMengukur) return null;
      this.sedangMengukur = true;
      pancar('progres', { persen: 0, sisaDetik: null, status: 0 });

      try {
        if (this.mode === 'simulasi') {
          const hasil = await Simulator.ukur();
          const tersimpan = await this._simpanSampel(hasil);
          return tersimpan;
        }

        // Jam sungguhan: kirim perintah, lalu tunggu sampel datang lewat notifikasi.
        const menunggu = this._tungguSampel(KONFIG.batasUkurMs);
        this.ble.measureNow().catch(e =>
          console.warn('[Perangkat] Perintah ukur tanpa ACK:', e?.message || e));
        return await menunggu;
      } catch (e) {
        pancar('galat', { pesan: e.message || String(e) });
        return null;
      } finally {
        this.sedangMengukur = false;
      }
    },

    /** Tunggu satu sampel berikutnya, atau menyerah setelah batas waktu. */
    _tungguSampel(batasMs) {
      return new Promise((selesai, gagal) => {
        const waktuHabis = setTimeout(() => {
          lepas();
          pancar('progres', { persen: 0, sisaDetik: 0, status: 2 });
          gagal(new Error('Jam tidak mengirim hasil dalam ' + Math.round(batasMs / 1000) + ' detik.'));
        }, batasMs);

        const pendengar = (data) => { lepas(); selesai(data); };
        const lepas = () => {
          clearTimeout(waktuHabis);
          dengar.sampel = (dengar.sampel || []).filter(cb => cb !== pendengar);
        };
        (dengar.sampel = dengar.sampel || []).push(pendengar);
      });
    },
  };

  const bulat = v => (v === null || v === undefined || Number.isNaN(v)) ? null : Math.round(v);

  window.Perangkat = P;
})();
