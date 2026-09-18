/**
 * protokol.js — codec protokol jam tangan AsaWatch (docs/protokol-jam.md v1.4).
 *
 * Port dari lib/services/protokol_jam.dart di aplikasi Flutter. Seluruh berkas
 * ini adalah byte ↔ JS dan tidak lebih dari itu: tidak ada Web Bluetooth,
 * tidak ada I/O, tidak ada state. Nomor pasal disebut di tiap bagian supaya
 * perbedaannya dengan dokumen normatif bisa ditelusuri, bukan ditebak.
 *
 * Bila berkas ini dan protokol-jam.md berbeda, salah satunya bug.
 */
(function () {
  'use strict';

  /** Kesalahan bentuk paket: dicatat lalu paketnya dibuang. */
  class GalatProtokol extends Error {
    constructor(pesan) { super(pesan); this.name = 'GalatProtokol'; }
  }

  /** Perintah ke jam gagal dan tidak bisa diperbaiki dengan mencoba lagi. */
  class GalatJam extends Error {
    constructor(pesanPengguna, kode = null) {
      super(pesanPengguna);
      this.name = 'GalatJam';
      this.pesanPengguna = pesanPengguna;
      this.kode = kode;
    }
  }

  /** Versi mayor firmware tidak cocok (§3) — memutus koneksi dengan pesan. */
  class GalatVersiJam extends Error {
    constructor(versiJam, versiApp, pesanPengguna) {
      super(pesanPengguna);
      this.name = 'GalatVersiJam';
      this.versiJam = versiJam;
      this.versiApp = versiApp;
      this.pesanPengguna = pesanPengguna;
    }
  }

  /* ============================================================
     UUID, konstanta, panjang paket (§2.1, §5)
     ============================================================ */
  const ProtokolJam = {
    versiMayorDidukung: 1,
    versiMinorDidukung: 3,

    uuidLayanan: 'a5a70001-6b4c-4e2a-9d31-0f8c2e5a7b10',
    uuidInfo: 'a5a70002-6b4c-4e2a-9d31-0f8c2e5a7b10',
    uuidKontrol: 'a5a70003-6b4c-4e2a-9d31-0f8c2e5a7b10',
    uuidPeristiwa: 'a5a70004-6b4c-4e2a-9d31-0f8c2e5a7b10',
    uuidSampel: 'a5a70005-6b4c-4e2a-9d31-0f8c2e5a7b10',
    uuidStatus: 'a5a70006-6b4c-4e2a-9d31-0f8c2e5a7b10',

    /** Baterai memakai Battery Service standar (§2.1). */
    uuidLayananBaterai: '0000180f-0000-1000-8000-00805f9b34fb',
    uuidLevelBaterai: '00002a19-0000-1000-8000-00805f9b34fb',

    // Panjang minimum tiap paket. Yang lebih panjang diterima (§3).
    panjangInfo: 20,
    panjangSampel: 31,
    panjangPeristiwa: 26,
    panjangStatus: 8,
    panjangStatusKemajuan: 10,   // sejak v1.4 (§5.5)

    // Denyut pengukuran (§5.5/§5.6) — dalam milidetik.
    denyutUkurMs: 2000,
    denyutUkurBasiMs: 8000,
    batasUkurMs: 315000,          // langit-langit, bukan kesabaran
    tenggatHasilUkurMs: 8000,     // Status padam → Sampel boleh menyusul
    tenggatMulaiUkurMs: 20000,    // ACK datang, bit0 belum menyala
    ambangMacetMs: 60000,         // persen diam → "rapatkan jam"

    /** MTU minimum agar Sampel 31 byte utuh (§8). Web tidak bisa memintanya. */
    mtuMinimum: 35,

    /** Batas retry write (§7). */
    timeoutTulisMs: 5000,
    maksPercobaan: 3,

    /** Backoff reconnect (§8). */
    backoffAwalMs: 1000,
    backoffMaksMs: 60000,
    backoffMaksLamaMs: 5 * 60000,
    ambangBackoffLamaMs: 10 * 60000,

    /** Jeda berikutnya sesudah satu percobaan sambung gagal — fungsi murni. */
    backoffBerikutnya(sekarangMs, sejakGagalPertamaMs) {
      const maks = sejakGagalPertamaMs >= ProtokolJam.ambangBackoffLamaMs
        ? ProtokolJam.backoffMaksLamaMs : ProtokolJam.backoffMaksMs;
      const berikutnya = sekarangMs * 2;
      return berikutnya > maks ? maks : berikutnya;
    },

    /** Nama iklan jam selalu diawali ini (§2.2). */
    awalanNama: 'AsaWatch',
  };

  /** Opcode karakteristik Kontrol (§5.1). */
  const Opcode = {
    anchorWaktu: 0x01,
    armSesi: 0x02,
    batalSesi: 0x03,
    ukur: 0x04,
    ukurSekarang: 0x05,
    setKalibrasi: 0x06,
    sinkron: 0x07,
    ackEvent: 0x08,
    mulaiSesi: 0x09,   // v1.2 — tekan tombol "Selesai Makan" milik jam dari aplikasi
    armTitik: 0x0A,    // v1.3 — nyalakan tombol ukur untuk satu titik
    nama(op) {
      return {
        0x01: 'ANCHOR_WAKTU', 0x02: 'ARM_SESI', 0x03: 'BATAL_SESI', 0x04: 'UKUR',
        0x05: 'UKUR_SEKARANG', 0x06: 'SET_KALIBRASI', 0x07: 'SINKRON', 0x08: 'ACK_EVENT',
        0x09: 'MULAI_SESI', 0x0A: 'ARM_TITIK',
      }[op] || ('opcode 0x' + op.toString(16));
    },
  };

  /** Jenis peristiwa pada karakteristik Peristiwa (§5.4). */
  const JenisPeristiwa = {
    tombolSelesaiMakan: 0x01,
    sesiKedaluwarsa: 0x02,
    sesiDibatalkanJam: 0x03,
    ukurGagal: 0x04,
    ack: 0x05,
    nak: 0x06,
    bufferPenuh: 0x07,
    boot: 0x08,
    dikenal(kode) { return kode >= 0x01 && kode <= 0x08; },
    nama(kode) {
      return {
        0x01: 'TOMBOL_SELESAI_MAKAN', 0x02: 'SESI_KEDALUWARSA', 0x03: 'SESI_DIBATALKAN_JAM',
        0x04: 'UKUR_GAGAL', 0x05: 'ACK', 0x06: 'NAK', 0x07: 'BUFFER_PENUH', 0x08: 'BOOT',
      }[kode] || ('peristiwa 0x' + kode.toString(16));
    },
  };

  /**
   * Kode error pada payload NAK (§7). `bolehRetry` ada di sini, bukan di
   * pemanggil, karena tabel §7 satu-satunya sumber kebenarannya.
   */
  const KodeGalatJam = {
    0x01: { kode: 0x01, nama: 'opcodeTidakDikenal', pesan: 'Perintah tidak dikenali jam.', bolehRetry: false },
    0x02: { kode: 0x02, nama: 'payloadTidakValid', pesan: 'Isi perintah tidak valid.', bolehRetry: false },
    0x03: { kode: 0x03, nama: 'belumDiarm', pesan: 'Jam belum disiapkan untuk sesi ini.', bolehRetry: false },
    0x04: { kode: 0x04, nama: 'sesiTidakDikenal', pesan: 'Sesi sudah tidak dikenal jam.', bolehRetry: false },
    0x05: { kode: 0x05, nama: 'sedangMengukur', pesan: 'Jam sedang mengukur.', bolehRetry: true },
    0x06: { kode: 0x06, nama: 'bateraiRendah', pesan: 'Baterai jam terlalu rendah untuk mengukur.', bolehRetry: false },
    0x07: { kode: 0x07, nama: 'sensorGagal', pesan: 'Sensor jam gagal membaca.', bolehRetry: false },
    0x08: { kode: 0x08, nama: 'kalibrasiBelumAda', pesan: 'Jam belum dikalibrasi, tekanan darah dikirim tanpa koreksi.', bolehRetry: false },
    0x09: { kode: 0x09, nama: 'bootIdTidakCocok', pesan: 'Jam sempat menyala ulang.', bolehRetry: true },
    dariKode(kode) { return KodeGalatJam[kode] || null; },
    /** Jeda sebelum percobaan berikutnya, hanya bermakna bila bolehRetry. */
    jedaRetryMs(g) { return g && g.kode === 0x05 ? 5000 : 300; },
  };

  /** Status sesi menurut mesin status firmware (§9). */
  const StatusSesiJam = ['idle', 'armed', 'running'];

  /**
   * Kalimat siap tampil untuk setiap cara `UKUR_SEKARANG` berakhir tanpa
   * hasil (§5.1, §5.5). Jam palsu wajib memakai kalimat yang sama persis.
   */
  const PesanUkur = {
    tidakMulai: 'Jam menerima perintahnya tetapi tidak mulai mengukur. Lepas lalu pasang kembali jam di pergelangan, lalu coba lagi.',
    denyutBerhenti: 'Jam berhenti mengabari di tengah pengukuran. Pastikan jam menyala dan dekat dengan ponsel, lalu coba lagi.',
    terputus: 'Jam terputus sebelum pengukuran selesai. Dekatkan jam ke ponsel, lalu coba lagi.',
    jamMenyerah: 'Jam tidak berhasil membaca satu pun angka. Rapatkan jam di pergelangan, diamkan tangan, lalu ukur lagi.',
    hasilTidakSampai: 'Jam selesai mengukur, tetapi hasilnya tidak sampai ke ponsel. Coba ukur sekali lagi.',
    terlaluLama: 'Pengukuran berjalan terlalu lama dan dihentikan. Rapatkan jam di pergelangan, lalu coba lagi.',
  };

  /* ============================================================
     Pembacaan
     ============================================================ */
  function _periksa(data, minimal, nama) {
    const u8 = data instanceof Uint8Array ? data
      : data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
    if (u8.length < minimal) {
      throw new GalatProtokol(`Paket ${nama} butuh minimal ${minimal} byte, dapat ${u8.length}.`);
    }
    // Byte berlebih dibiarkan: firmware ber-versi_minor lebih tinggi boleh
    // menambah field di belakang, dan §3 mewajibkan aplikasi mengabaikannya.
    const salinan = new Uint8Array(u8);
    return { b: new DataView(salinan.buffer), u8: salinan };
  }

  /** Membaca 20 byte handshake (§3). */
  function bacaInfo(data) {
    const { b, u8 } = _periksa(data, ProtokolJam.panjangInfo, 'Info');
    const info = {
      versiMayor: b.getUint8(0),
      versiMinor: b.getUint8(1),
      serial: _hex(u8.subarray(2, 8)),
      firmwareBuild: b.getUint16(8, true),
      kapasitasBuffer: b.getUint8(10),
      kemampuan: bacaKemampuan(b.getUint8(11)),
      bootId: b.getUint16(12, true),
      uptimeS: b.getUint32(14, true),
      punyaAnchor: (b.getUint8(18) & 0x01) !== 0,
    };
    return info;
  }

  /** Bitfield kemampuan (§3). Detak jantung tidak punya bit — selalu ada. */
  function bacaKemampuan(bit) {
    return {
      bit,
      gulaDarah: (bit & 0x01) !== 0,
      tekananDarah: (bit & 0x02) !== 0,
      spo2: (bit & 0x04) !== 0,
      ota: (bit & 0x08) !== 0,
    };
  }

  /** Melempar GalatVersiJam bila mayor tidak cocok (§3). */
  function periksaVersi(info) {
    if (info.versiMayor === ProtokolJam.versiMayorDidukung) return;
    throw new GalatVersiJam(info.versiMayor, ProtokolJam.versiMayorDidukung,
      info.versiMayor > ProtokolJam.versiMayorDidukung
        ? 'Jam perlu aplikasi versi lebih baru.'
        : 'Firmware jam perlu diperbarui.');
  }

  /** Membaca 31 byte sampel (§5.2). Sentinel 0 → null. */
  function bacaSampel(data) {
    const { b, u8 } = _periksa(data, ProtokolJam.panjangSampel, 'Sampel');
    const flag = b.getUint8(18);
    const index = b.getUint8(17);
    if (index > 3) {
      // Empat titik ukur adalah janji model; UI mengindeks sampel[index] langsung.
      throw new GalatProtokol(`Index sampel ${index} di luar 0..3.`);
    }
    return {
      jenis: 'sampel',
      seq: b.getUint8(0),
      sesiId: binerKeUuid(u8.subarray(1, 17)),
      index,
      dariBuffer: (flag & 0x01) !== 0,
      waktuTidakPasti: (flag & 0x02) !== 0,
      bootId: b.getUint16(19, true),
      uptimeS: b.getUint32(21, true),
      gulaDarah: _nolJadiNull(b.getUint16(25, true)),
      detakJantung: _nolJadiNull(b.getUint8(27)),
      sistolik: _nolJadiNull(b.getUint8(28)),
      diastolik: _nolJadiNull(b.getUint8(29)),
      spo2: _nolJadiNull(b.getUint8(30)),
    };
  }

  /** Membaca 26 byte peristiwa (§5.4). sesiId 16 byte nol → null. */
  function bacaPeristiwa(data) {
    const { b, u8 } = _periksa(data, ProtokolJam.panjangPeristiwa, 'Peristiwa');
    const jenis = b.getUint8(1);
    if (!JenisPeristiwa.dikenal(jenis)) {
      throw new GalatProtokol(`Jenis peristiwa 0x${jenis.toString(16)} tidak dikenal.`);
    }
    const flag = b.getUint8(24);
    const sesiId = u8.subarray(2, 18);
    const payload = b.getUint8(25);
    return {
      jenis: 'peristiwa',
      seq: b.getUint8(0),
      kode: jenis,
      sesiId: sesiId.every(x => x === 0) ? null : binerKeUuid(sesiId),
      bootId: b.getUint16(18, true),
      uptimeS: b.getUint32(20, true),
      dariBuffer: (flag & 0x01) !== 0,
      waktuTidakPasti: (flag & 0x02) !== 0,
      payload,
      /** Opcode yang di-ack — hanya bermakna untuk ACK. */
      opcodeDiack: payload,
      /** Kode error — hanya bermakna untuk NAK; null = kode baru dari firmware. */
      kodeGalat: KodeGalatJam.dariKode(payload),
    };
  }

  /** Membaca paket status (§5.5) — 8 byte, atau 10 sejak v1.4. */
  function bacaStatus(data) {
    const { b, u8 } = _periksa(data, ProtokolJam.panjangStatus, 'Status');
    const kode = b.getUint8(0);
    if (kode > 2) throw new GalatProtokol(`Status sesi jam ${kode} tidak dikenal.`);
    const flag = b.getUint8(3);
    const punyaKemajuan = u8.length >= ProtokolJam.panjangStatusKemajuan;
    return {
      statusSesi: StatusSesiJam[kode],
      sampelTertunda: b.getUint8(1),
      baterai: b.getUint8(2),
      sedangMengukur: (flag & 0x01) !== 0,
      kalibrasiTersimpan: (flag & 0x02) !== 0,
      bateraiKritis: (flag & 0x04) !== 0,
      punyaAnchor: (flag & 0x08) !== 0,
      uptimeS: b.getUint32(4, true),
      // Dibaca lewat panjang paketnya sendiri, bukan versi_minor handshake:
      // null berarti firmware ≤ v1.3 tidak berdenyut — bukan kemajuan nol.
      ukurPersen: punyaKemajuan ? b.getUint8(8) : null,
      ukurSisaDetik: punyaKemajuan ? b.getUint8(9) : null,
      punyaKemajuan,
    };
  }

  /* ============================================================
     Penulisan
     ============================================================ */

  /** ANCHOR_WAKTU (§5.1): 4B epoch UTC LE + 2B bootId. */
  function tulisAnchorWaktu(epochMs, bootId) {
    const data = new Uint8Array(7);
    const b = new DataView(data.buffer);
    b.setUint8(0, Opcode.anchorWaktu);
    b.setUint32(1, Math.floor(epochMs / 1000) >>> 0, true);
    b.setUint16(5, bootId & 0xffff, true);
    return data;
  }

  const tulisArmSesi = (sesiId) => _opcodeDenganSesi(Opcode.armSesi, sesiId);
  /** MULAI_SESI (§5.1) — payload sesiId saja, TANPA waktu; itulah isi perintahnya. */
  const tulisMulaiSesi = (sesiId) => _opcodeDenganSesi(Opcode.mulaiSesi, sesiId);
  const tulisBatalSesi = (sesiId) => _opcodeDenganSesi(Opcode.batalSesi, sesiId);

  /** UKUR (§5.1): 16B sesiId + 1B index. */
  function tulisUkur(sesiId, index) {
    _periksaIndex(index);
    const data = new Uint8Array(18);
    data[0] = Opcode.ukur;
    data.set(uuidKeBiner(sesiId), 1);
    data[17] = index;
    return data;
  }

  const tulisUkurSekarang = () => Uint8Array.of(Opcode.ukurSekarang);

  /** ARM_TITIK (§5.1, v1.3): sesiId + index, tanpa waktu — dikirim saat jendela terbuka. */
  function tulisArmTitik(sesiId, index) {
    _periksaIndex(index);
    const data = new Uint8Array(18);
    data[0] = Opcode.armTitik;
    data.set(uuidKeBiner(sesiId), 1);
    data[17] = index;
    return data;
  }

  /** SET_KALIBRASI (§5.1): offset (int16 LE ×2), bukan nilai referensi. */
  function tulisSetKalibrasi(offsetSistolik, offsetDiastolik) {
    const data = new Uint8Array(5);
    const b = new DataView(data.buffer);
    b.setUint8(0, Opcode.setKalibrasi);
    b.setInt16(1, _batasInt16(offsetSistolik), true);
    b.setInt16(3, _batasInt16(offsetDiastolik), true);
    return data;
  }

  /** SINKRON (§5.1): kirim ulang mulai seq berikutnya setelah seqTerakhir (0 = belum pernah). */
  const tulisSinkron = (seqTerakhir) => Uint8Array.of(Opcode.sinkron, _batasUint8(seqTerakhir));

  /** ACK_EVENT (§5.1): hanya setelah entrinya tersimpan permanen (§6). */
  const tulisAckEvent = (seq) => Uint8Array.of(Opcode.ackEvent, _batasUint8(seq));

  function _periksaIndex(index) {
    if (index < 0 || index > 255) throw new GalatProtokol(`Index sampel ${index} tidak muat dalam 1 byte.`);
  }

  function _opcodeDenganSesi(opcode, sesiId) {
    const data = new Uint8Array(17);
    data[0] = opcode;
    data.set(uuidKeBiner(sesiId), 1);
    return data;
  }

  /* ============================================================
     Id sesi
     ============================================================ */

  /** Id sesi baru, UUID v4 kanonik — protokol membawa sesiId sebagai 16 byte. */
  function buatIdSesi() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return binerKeUuid(b);
  }

  /** 16 byte nol: bukan sesi — "tidak relevan" (§5.4) / jawaban UKUR_SEKARANG (§5.1). */
  const uuidSesiKosong = '00000000-0000-0000-0000-000000000000';
  const sesiIdNyata = (sesiId) => !!sesiId && sesiId !== uuidSesiKosong;

  /** UUID kanonik → 16 byte (urutan teks, RFC 4122). */
  function uuidKeBiner(uuid) {
    const hex = String(uuid).replace(/-/g, '');
    if (hex.length !== 32) throw new GalatProtokol(`Id sesi "${uuid}" bukan UUID 16 byte.`);
    const data = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      const nilai = parseInt(hex.substr(i * 2, 2), 16);
      if (Number.isNaN(nilai)) throw new GalatProtokol(`Id sesi "${uuid}" bukan heksadesimal.`);
      data[i] = nilai;
    }
    return data;
  }

  /** 16 byte → UUID kanonik berhuruf kecil. */
  function binerKeUuid(data) {
    if (data.length !== 16) throw new GalatProtokol(`Id sesi butuh 16 byte, dapat ${data.length}.`);
    const h = _hex(data);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /** Apakah id bisa dikirim ke jam sama sekali. */
  function idSesiValid(id) {
    try { uuidKeBiner(id); return true; } catch { return false; }
  }

  /* ============================================================
     Bantuan
     ============================================================ */
  const _nolJadiNull = (n) => (n === 0 ? null : n);
  const _batasInt16 = (n) => Math.max(-32768, Math.min(32767, Math.round(n)));
  const _batasUint8 = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const _hex = (data) => Array.from(data, b => b.toString(16).padStart(2, '0')).join('');

  /** Ringkasan satu paket untuk log diagnostik. */
  function ringkasPaket(nama, data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    return `${nama}[${u8.length}] ${btoa(String.fromCharCode(...u8))}`;
  }

  window.Protokol = {
    GalatProtokol, GalatJam, GalatVersiJam,
    ProtokolJam, Opcode, JenisPeristiwa, KodeGalatJam, StatusSesiJam, PesanUkur,
    bacaInfo, bacaKemampuan, periksaVersi, bacaSampel, bacaPeristiwa, bacaStatus,
    tulisAnchorWaktu, tulisArmSesi, tulisMulaiSesi, tulisBatalSesi, tulisUkur,
    tulisUkurSekarang, tulisArmTitik, tulisSetKalibrasi, tulisSinkron, tulisAckEvent,
    buatIdSesi, uuidSesiKosong, sesiIdNyata, uuidKeBiner, binerKeUuid, idSesiValid,
    ringkasPaket,
  };
})();
