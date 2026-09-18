/**
 * sesi.js — SesiMakanController: satu-satunya pengelola state sesi makan.
 *
 * Port inti lib/controllers/sesi_makan_controller.dart. Aturan yang mengikat
 * (docs/rancangan-ui-sesi-makan.md §12.6, docs/jadwal-titik-ukur.md):
 *   • hanya satu sesi aktif;
 *   • t0 hanya masuk lewat peristiwa `selesaiMakanDitekan` dari jam —
 *     `mulaiSesiDariApp()` mengirim MULAI_SESI dan TIDAK menyentuh sesi aktif;
 *   • jam disiapkan (ARM_SESI) saat draft dibuat dan tiap kali tersambung ulang;
 *   • sampel di-dedup (sesiId, index); jadwal dihitung ulang dari t0 absolut;
 *   • semua tersimpan lokal dulu (IndexedDB), server menyusul dan boleh gagal diam.
 *
 * Keterbatasan web: timer (ARM_TITIK, tenggat, pengingat) hidup hanya selagi
 * tab terbuka. Semua dihitung ulang dari t0 saat halaman dibuka lagi.
 */
(function () {
  'use strict';

  const M = window.Model;
  const { Sesi, Sampel, StatusSesi, StatusSampel } = M;
  const P = window.Protokol;
  const DB = window.DB;
  const Sv = () => window.Server;

  const LS_USER = 'aw_user';
  const LS_AKUN = 'aw_akun_email';       // padanan user_account_email

  class SesiMakanController {
    /**
     * @param jam       objek Jam (JamAsli/JamPalsu)
     * @param jadwal    JadwalSesi untuk sesi BARU (sesi lama memakai jadwalnya sendiri)
     * @param riwayatAwal  hasil DB.muatSemuaSesi() — dimuat sebelum konstruktor
     */
    constructor({ jam, jadwal, riwayatAwal = [], sekarang = () => new Date() }) {
      this.ble = jam;
      this.jadwal = jadwal || M.jadwalNormal;
      this.kini = sekarang;
      this._dengar = {};

      // Sesi aktif dipisahkan dari riwayat; jadwal & kunci dedup dipulihkan.
      this._riwayat = [];
      this._sesiAktif = null;
      this._sampelDiterima = new Set();
      for (const s of riwayatAwal) {
        if (Sesi.sedangAktif(s) && !this._sesiAktif) {
          this._sesiAktif = s;
          s.sampel.forEach(sp => { if (Sampel.terisi(sp)) this._sampelDiterima.add(s.id + '#' + sp.index); });
        } else if (Sesi.sedangAktif(s)) {
          // Dua sesi aktif tidak boleh ada; yang kedua ditutup sebagai tidak lengkap.
          this._riwayat.push(this._tandaiSisanyaTerlewat(s));
        } else this._riwayat.push(s);
      }
      this._urutkanRiwayat();

      this._hasilBelumDibaca = null;
      this._galatPenyimpanan = null;
      this._sedangAnalisis = new Set();
      this._sesiDiarm = null;
      this._titikDiarm = null;
      this._timerArm = null; this._timerUlangUkur = null; this._tenggat = null; this._tundaTenggat = 0;
      this._ukurOtomatisBerjalan = null;
      this._sedangMemindai = false;
      this._pindaiTerakhir = null;
      this._kalibrasiTerakhir = null;
      this._kemajuanUkur = null;
      this._pengingat = [];
      this._dibuang = false;

      jam.on('sampel', (p) => this._terimaSampel(p));
      jam.on('selesaiMakanDitekan', (p) => this._terimaT0(p));
      jam.on('kemajuanUkur', (k) => { this._kemajuanUkur = k.sedangMengukur ? k : null; this._beritahu('kemajuan'); });
      jam.on('sesiKedaluwarsa', ({ sesiId }) => { if (this._sesiAktif?.id === sesiId && !this._sesiAktif.t0) this._sesiDiarm = null; });
      jam.on('sesiDibatalkanJam', ({ sesiId }) => { if (this._sesiAktif?.id === sesiId) this.batalkan(); });
      let sebelumnya = jam.status;
      jam.on('status', (st) => {
        // "Baru tersambung" menahan umpan balik status → ARM → status → ARM.
        if (st.tersambung && !sebelumnya.tersambung) this._sesiDiarm = null;
        if (!st.tersambung) { this._sesiDiarm = null; this._titikDiarm = null; }
        sebelumnya = st;
        this._siapkanJam();
        this._armTitikBerikutnya();
        this._beritahu('status');
      });

      DB.daftarKalibrasi().then(d => { this._kalibrasiTerakhir = d[0] || null; this._beritahu('kalibrasi'); }).catch(() => { });

      if (this._sesiAktif) {
        this._siapkanJam();
        this._armTitikBerikutnya();
        this._jadwalkanTenggat();
      }
    }

    /* ---------- pendengar ---------- */
    on(nama, cb) { (this._dengar[nama] = this._dengar[nama] || []).push(cb); return () => { this._dengar[nama] = (this._dengar[nama] || []).filter(x => x !== cb); }; }
    _beritahu(alasan = 'ubah') {
      if (this._dibuang) return;
      const jalankan = (n) => (this._dengar[n] || []).slice().forEach(cb => { try { cb(this, alasan); } catch (e) { console.warn('[Sesi]', e); } });
      jalankan(alasan);
      if (alasan !== 'ubah') jalankan('ubah');
    }

    /* ---------- pembacaan ---------- */
    get sesiAktif() { return this._sesiAktif; }
    get riwayat() { return this._riwayat.slice(); }
    get sesiTerakhir() { return this._riwayat[0] || null; }
    get hasilBelumDibaca() { return this._hasilBelumDibaca; }
    get galatPenyimpanan() { return this._galatPenyimpanan; }
    get statusPerangkat() { return this.ble.status; }
    get kemajuanUkur() { return this._kemajuanUkur; }
    get pindaiTerakhir() { return this._pindaiTerakhir; }
    get sedangMemindai() { return this._sedangMemindai; }
    get kalibrasiTerakhir() { return this._kalibrasiTerakhir; }
    get adaSesiUji() { return this._riwayat.some(s => s.sesiUji); }
    sedangMenganalisis(id) { return this._sedangAnalisis.has(id); }
    cariSesi(id) { return this._sesiAktif?.id === id ? this._sesiAktif : (this._riwayat.find(s => s.id === id) || null); }

    buangGalatPenyimpanan() { if (this._galatPenyimpanan) { this._galatPenyimpanan = null; this._beritahu(); } }
    tandaiHasilDibaca() { if (this._hasilBelumDibaca) { this._hasilBelumDibaca = null; this._beritahu(); } }
    buangPindaiTerakhir() { if (this._pindaiTerakhir) { this._pindaiTerakhir = null; this._beritahu(); } }

    /** Sesi hari ini — tanpa sesi berwaktu tidak pasti dan tanpa sesi uji. */
    sesiHariIni(sekarang = this.kini()) {
      const awal = new Date(sekarang); awal.setHours(0, 0, 0, 0);
      const akhir = new Date(awal); akhir.setDate(akhir.getDate() + 1);
      const sama = (s) => {
        if (s.waktuTidakPasti || s.sesiUji) return false;
        const d = new Date(s.t0 || s.waktuFoto);
        return d >= awal && d < akhir;
      };
      const out = [];
      if (this._sesiAktif && sama(this._sesiAktif)) out.push(this._sesiAktif);
      return out.concat(this._riwayat.filter(sama));
    }

    /** Total gizi hari ini — bermula dari "tidak diketahui", bukan nol. */
    totalNutrisiHariIni() {
      let total = M.Nutrisi.tidakDiketahui();
      for (const s of this.sesiHariIni()) if (s.hasil) total = M.Nutrisi.jumlah(total, s.hasil.total);
      return total;
    }
    zatTidakLengkapHariIni() {
      const z = new Set();
      for (const s of this.sesiHariIni()) (s.hasil?.zatTidakLengkap || []).forEach(k => z.add(k));
      return z;
    }

    /** Puncak gula darah beberapa sesi terakhir, urut lama → baru (sparkline). */
    puncakTerakhir(jumlah = 7) {
      const nilai = [];
      for (const s of this._riwayat) {
        const p = Sesi.puncakGulaDarah(s);
        if (p != null) nilai.push(p);
        if (nilai.length === jumlah) break;
      }
      return nilai.reverse();
    }

    /** Titik berjendela yang sedang ditunggu, atau null. */
    get titikBerikutnya() {
      const s = this._sesiAktif;
      if (!s || !s.t0) return null;
      const menunggu = Sesi.jadwal(s).titik
        .filter(t => t.berjendela && s.sampel.some(sp => sp.index === t.index && sp.status === StatusSampel.menunggu))
        .sort((a, b) => a.detikNominal - b.detikNominal);
      return menunggu[0] || null;
    }

    /** Detik sampai jendela titik berikutnya terbuka; ≤ 0 = sudah terbuka. */
    get sisaSampaiTitikBerikutnyaDetik() {
      const t = this.titikBerikutnya, t0 = this._sesiAktif?.t0;
      if (!t || !t0) return null;
      return t.jendelaAwal - Math.floor((this.kini() - new Date(t0)) / 1000);
    }

    /** Satu kalimat untuk empat permukaan mengapa jam tidak bisa diminta mengukur. */
    get alasanJamTidakBisaUkur() {
      const p = this.ble.status;
      if (p.belumDipasangkan) return 'Belum ada jam yang tersandingkan.';
      if (!p.tersambung) return 'Jam belum tersambung. Nyalakan jam dan dekatkan ke ponsel, lalu coba lagi.';
      if (p.bateraiKritis) return `Baterai jam tinggal ${p.baterai ?? 0}% dan jam menolak mengukur di bawah 10%. Isi daya jam dulu.`;
      return null;
    }

    /* ============================================================
       Siklus sesi
       ============================================================ */

    /** Shutter ditekan: draft dibuat, foto disimpan, jam di-ARM, baseline diminta, analisis di latar. */
    async mulaiDraft(fotoBlob) {
      if (this._sesiAktif) throw new Error('Masih ada sesi aktif. Akhiri sesi berjalan lebih dulu.');
      const id = P.buatIdSesi();
      const sekarang = this.kini().toISOString();
      const sesi = {
        id, fotoAda: !!fotoBlob, waktuFoto: sekarang, t0: null, status: StatusSesi.draft,
        sampel: this.jadwal.titik.map(t => M.sampelMenunggu(t.index, t.detikNominal)),
        hasil: null, waktuTidakPasti: false,
        // Ditandai saat lahir: sesudah tersimpan, sesi dua menit tak bisa dibedakan pasti.
        sesiUji: !!this.jadwal.uji, diperbaruiPada: null, dihapusPada: null,
      };
      this._sesiAktif = sesi;
      if (fotoBlob) { try { await DB.simpanFoto(id, fotoBlob); } catch (e) { console.warn('Foto gagal disimpan:', e); sesi.fotoAda = false; } }
      await this._simpanAktif();
      this._beritahu();

      // ARM dulu, baru baseline: jam hanya melayani UKUR dalam ARMED (§9).
      await this._siapkanJam();
      if (!await this.ble.mintaUkur(id, 0)) this._tandaiBaselineTerlewat(id);
      this._analisisNutrisi(id);
      return sesi;
    }

    _tandaiBaselineTerlewat(id) {
      const s = this._sesiAktif;
      if (!s || s.id !== id || s.sampel[0].status !== StatusSampel.menunggu) return;
      const sampel = s.sampel.map(sp => sp.index === 0 ? { ...sp, status: StatusSampel.terlewat } : sp);
      this._sesiAktif = Sesi.salin(s, { sampel });
      this._simpanAktif(); this._beritahu();
    }

    async _siapkanJam() {
      const s = this._sesiAktif;
      if (!s || s.t0 || !Sesi.sedangAktif(s)) return;
      if (this._sesiDiarm === s.id) return;   // idempoten pada satu koneksi
      const siap = await this.ble.siapkanSesi(s.id);
      if (siap) this._sesiDiarm = s.id;
      const status = siap ? StatusSesi.draft : StatusSesi.menungguPerangkat;
      const kini = this._sesiAktif;
      if (!kini || kini.id !== s.id || kini.t0 || kini.status === status) return;
      this._sesiAktif = Sesi.salin(kini, { status });
      await this._simpanAktif(); this._beritahu();
    }

    /** Tombol "Saya Sudah Selesai Makan": kirim MULAI_SESI; layar TIDAK berubah sampai jam menjawab. */
    async mulaiSesiDariApp() {
      const s = this._sesiAktif;
      if (!s || s.t0) return false;
      const p = this.ble.status;
      if (!p.tersambung || p.bateraiKritis) return false;
      if (this._sesiDiarm !== s.id) await this._siapkanJam();
      return this.ble.mulaiSesi(s.id);
    }

    /** Peristiwa TOMBOL_SELESAI_MAKAN — satu-satunya jalan sesi mendapat t0. */
    _terimaT0({ sesiId, t0, waktuTidakPasti }) {
      const s = this._sesiAktif;
      if (!s || s.id !== sesiId || s.t0) return;
      const detikBaseline = Math.round((new Date(s.waktuFoto) - new Date(t0)) / 1000);
      const sampel = s.sampel.map(sp => sp.index === 0 ? { ...sp, detikRelatifT0: detikBaseline } : sp);
      this._sesiAktif = Sesi.salin(s, { t0, sampel, status: StatusSesi.berjalan, waktuTidakPasti: !!waktuTidakPasti });
      this._jadwalkanTenggat();
      this._armTitikBerikutnya();
      this._simpanAktifLaluKirim();
      this._beritahu();
    }

    /**
     * detikRelatifT0 yang disimpan: sampel buffer membawa waktunya sendiri (lewat
     * anchor), sampel langsung memakai jam dinding sekarang. Selisih kecil (<
     * ambang) dinormalkan ke nominal; selisih menit disimpan apa adanya.
     */
    _detikRelatifT0(s, masuk) {
      const titik = Sesi.jadwal(s).titikIndex(masuk.index);
      const t0 = s.t0 ? new Date(s.t0) : null;
      const waktuMasuk = masuk.waktu ? new Date(masuk.waktu) : this.kini();
      const terukur = t0 ? Math.round(((masuk.dariBuffer ? waktuMasuk : this.kini()) - t0) / 1000) : masuk.detikRelatifT0;
      if (!titik) return terukur;
      return titik.normalkan(terukur);
    }

    _terimaSampel({ sesiId, sampel: masuk }) {
      const s = this._sesiAktif;
      if (!s || s.id !== sesiId) {
        console.warn(`Sampel index ${masuk.index} untuk sesi ${sesiId} diabaikan: sesi aktif ${s?.id || 'tidak ada'}.`);
        return;
      }
      const kunci = sesiId + '#' + masuk.index;
      if (this._sampelDiterima.has(kunci)) return;   // at-least-once
      this._sampelDiterima.add(kunci);

      const sampel = s.sampel.slice();
      const bersih = { ...masuk }; delete bersih.waktu;
      sampel[masuk.index] = (masuk.index === 0 && !s.t0)
        ? { ...bersih, detikRelatifT0: s.sampel[0].detikRelatifT0 }   // jarak ke t0 dihitung di _terimaT0
        : { ...bersih, detikRelatifT0: this._detikRelatifT0(s, masuk) };

      let diperbarui = Sesi.salin(s, { sampel });
      const tuntas = sampel.every(sp => sp.status !== StatusSampel.menunggu);
      if (tuntas && diperbarui.t0) {
        this._selesaikan(Sesi.salin(diperbarui, { status: Sesi.adaSampelTerlewat(diperbarui) ? StatusSesi.tidakLengkap : StatusSesi.selesai }));
        return;
      }
      if (diperbarui.status === StatusSesi.menungguPerangkat && diperbarui.t0) diperbarui = Sesi.salin(diperbarui, { status: StatusSesi.berjalan });
      this._sesiAktif = diperbarui;
      this._simpanAktifLaluKirim();
      this._armTitikBerikutnya();
      this._beritahu();
    }

    /* ---------- titik ukur: ARM saat jendela terbuka, ukur otomatis, tombol app ---------- */

    async ukurTitikSekarang() {
      const s = this._sesiAktif, t = this.titikBerikutnya;
      if (!s || !t) return null;
      const halangan = this.alasanJamTidakBisaUkur;
      if (halangan) return halangan;
      const sisa = this.sisaSampaiTitikBerikutnyaDetik;
      if (sisa != null && sisa > 0) return `Titik ${t.label} belum waktunya diukur.`;
      if (this._kemajuanUkur?.sedangMengukur) return 'Jam sedang mengukur.';
      if (!await this.ble.mintaUkur(s.id, t.index)) return 'Jam tidak menerima perintahnya. Pastikan jam menyala dan terpakai rapat di pergelangan, lalu coba lagi.';
      return null;
    }

    async _armTitikBerikutnya() {
      const s = this._sesiAktif;
      if (!s || !s.t0 || !Sesi.sedangAktif(s) || !this.ble.status.tersambung) return;
      const t = this.titikBerikutnya;
      if (!t) { this._titikDiarm = null; return; }
      this._jadwalkanPengingat();
      const sisa = this.sisaSampaiTitikBerikutnyaDetik ?? 0;
      if (sisa > 0) { this._jadwalkanArmTitik(sisa); return; }
      const kunci = s.id + '#' + t.index;
      if (this._titikDiarm !== kunci && await this.ble.armTitik(s.id, t.index)) this._titikDiarm = kunci;
      this._ukurOtomatis();
    }

    /** Ukur titik yang jatuh tempo tanpa menunggu ada yang menekan — jalur sama dengan tombol. */
    async _ukurOtomatis() {
      const s = this._sesiAktif, t = this.titikBerikutnya;
      if (!s || !t) return;
      const kunci = s.id + '#' + t.index;
      if (this._ukurOtomatisBerjalan === kunci) return;
      this._ukurOtomatisBerjalan = kunci;
      try {
        const galat = await this.ukurTitikSekarang();
        if (galat) console.warn(`Ukur otomatis ${t.label} belum berhasil: ${galat}`);
      } finally { this._ukurOtomatisBerjalan = null; }
      this._jadwalkanUlangUkur(t);
    }

    _jadwalkanUlangUkur(t) {
      clearTimeout(this._timerUlangUkur); this._timerUlangUkur = null;
      if (!t.berjendela || this._dibuang || !Sesi.sedangAktif(this._sesiAktif || { status: '' })) return;
      const lebar = Math.floor((t.jendelaAkhir - t.jendelaAwal) / 5);
      this._timerUlangUkur = setTimeout(() => { this._timerUlangUkur = null; this._armTitikBerikutnya(); }, Math.max(3, lebar) * 1000);
    }

    _jadwalkanArmTitik(sisaDetik) {
      clearTimeout(this._timerArm);
      this._timerArm = setTimeout(() => { this._timerArm = null; this._armTitikBerikutnya(); }, sisaDetik * 1000);
    }

    /** Pengingat T−5 & T lewat Notification API — hanya selagi tab hidup (keterbatasan web). */
    _jadwalkanPengingat() {
      this._pengingat.forEach(clearTimeout); this._pengingat = [];
      const s = this._sesiAktif;
      if (!s?.t0 || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const t0 = new Date(s.t0).getTime(), kini = Date.now();
      const jadwal = Sesi.jadwal(s);
      const lima = jadwal.uji ? 5000 : 5 * 60000;
      for (const t of jadwal.titik) {
        if (!t.berjendela || !s.sampel.some(sp => sp.index === t.index && sp.status === StatusSampel.menunggu)) continue;
        const kapan = t0 + t.detikNominal * 1000;
        const kirim = (judul, isi) => { try { new Notification(judul, { body: isi, tag: 'aw-' + s.id + '-' + t.index }); } catch { } };
        if (kapan - lima > kini) this._pengingat.push(setTimeout(() => kirim('Siapkan jam', `Titik ${t.label} sebentar lagi. Nyalakan dan pasang jam sekarang.`), kapan - lima - kini));
        if (kapan > kini) this._pengingat.push(setTimeout(() => kirim('Ukur sekarang', `Saatnya mengukur titik ${t.label}.`), kapan - kini));
      }
    }

    /* ---------- tenggat: mengalah pada pengukuran yang sedang berjalan ---------- */

    _batasTunggu(s) {
      if (!s.t0) return null;
      const terakhir = Math.max(...s.sampel.map(sp => sp.detikRelatifT0));
      return new Date(new Date(s.t0).getTime() + (terakhir + Sesi.jadwal(s).tenggatSetelahAkhirDetik) * 1000);
    }

    _jadwalkanTenggat() {
      clearTimeout(this._tenggat); this._tenggat = null; this._tundaTenggat = 0;
      const s = this._sesiAktif; if (!s) return;
      const batas = this._batasTunggu(s); if (!batas) return;
      const sisa = batas - this.kini();
      this._tenggat = setTimeout(() => this._lewatTenggat(), Math.max(0, sisa));
    }

    async _lewatTenggat() {
      const s = this._sesiAktif;
      if (!s || !s.t0 || !Sesi.sampelBerikutnya(s)) return;
      if (this.ble.status.tersambung && this._tundaTenggat < 12) {
        const sedangUkur = await this.ble.jamSedangMengukur();   // bukti, bukan asumsi
        if (this._dibuang || this._sesiAktif?.id !== s.id) return;
        if (sedangUkur) {
          this._tundaTenggat++;
          console.info(`Tenggat sesi ditunda: jam sedang mengukur (${this._tundaTenggat}/12).`);
          clearTimeout(this._tenggat);
          this._tenggat = setTimeout(() => this._lewatTenggat(), 30000);
          return;
        }
      }
      this._selesaikan(this._tandaiSisanyaTerlewat(s));
    }

    _tandaiSisanyaTerlewat(s) {
      return Sesi.salin(s, {
        sampel: s.sampel.map(sp => sp.status === StatusSampel.menunggu ? { ...M.sampelMenunggu(sp.index, sp.detikRelatifT0), status: StatusSampel.terlewat } : sp),
        status: StatusSesi.tidakLengkap,
      });
    }

    /* ---------- dua pintu keluar ---------- */

    /** "Selesaikan Sesi": yang sudah masuk disimpan, sisanya terlewat, sesi tidakLengkap. */
    async akhiriLebihAwal() {
      const s = this._sesiAktif; if (!s) return;
      await this.ble.batalkanSesi(s.id);
      this._selesaikan(this._tandaiSisanyaTerlewat(s));
    }

    /** "Batalkan Sesi": nisan lokal (ditunggu), DELETE server (tidak ditunggu). */
    async batalkan() {
      const s = this._sesiAktif; if (!s) return;
      await this.ble.batalkanSesi(s.id);
      this._pengingat.forEach(clearTimeout); this._pengingat = [];
      this._lupakanKunci(s.id);
      this._sesiDiarm = null; this._titikDiarm = null;
      clearTimeout(this._timerArm); clearTimeout(this._tenggat); clearTimeout(this._timerUlangUkur);
      this._sesiAktif = null;
      const bernisan = await this._buangLokal(s);
      this._beritahu();
      if (bernisan) this._sapuNisan();
    }

    async _buangLokal(s) {
      try {
        if (Sv().token()) { await DB.nisankanSesi(s.id); return true; }
        await DB.hapusSesi(s.id);
      } catch (e) { console.warn('Gagal membuang sesi:', e); }
      return false;
    }

    async _sapuNisan() {
      if (!Sv().token()) return;
      let nisan = [];
      try { nisan = await DB.muatNisan(); } catch { return; }
      for (const n of nisan) {
        try { if (await Sv().hapusSesi(n.id)) await DB.hapusSesi(n.id); }
        catch (e) { if (e.status === 401) return; }
      }
    }

    _selesaikan(sesi) {
      clearTimeout(this._tenggat); clearTimeout(this._timerArm); clearTimeout(this._timerUlangUkur);
      this._tenggat = this._timerArm = this._timerUlangUkur = null;
      this._pengingat.forEach(clearTimeout); this._pengingat = [];
      this._sesiDiarm = null; this._titikDiarm = null;
      this._riwayat.unshift(sesi);
      this._sesiAktif = null;
      this._hasilBelumDibaca = sesi;
      this._lupakanKunci(sesi.id);
      // Sesi yang berakhir melepas ARM tombol ukur di jam.
      this.ble.batalkanSesi(sesi.id);
      // Simpan dulu, baru kirim, berurutan — stempel repo yang naik ke server.
      this._simpanLaluKirim(sesi);
      this._beritahu();
    }

    /* ---------- koreksi & analisis gizi ---------- */

    koreksiHasil(makanan) {
      const s = this._sesiAktif;
      if (!s?.hasil) return;
      this._sesiAktif = Sesi.salin(s, { hasil: M.HasilDeteksi.dikoreksi(s.hasil, makanan) });
      this._simpanAktif(); this._beritahu();
    }

    /** Angka gizi diketik manual (padanan FakeNutrisiService saat tanpa akun/analisis gagal). */
    isiHasilManual(nama, nutrisi) {
      const s = this._sesiAktif; if (!s) return;
      const item = { nama: nama || 'Makanan', porsi: '1 porsi', estimasiGram: 0, nutrisi: { ...M.Nutrisi.tidakDiketahui(), ...nutrisi } };
      const hasil = M.HasilDeteksi.dikoreksi({ makanan: [], total: item.nutrisi, indeksGlikemikPerkiraan: null, keyakinan: null, zatTidakLengkap: [], dikoreksiUser: true }, [item]);
      this._sesiAktif = Sesi.salin(s, { hasil });
      this._simpanAktifLaluKirim(); this._beritahu();
    }

    async _analisisNutrisi(sesiId) {
      if (!Sv().token()) return;   // tanpa akun: form manual yang menjawab
      this._sedangAnalisis.add(sesiId); this._beritahu();
      try {
        const hasil = await this._mintaHasil(sesiId);
        if (hasil) this._terapkanHasil(sesiId, hasil);
      } catch (e) { console.warn('Analisis gizi gagal:', e.message); }
      finally { this._sedangAnalisis.delete(sesiId); this._beritahu(); }
    }

    async _mintaHasil(sesiId) {
      const s = this.cariSesi(sesiId); if (!s) return null;
      if (!await Sv().kirimSesi(s)) return null;          // endpoint foto menolak sesi yang belum dikenal
      const foto = await DB.muatFoto(sesiId); if (!foto) return null;
      if (!await Sv().kirimFoto(sesiId, foto)) return null;
      return Sv().mintaAnalisis(sesiId);
    }

    /** Hasil diterapkan ke sesi di mana pun ia berada — koreksi user tidak ditimpa. */
    _terapkanHasil(sesiId, hasil) {
      const aktif = this._sesiAktif;
      if (aktif?.id === sesiId) {
        if (aktif.hasil?.dikoreksiUser) return;
        this._sesiAktif = Sesi.salin(aktif, { hasil }); this._simpanAktif(); return;
      }
      const i = this._riwayat.findIndex(s => s.id === sesiId);
      if (i < 0 || this._riwayat[i].hasil?.dikoreksiUser) return;
      const d = Sesi.salin(this._riwayat[i], { hasil });
      this._riwayat[i] = d;
      if (this._hasilBelumDibaca?.id === sesiId) this._hasilBelumDibaca = d;
      this._simpan(d);
    }

    /* ---------- pindai kesehatan & kalibrasi ---------- */

    async pindaiKesehatan() {
      const p = this.ble.status;
      if (p.belumDipasangkan) throw new P.GalatJam('Belum ada jam yang dipasangkan. Pasangkan jam AsaWatch lebih dulu.');
      if (!p.tersambung) throw new P.GalatJam('Jam belum tersambung. Dekatkan jam ke ponsel, lalu coba lagi.');
      if (p.bateraiKritis) throw new P.GalatJam(`Baterai jam tinggal ${p.baterai ?? 0}% dan jam menolak mengukur di bawah 10%. Isi daya jam dulu.`);
      if (this._sedangMemindai) throw new P.GalatJam('Pengukuran sebelumnya masih berjalan.');
      this._sedangMemindai = true; this._beritahu();
      try {
        const sampel = await this.ble.ukurSekarang();
        // Di memori saja: bacaan lepas tanpa makanan/t0 bukan sesi (§3.1 jadwal).
        this._pindaiTerakhir = { waktu: this.kini().toISOString(), sampel };
        return this._pindaiTerakhir;
      } finally { this._sedangMemindai = false; this._beritahu(); }
    }

    ukurUntukKalibrasi() {
      const halangan = this.alasanJamTidakBisaUkur;
      if (halangan) return Promise.reject(new P.GalatJam(halangan));
      return this.ble.ukurSekarang();
    }

    /** Ditulis SETELAH jam menerimanya: kalibrasi di HP yang tak sampai ke jam adalah koreksi palsu. */
    async simpanKalibrasi(k) {
      await this.ble.kirimKalibrasi(k);
      this._kalibrasiTerakhir = k;
      try { await DB.simpanKalibrasi(k); } catch (e) { console.warn('Gagal menyimpan kalibrasi:', e); }
      if (Sv().token()) Sv().kirimKalibrasi(k).catch(() => { });
      this._beritahu('kalibrasi');
    }

    /* ---------- penyimpanan ---------- */

    _lupakanKunci(id) { for (const k of [...this._sampelDiterima]) if (k.startsWith(id + '#')) this._sampelDiterima.delete(k); }

    async _simpan(sesi) {
      try {
        const tersimpan = await DB.simpanSesi(sesi);
        this._terapkanStempel(tersimpan);
        if (this._galatPenyimpanan) { this._galatPenyimpanan = null; this._beritahu(); }
        return tersimpan;
      } catch (e) {
        console.warn('Sesi gagal disimpan:', e);
        this._galatPenyimpanan = 'Sesi gagal disimpan di browser ini. Data yang tampil sekarang bisa hilang setelah tab ditutup.';
        this._beritahu();
        return null;
      }
    }
    _terapkanStempel(tersimpan) {
      if (this._sesiAktif?.id === tersimpan.id) this._sesiAktif = { ...this._sesiAktif, diperbaruiPada: tersimpan.diperbaruiPada };
      const i = this._riwayat.findIndex(s => s.id === tersimpan.id);
      if (i >= 0) this._riwayat[i] = { ...this._riwayat[i], diperbaruiPada: tersimpan.diperbaruiPada };
      if (this._hasilBelumDibaca?.id === tersimpan.id) this._hasilBelumDibaca = { ...this._hasilBelumDibaca, diperbaruiPada: tersimpan.diperbaruiPada };
    }
    _simpanAktif() { return this._sesiAktif ? this._simpan(this._sesiAktif) : Promise.resolve(null); }
    async _simpanLaluKirim(sesi) { const t = await this._simpan(sesi); await this._kirimKeServer(t || sesi); }
    _simpanAktifLaluKirim() { if (this._sesiAktif) this._simpanLaluKirim(this._sesiAktif); }
    async _kirimKeServer(sesi) {
      if (!Sv().token()) return;
      try { await Sv().kirimSesi(sesi); } catch (e) { /* 401 sudah ditangani penjaga */ }
    }

    /* ---------- sinkron dengan server ---------- */

    /**
     * Sapu nisan → unggah semua → foto untuk yang server bilang belum punya →
     * analisis bila hasil masih kosong → unduh. Dipanggil saat buka, saat tab
     * kembali terlihat, dan setelah masuk. Gagal = log, bukan layar.
     */
    async kirimRiwayatKeServer() {
      const S = Sv();
      if (!S.token()) return;
      try {
        await this._sapuNisan();
        const diServer = await S.daftarSesi();
        const tanpaFoto = diServer ? new Set(diServer.filter(u => !u.urlFoto).map(u => u.sesi.id)) : null;
        const urlFoto = new Map((diServer || []).filter(u => u.urlFoto).map(u => [u.sesi.id, u.urlFoto]));

        for (const sesi of this._riwayat.slice()) {
          await S.kirimSesi(sesi);
          const fotoLokal = sesi.fotoAda ? await DB.muatFoto(sesi.id) : null;
          if (!fotoLokal) {
            const url = urlFoto.get(sesi.id);
            if (url) await this._unduhFotoKeSesi(sesi, url);
            continue;
          }
          const perlu = tanpaFoto ? tanpaFoto.has(sesi.id) : sesi.hasil == null;
          if (!perlu) continue;
          if (!await S.kirimFoto(sesi.id, fotoLokal)) continue;
          if (sesi.hasil) continue;
          const hasil = await S.mintaAnalisis(sesi.id);
          if (hasil) { this._terapkanHasil(sesi.id, hasil); this._beritahu(); }
        }
        await this.unduhRiwayatDariServer(diServer);
      } catch (e) { console.warn('Sinkron riwayat:', e.message); }
    }

    /** Hanya ke bawah: lokal tidak pernah ditimpa, sesi berjalan di server dilewati. */
    async unduhRiwayatDariServer(daftar) {
      const S = Sv();
      if (!S.token()) return;
      const dariServer = daftar === undefined ? await S.daftarSesi() : daftar;
      if (!dariServer) return;
      const idLokal = new Set(this._riwayat.map(s => s.id));
      if (this._sesiAktif) idLokal.add(this._sesiAktif.id);
      let nisan = new Set();
      try { nisan = new Set((await DB.muatNisan()).map(n => n.id)); } catch { }
      const baru = dariServer.filter(u => !idLokal.has(u.sesi.id) && !nisan.has(u.sesi.id) && !Sesi.sedangAktif(u.sesi));
      if (!baru.length) return;
      for (const u of baru) {
        let sesi = u.sesi;
        if (u.urlFoto) {
          const blob = await S.unduhFoto(u.urlFoto);
          if (blob) { try { await DB.simpanFoto(sesi.id, blob); sesi = { ...sesi, fotoAda: true }; } catch { } }
        }
        // Stempel dari server dipertahankan (tidak distempel ulang) supaya tidak 409.
        let tersimpan = null;
        try { tersimpan = await DB.simpanSesi(sesi, { stempel: !sesi.diperbaruiPada }); } catch (e) { console.warn(e); }
        this._riwayat.push(tersimpan || sesi);
      }
      this._urutkanRiwayat();
      this._beritahu();
    }

    async _unduhFotoKeSesi(sesi, url) {
      const blob = await Sv().unduhFoto(url);
      if (!blob) return;
      try { await DB.simpanFoto(sesi.id, blob); } catch { return; }
      const i = this._riwayat.findIndex(s => s.id === sesi.id);
      if (i >= 0) { this._riwayat[i] = { ...this._riwayat[i], fotoAda: true }; this._simpan(this._riwayat[i]); this._beritahu(); }
    }

    _urutkanRiwayat() { this._riwayat.sort((a, b) => new Date(b.t0 || b.waktuFoto) - new Date(a.t0 || a.waktuFoto)); }

    /* ---------- pembersihan ---------- */

    /** Hapus semua sesi uji — supaya tester bisa bersih-bersih tanpa melupakan jam. */
    async hapusSesiUji() {
      const uji = this._riwayat.filter(s => s.sesiUji);
      if (!uji.length) return;
      this._riwayat = this._riwayat.filter(s => !s.sesiUji);
      if (this._hasilBelumDibaca?.sesiUji) this._hasilBelumDibaca = null;
      this._beritahu();
      for (const s of uji) { this._lupakanKunci(s.id); try { await DB.hapusSesi(s.id); } catch (e) { console.warn(e); } }
    }

    /**
     * Ganti akun di satu browser: buang riwayat, foto, kalibrasi, dan kotak masuk
     * jam — SEBELUM unggahan pertama. Jam & anchor tetap (milik perangkat keras).
     */
    async hapusDataLokal() {
      clearTimeout(this._tenggat); clearTimeout(this._timerArm); clearTimeout(this._timerUlangUkur);
      this._pengingat.forEach(clearTimeout); this._pengingat = [];
      if (this._sesiAktif) await this.ble.batalkanSesi(this._sesiAktif.id);
      this._sesiAktif = null; this._riwayat = []; this._hasilBelumDibaca = null;
      this._sampelDiterima.clear(); this._kalibrasiTerakhir = null; this._pindaiTerakhir = null;
      this._sesiDiarm = null; this._titikDiarm = null;
      try { await DB.hapusSemuaSesi(); await DB.hapusSemuaKalibrasi(); await DB.hapusSemuaEntriJam(); } catch (e) { console.warn(e); }
      this._beritahu();
    }

    /**
     * Padanan ProfilRepository.sinkronSetelahMasuk(): deteksi pergantian akun.
     * Mengembalikan true bila akunnya berganti dan data lokal sudah dibersihkan.
     */
    async sinkronSetelahMasuk() {
      let email = null;
      try { email = JSON.parse(localStorage.getItem(LS_USER) || 'null')?.email || null; } catch { }
      const sebelumnya = localStorage.getItem(LS_AKUN);
      let ganti = false;
      if (email && sebelumnya && sebelumnya !== email) { await this.hapusDataLokal(); ganti = true; }
      if (email) localStorage.setItem(LS_AKUN, email);
      return ganti;
    }

    dispose() {
      this._dibuang = true;
      clearTimeout(this._tenggat); clearTimeout(this._timerArm); clearTimeout(this._timerUlangUkur);
      this._pengingat.forEach(clearTimeout);
    }
  }

  window.SesiMakanController = SesiMakanController;
})();
