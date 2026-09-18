/**
 * model.js — model sesi makan dan seluruh nilai turunannya.
 *
 * Port dari lib/models/sesi_makan.dart, jadwal_sesi.dart, dan analisis_sesi.dart
 * (docs/rancangan-ui-sesi-makan.md §12, docs/jadwal-titik-ukur.md). Sesi
 * disimpan sebagai objek polos (camelCase) dengan bentuk yang sama dengan
 * JSON §5.2; semua nilai turunan (baseline, puncak, delta, pemulihan, verdict)
 * dihitung di sini, tidak pernah disimpan.
 */
(function () {
  'use strict';

  /* ============================================================
     Enum & label
     ============================================================ */
  const StatusSesi = {
    draft: 'draft',                       // foto ada, tombol jam menyala, t0 ditunggu
    menungguPerangkat: 'menungguPerangkat', // foto ada tapi jam belum tersambung
    berjalan: 'berjalan',
    selesai: 'selesai',
    tidakLengkap: 'tidakLengkap',
    dibatalkan: 'dibatalkan',
    label(s) {
      return {
        draft: 'Siap dimulai', menungguPerangkat: 'Jam terputus', berjalan: 'Sesi berjalan',
        selesai: 'Selesai', tidakLengkap: 'Tidak lengkap', dibatalkan: 'Dibatalkan',
      }[s] || s;
    },
    sedangAktif: (s) => s === 'draft' || s === 'menungguPerangkat' || s === 'berjalan',
  };

  /** Nama status di kawat snake_case (§5.2) — StatusSesi bukan nama kawat. */
  const _statusKawat = {
    draft: 'draft', menungguPerangkat: 'menunggu_perangkat', berjalan: 'berjalan',
    selesai: 'selesai', tidakLengkap: 'tidak_lengkap', dibatalkan: 'dibatalkan',
  };
  const statusKeKawat = (s) => _statusKawat[s];
  const statusDariKawat = (k) => Object.keys(_statusKawat).find(s => _statusKawat[s] === k) || null;

  const StatusSampel = { menunggu: 'menunggu', terisi: 'terisi', terlewat: 'terlewat' };

  const WaktuMakan = {
    sarapan: 'sarapan', makanSiang: 'makanSiang', makanMalam: 'makanMalam', camilan: 'camilan',
    label: (w) => ({ sarapan: 'Sarapan', makanSiang: 'Makan Siang', makanMalam: 'Makan Malam', camilan: 'Camilan' })[w] || w,
    semua: ['sarapan', 'makanSiang', 'makanMalam', 'camilan'],
  };

  const KualitasRespons = {
    landai: 'landai', sedang: 'sedang', lonjakan: 'lonjakan', belumLengkap: 'belumLengkap',
    label: (k) => ({ landai: 'Landai', sedang: 'Sedang', lonjakan: 'Lonjakan', belumLengkap: 'Belum lengkap' })[k] || k,
    semua: ['landai', 'sedang', 'lonjakan', 'belumLengkap'],
  };

  /** Ambang delta puncak (mg/dL) yang memisahkan ketiga kualitas respons. */
  const ambangResponsLandai = 30;
  const ambangResponsSedang = 60;
  /** Selisih dari baseline yang masih dianggap "kembali normal". */
  const ambangPemulihan = 10;

  /* ============================================================
     Jadwal titik ukur — data per sesi, bukan konstanta
     ============================================================ */
  const _minimal = (n, lantai) => (n < lantai ? lantai : n);

  function titikJadwal({ index, detikNominal, label, jendelaAwal = null, jendelaAkhir = null, ambangNormalisasi = 120 }) {
    const t = { index, detikNominal, label, jendelaAwal, jendelaAkhir, ambangNormalisasi };
    t.berjendela = jendelaAwal !== null && jendelaAkhir !== null;
    // Titik tak berjendela tidak pernah "belum waktunya" / "telat": dipicu peristiwa.
    t.belumWaktunya = (d) => t.berjendela && d < jendelaAwal;
    t.telat = (d) => t.berjendela && d > jendelaAkhir;
    // Selisih di bawah ambang dianggap kosmetik dan dinormalkan ke nominal.
    t.normalkan = (terukur) => (Math.abs(terukur - detikNominal) < ambangNormalisasi ? detikNominal : terukur);
    t.dibagi = (f) => titikJadwal({
      index, label,
      detikNominal: detikNominal === 0 ? 0 : _minimal(Math.floor(detikNominal / f), 1),
      jendelaAwal: jendelaAwal === null ? null : Math.floor(jendelaAwal / f),
      jendelaAkhir: jendelaAkhir === null ? null : Math.floor(jendelaAkhir / f),
      ambangNormalisasi: _minimal(Math.floor(ambangNormalisasi / f), 2),
    });
    return t;
  }

  function jadwalSesi({ titik, tenggatSetelahAkhirDetik, uji = false }) {
    const j = { titik, tenggatSetelahAkhirDetik, uji };
    j.titikIndex = (i) => titik.find(t => t.index === i) || null;
    j.jumlahTitik = titik.length;
    j.detikTitikTerakhir = Math.max(...titik.map(t => t.detikNominal));
    j.label = titik.map(t => t.label);
    // Dibagi dari jadwal sungguhan, bukan ditulis ulang: dua daftar yang harus
    // dijaga sebanding pada akhirnya berselisih. Lantai 5 detik pada tenggat:
    // ia masa tenggang bagi sampel dari buffer, bukan perlombaan.
    j.dibagi = (f) => jadwalSesi({
      titik: titik.map(t => t.dibagi(f)),
      tenggatSetelahAkhirDetik: _minimal(Math.floor(tenggatSetelahAkhirDetik / f), 5),
      uji: true,
    });
    return j;
  }

  /**
   * Jadwal sungguhan — jendela asimetris adalah inti aturannya: terlalu cepat
   * ditahan (masih bisa diulang), terlalu lambat diterima dan ditandai.
   */
  const jadwalNormal = jadwalSesi({
    titik: [
      titikJadwal({ index: 0, detikNominal: 0, label: 'Baseline' }),
      titikJadwal({ index: 1, detikNominal: 0, label: 'Selesai makan' }),
      titikJadwal({ index: 2, detikNominal: 3600, label: '+1 jam', jendelaAwal: 3300, jendelaAkhir: 4200 }),
      titikJadwal({ index: 3, detikNominal: 7200, label: '+2 jam', jendelaAwal: 6600, jendelaAkhir: 9000 }),
    ],
    tenggatSetelahAkhirDetik: 30 * 60,
  });

  /** Faktor bawaan mode uji: tiap "menit" jadwal sungguhan jadi satu detik. */
  const faktorJadwalUji = 60;
  const jadwalUjiBawaan = jadwalNormal.dibagi(faktorJadwalUji);
  const labelTitikSampel = jadwalNormal.label;

  /* ============================================================
     Sampel & sesi
     ============================================================ */
  const KUNCI_METRIK = ['gulaDarah', 'detakJantung', 'sistolik', 'diastolik', 'spo2'];

  function sampelMenunggu(index, detikRelatifT0) {
    return {
      index, detikRelatifT0, status: StatusSampel.menunggu, dariBuffer: false,
      gulaDarah: null, detakJantung: null, sistolik: null, diastolik: null, spo2: null,
    };
  }

  const Sampel = {
    terisi: (s) => s.status === StatusSampel.terisi,
    label: (s) => labelTitikSampel[s.index] ?? ('Titik ' + s.index),
    /** Waktu ukur diturunkan dari t0, tidak disimpan (§12.2). */
    waktuUkur: (s, t0) => new Date(new Date(t0).getTime() + s.detikRelatifT0 * 1000),
    tekananDarah: (s) => (s.sistolik == null || s.diastolik == null) ? null : `${s.sistolik}/${s.diastolik}`,
    adaNilai: (s) => KUNCI_METRIK.some(k => s[k] != null),
  };

  /**
   * Helper murni atas objek sesi { id, fotoAda, waktuFoto, t0, status, hasil,
   * sampel[4], waktuTidakPasti, sesiUji, diperbaruiPada, dihapusPada }.
   */
  const Sesi = {
    /** Jadwal yang berlaku: diturunkan dari sesiUji, bukan rakitan yang berjalan. */
    jadwal: (s) => (s.sesiUji ? (Model.jadwalUji || jadwalUjiBawaan) : jadwalNormal),

    sedangAktif: (s) => StatusSesi.sedangAktif(s.status),

    /** Pengukuran ini tiba di luar jendela toleransi titiknya (§3). Hanya "telat". */
    sampelTelat(s, sp) {
      if (!Sampel.terisi(sp)) return false;
      const t = Sesi.jadwal(s).titikIndex(sp.index);
      return t ? t.telat(sp.detikRelatifT0) : false;
    },

    /** Label titik yang ikut jujur saat pengukurannya meleset ("+1 jam 24 mnt"). */
    labelSampel(s, sp) {
      if (!Sampel.terisi(sp) || !Sesi.sampelTelat(s, sp)) return Sampel.label(sp);
      const menit = Math.round(sp.detikRelatifT0 / 60);
      const jam = Math.floor(menit / 60), sisa = menit % 60;
      if (jam === 0) return `+${sisa} mnt`;
      return sisa === 0 ? `+${jam} jam` : `+${jam} jam ${sisa} mnt`;
    },

    baseline: (s) => (s.sampel[0] && Sampel.terisi(s.sampel[0]) ? s.sampel[0] : null),
    gulaDarahBaseline: (s) => Sesi.baseline(s)?.gulaDarah ?? null,

    sampelBerikutnya: (s) => s.sampel.find(sp => sp.status === StatusSampel.menunggu) || null,

    jadwalBerikutnya(s) {
      const b = Sesi.sampelBerikutnya(s);
      if (!s.t0 || !b) return null;
      return Sampel.waktuUkur(b, s.t0);
    },

    sampelTerisi: (s) => s.sampel.filter(Sampel.terisi),
    adaSampelTerlewat: (s) => s.sampel.some(sp => sp.status === StatusSampel.terlewat),

    /** Sampel dengan gula darah tertinggi, mengabaikan baseline. */
    sampelPuncak(s) {
      let puncak = null;
      for (const sp of s.sampel) {
        if (sp.index === 0 || !Sampel.terisi(sp) || sp.gulaDarah == null) continue;
        if (!puncak || sp.gulaDarah > puncak.gulaDarah) puncak = sp;
      }
      return puncak;
    },
    puncakGulaDarah: (s) => Sesi.sampelPuncak(s)?.gulaDarah ?? null,

    deltaPuncak(s) {
      const p = Sesi.puncakGulaDarah(s), d = Sesi.gulaDarahBaseline(s);
      return (p == null || d == null) ? null : p - d;
    },

    /**
     * Detik sejak t0 saat gula darah kembali ke sekitar baseline; null = belum.
     * Yang dibandingkan adalah detikRelatifT0, bukan index — urutan waktu.
     */
    waktuPemulihanDetik(s) {
      const dasar = Sesi.gulaDarahBaseline(s), puncak = Sesi.sampelPuncak(s);
      if (dasar == null || !puncak) return null;
      const urut = [...s.sampel].sort((a, b) => a.detikRelatifT0 - b.detikRelatifT0);
      for (const sp of urut) {
        if (sp.detikRelatifT0 <= puncak.detikRelatifT0 || !Sampel.terisi(sp) || sp.gulaDarah == null) continue;
        if (sp.gulaDarah <= dasar + ambangPemulihan) return sp.detikRelatifT0;
      }
      return null;
    },

    /** Diturunkan dari jam t0 (foto bila t0 belum ada); null bila waktuTidakPasti. */
    waktuMakan(s) {
      if (s.waktuTidakPasti) return null;
      const jam = new Date(s.t0 || s.waktuFoto).getHours();
      if (jam >= 5 && jam < 11) return WaktuMakan.sarapan;
      if (jam >= 11 && jam < 15) return WaktuMakan.makanSiang;
      if (jam >= 17 && jam < 22) return WaktuMakan.makanMalam;
      return WaktuMakan.camilan;
    },
    labelWaktuMakan: (s) => { const w = Sesi.waktuMakan(s); return w ? WaktuMakan.label(w) : 'Waktu tidak pasti'; },

    kualitasRespons(s) {
      const delta = Sesi.deltaPuncak(s);
      if (delta == null || Sesi.sedangAktif(s)) return KualitasRespons.belumLengkap;
      if (delta <= ambangResponsLandai) return KualitasRespons.landai;
      if (delta <= ambangResponsSedang) return KualitasRespons.sedang;
      return KualitasRespons.lonjakan;
    },

    kalori: (s) => s.hasil?.total?.kalori ?? null,

    /** Kalimat Bahasa Indonesia untuk kartu hasil (§12.3). */
    verdict(s) {
      switch (s.status) {
        case StatusSesi.dibatalkan: return 'Sesi dibatalkan.';
        case StatusSesi.draft: return 'Foto sudah diambil. Tekan tombol Selesai Makan di jam untuk memulai sesi.';
        case StatusSesi.menungguPerangkat: return 'Jam belum tersambung, jadi tombol Selesai Makan di jam belum bisa dipakai.';
        case StatusSesi.berjalan: return 'Sesi masih berjalan, menunggu sampel berikutnya.';
      }
      const delta = Sesi.deltaPuncak(s);
      if (delta == null) return 'Data gula darah belum cukup untuk menilai respons sesi ini.';
      const pemulihan = Sesi.waktuPemulihanDetik(s);
      const bagian = [
        `puncak ${delta >= 0 ? '+' : ''}${delta} mg/dL`,
        pemulihan != null ? `normal dalam ${jamRingkas(pemulihan)}` : 'belum kembali ke baseline dalam 2 jam',
      ];
      if (Sesi.adaSampelTerlewat(s)) bagian.push('ada sampel terlewat');
      return bagian.join(' · ');
    },

    /** Salinan dangkal dengan perubahan — sesi tidak pernah dimutasi di tempat. */
    salin: (s, ubah) => ({ ...s, sampel: (ubah.sampel || s.sampel).map(sp => ({ ...sp })), ...ubah }),
  };

  function jamRingkas(detik) {
    const menit = Math.round(detik / 60);
    if (menit % 60 === 0) return `${menit / 60} jam`;
    return `${menit} menit`;
  }

  /* ============================================================
     Gizi — tidak diketahui BUKAN nol
     ============================================================ */
  const ZatGizi = [
    { kunci: 'kalori', label: 'Kalori', satuan: ' kcal' },
    { kunci: 'karbohidrat', label: 'Karbohidrat', satuan: ' g' },
    { kunci: 'protein', label: 'Protein', satuan: ' g' },
    { kunci: 'lemak', label: 'Lemak', satuan: ' g' },
    { kunci: 'gulaTotal', label: 'Gula Total', satuan: ' g', kawat: 'gula_total' },
    { kunci: 'serat', label: 'Serat', satuan: ' g' },
  ];
  ZatGizi.forEach(z => { z.kawat = z.kawat || z.kunci; });
  ZatGizi.dariKawat = (k) => ZatGizi.find(z => z.kawat === k) || null;

  const Nutrisi = {
    kosong: () => ({ kalori: 0, karbohidrat: 0, protein: 0, lemak: 0, gulaTotal: 0, serat: 0 }),
    tidakDiketahui: () => ({ kalori: null, karbohidrat: null, protein: null, lemak: null, gulaTotal: null, serat: null }),
    zatTidakDiketahui: (n) => ZatGizi.filter(z => n[z.kunci] == null).map(z => z.kunci),
    /** null × faktor tetap null: setengah dari entah berapa tetap entah berapa. */
    kali: (n, f) => Object.fromEntries(ZatGizi.map(z => [z.kunci, n[z.kunci] == null ? null : n[z.kunci] * f])),
    /** null + null tetap null; salah satu diketahui = total parsial (ditandai di tempat lain). */
    jumlah: (a, b) => Object.fromEntries(ZatGizi.map(z => {
      const x = a[z.kunci], y = b[z.kunci];
      return [z.kunci, (x == null && y == null) ? null : (x ?? 0) + (y ?? 0)];
    })),
  };

  const HasilDeteksi = {
    /** Apakah zat pada total boleh dibaca sebagai angka pasti. */
    pasti: (h, kunci) => h.total[kunci] != null && !(h.zatTidakLengkap || []).includes(kunci),
    ringkasanNama: (h) => (!h.makanan?.length ? 'Makanan' : h.makanan.map(m => m.nama).join(' & ')),
    /** Hasil dengan daftar makanan yang sudah dikoreksi user — total dihitung ulang. */
    dikoreksi(h, makananBaru) {
      let total = Nutrisi.tidakDiketahui();
      for (const m of makananBaru) total = Nutrisi.jumlah(total, m.nutrisi);
      return {
        ...h,
        makanan: makananBaru,
        total,
        zatTidakLengkap: ZatGizi.filter(z => makananBaru.some(m => m.nutrisi[z.kunci] == null)).map(z => z.kunci),
        dikoreksiUser: true,
      };
    },
    /** Koreksi satu item: mengubah gram ikut menskalakan nutrisinya. */
    salinItem(m, { nama, porsi, estimasiGram } = {}) {
      const gramBaru = estimasiGram ?? m.estimasiGram;
      const faktor = m.estimasiGram <= 0 ? 1 : gramBaru / m.estimasiGram;
      return { nama: nama ?? m.nama, porsi: porsi ?? m.porsi, estimasiGram: gramBaru, nutrisi: Nutrisi.kali(m.nutrisi, faktor) };
    },
  };

  /* ============================================================
     Kalibrasi tekanan darah — satu putaran, penjaganya besar koreksi
     ============================================================ */
  const SisiPergelangan = {
    kiri: 'kiri', kanan: 'kanan',
    label: (s) => (s === 'kiri' ? 'Tangan kiri' : 'Tangan kanan'),
    seberang: (s) => (s === 'kiri' ? 'kanan' : 'kiri'),
    labelLengan: (s) => (s === 'kiri' ? 'lengan kiri' : 'lengan kanan'),
  };

  const sistolikMinimum = 70, sistolikMaksimum = 250, diastolikMinimum = 40, diastolikMaksimum = 150;

  /** Alasan sepasang angka tensimeter ditolak, atau null bila wajar. Penyaring salah ketik. */
  function galatReferensiTensimeter(sistolik, diastolik) {
    if (sistolik == null || diastolik == null) return null;
    if (sistolik < sistolikMinimum || sistolik > sistolikMaksimum)
      return `Sistolik biasanya antara ${sistolikMinimum} dan ${sistolikMaksimum} mmHg. Periksa lagi angka di tensimeter.`;
    if (diastolik < diastolikMinimum || diastolik > diastolikMaksimum)
      return `Diastolik biasanya antara ${diastolikMinimum} dan ${diastolikMaksimum} mmHg. Periksa lagi angka di tensimeter.`;
    if (sistolik <= diastolik)
      return 'Sistolik harus lebih besar dari diastolik. Angka atas di kolom kiri, angka bawah di kolom kanan.';
    return null;
  }

  const Kalibrasi = {
    jumlahPutaran: 1,
    offsetMaksimum: 30,
    jedaAntarPutaranDetik: 60,
    sebaranMaksimum: 12,
    masaBerlakuHari: 28,

    offsetPutaran: (p) => ({ sistolik: p.sistolikReferensi - p.sistolikJam, diastolik: p.diastolikReferensi - p.diastolikJam }),
    _median(nilai) { const u = [...nilai].sort((a, b) => a - b); return u[Math.floor(u.length / 2)]; },
    _sebaran: (nilai) => Math.max(...nilai) - Math.min(...nilai),

    offsetSistolik: (k) => Kalibrasi._median(k.putaran.map(p => p.sistolikReferensi - p.sistolikJam)),
    offsetDiastolik: (k) => Kalibrasi._median(k.putaran.map(p => p.diastolikReferensi - p.diastolikJam)),
    sebaranSistolik: (k) => Kalibrasi._sebaran(k.putaran.map(p => p.sistolikReferensi - p.sistolikJam)),
    sebaranDiastolik: (k) => Kalibrasi._sebaran(k.putaran.map(p => p.diastolikReferensi - p.diastolikJam)),

    /** Satu putaran selalu konsisten: sebaran satu angka nol karena tak ada pembanding. */
    konsisten: (k) => k.putaran.length < 2 ||
      (Kalibrasi.sebaranSistolik(k) <= Kalibrasi.sebaranMaksimum && Kalibrasi.sebaranDiastolik(k) <= Kalibrasi.sebaranMaksimum),
    /** Koreksi masih dalam batas yang mungkin — di atasnya pengukuran gagal, bukan tensi tinggi. */
    masukAkal: (k) => Math.abs(Kalibrasi.offsetSistolik(k)) <= Kalibrasi.offsetMaksimum &&
      Math.abs(Kalibrasi.offsetDiastolik(k)) <= Kalibrasi.offsetMaksimum,
    bisaDipakai: (k) => Kalibrasi.konsisten(k) && Kalibrasi.masukAkal(k),

    berlakuSampai: (k) => new Date(new Date(k.waktu).getTime() + Kalibrasi.masaBerlakuHari * 86400000),
    kedaluwarsaPada: (k, kini = new Date()) => kini >= Kalibrasi.berlakuSampai(k),
    sisaHariPada(k, kini = new Date()) {
      const sisaJam = (Kalibrasi.berlakuSampai(k) - kini) / 3600000;
      return sisaJam <= 0 ? 0 : Math.ceil(sisaJam / 24);
    },

    ringkasanOffset(k) {
      const t = (n) => (n >= 0 ? `+${n}` : `${n}`);
      return `${t(Kalibrasi.offsetSistolik(k))}/${t(Kalibrasi.offsetDiastolik(k))} mmHg`;
    },

    /** Koreksi ditulis dengan kata. Offset = tensimeter − jam: positif berarti jam membaca lebih rendah. */
    kalimatOffset(k) {
      const arah = (n) => (n > 0 ? 'lebih rendah' : 'lebih tinggi');
      const s = Kalibrasi.offsetSistolik(k), d = Kalibrasi.offsetDiastolik(k);
      if (s === 0 && d === 0) return 'Jam Anda sudah sama dengan tensimeter; tidak ada yang perlu dikoreksi.';
      if (s === 0 || d === 0) {
        const [nol, ada, nilai] = s === 0 ? ['Sistolik', 'diastolik', d] : ['Diastolik', 'sistolik', s];
        return `${nol} jam sudah sama dengan tensimeter, ${ada}-nya ${Math.abs(nilai)} mmHg ${arah(nilai)}.`;
      }
      if (Math.sign(s) === Math.sign(d))
        return `Jam Anda membaca ${Math.abs(s)} mmHg ${arah(s)} pada sistolik dan ${Math.abs(d)} mmHg pada diastolik daripada tensimeter.`;
      return `Jam Anda membaca sistolik ${Math.abs(s)} mmHg ${arah(s)} dan diastolik ${Math.abs(d)} mmHg ${arah(d)} daripada tensimeter.`;
    },
  };

  /* ============================================================
     Pindai kesehatan, kemampuan, status perangkat
     ============================================================ */
  const HasilPindai = {
    kosong: (h) => h.sampel.gulaDarah == null && h.sampel.detakJantung == null &&
      Sampel.tekananDarah(h.sampel) == null && h.sampel.spo2 == null,
    sebagianGagal: (h) => !HasilPindai.kosong(h) && (h.sampel.gulaDarah == null || h.sampel.detakJantung == null ||
      Sampel.tekananDarah(h.sampel) == null || h.sampel.spo2 == null),
  };

  /**
   * Kemampuan jam dari handshake. null = belum diketahui = tampilkan semua;
   * nilai yang sudah ada tidak pernah disembunyikan (protokol §3).
   */
  const KemampuanPerangkat = {
    semua: { gulaDarah: true, tekananDarah: true, spo2: true },
    tampil: (k) => k || KemampuanPerangkat.semua,
  };

  /**
   * Status jam yang ditampilkan apa adanya. Aturan `baterai`/`bateraiKritis`
   * dibuang saat terputus dan `kemampuan` ditahan ada di sini, supaya
   * permukaan baru tidak bisa lupa.
   */
  function statusPerangkat(p = {}) {
    const tersambung = !!p.tersambung;
    return {
      tersambung,
      baterai: tersambung ? (p.baterai ?? null) : null,
      bateraiKritis: tersambung && !!p.bateraiKritis,
      sampelTertunda: p.sampelTertunda ?? 0,
      sinkronTerakhir: p.sinkronTerakhir ?? null,
      namaPerangkat: p.namaPerangkat ?? null,
      penyandinganHilang: !!p.penyandinganHilang,
      kemampuan: p.kemampuan ?? null,
      sedangMenyambung: !!p.sedangMenyambung,
      firmwareBuild: p.firmwareBuild ?? null,
      belumDipasangkan: (p.namaPerangkat ?? null) === null,
      metrikTampil: KemampuanPerangkat.tampil(p.kemampuan ?? null),
    };
  }

  /* ============================================================
     Analisis lintas sesi — semuanya dihitung, tidak ada yang disimpan
     ============================================================ */
  const ambangKeyakinan = 0.6;

  function AnalisisSesi(daftar) {
    // Sesi aktif belum punya kesimpulan; waktu tidak pasti tidak bisa diurutkan;
    // sesi uji bukan pengukuran seseorang.
    const sesi = (daftar || []).filter(s => !Sesi.sedangAktif(s) && !s.waktuTidakPasti && !s.sesiUji);
    const A = { sesi, kosong: sesi.length === 0 };

    A.urutWaktu = () => [...sesi].sort((a, b) => new Date(a.t0 || a.waktuFoto) - new Date(b.t0 || b.waktuFoto));

    A.titikSebaran = () => {
      const titik = [];
      for (const s of sesi) {
        const h = s.hasil, delta = Sesi.deltaPuncak(s);
        if (!h || delta == null) continue;
        const karbo = h.total?.karbohidrat;
        if (karbo == null) continue;
        if ((h.zatTidakLengkap || []).includes('karbohidrat')) continue;
        titik.push({
          sesi: s, karbohidrat: karbo, delta,
          // Keyakinan null dihitung andal: layanan deteksi memang tidak memberi keyakinan.
          andal: !!h.dikoreksiUser || (h.keyakinan ?? 1) >= ambangKeyakinan,
        });
      }
      return titik;
    };
    A.titikAndal = () => A.titikSebaran().filter(t => t.andal);
    A.jumlahDikecualikan = () => A.titikSebaran().length - A.titikAndal().length;

    /** Garis tren kuadrat terkecil dari titik andal; null bila < 3 titik. */
    A.tren = () => {
      const titik = A.titikAndal();
      if (titik.length < 3) return null;
      const n = titik.length;
      const x = titik.map(t => t.karbohidrat), y = titik.map(t => t.delta);
      const rx = x.reduce((a, b) => a + b, 0) / n, ry = y.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i++) { const dx = x[i] - rx, dy = y[i] - ry; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
      if (sxx === 0 || syy === 0) return null;
      const kemiringan = sxy / sxx;
      const korelasi = sxy / Math.sqrt(sxx * syy);
      return {
        kemiringan, potongan: ry - kemiringan * rx, korelasi,
        nilaiPada: (k) => ry - kemiringan * rx + kemiringan * k,
        meyakinkan: Math.abs(korelasi) >= 0.5,
      };
    };

    const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    A.rataPuncak = () => rata(sesi.map(Sesi.puncakGulaDarah).filter(v => v != null));
    A.rataDelta = () => rata(sesi.map(Sesi.deltaPuncak).filter(v => v != null));

    /** Makanan diurutkan dari rata-rata kenaikan tertinggi (hanya titik andal). */
    A.pemicuTeratas = () => {
      const kumpulan = new Map();
      for (const t of A.titikAndal()) {
        for (const m of t.sesi.hasil.makanan || []) {
          if (!kumpulan.has(m.nama)) kumpulan.set(m.nama, []);
          kumpulan.get(m.nama).push(t);
        }
      }
      const hasil = [...kumpulan.entries()].map(([nama, ts]) => ({
        nama, jumlahSesi: ts.length,
        rataDelta: ts.reduce((a, t) => a + t.delta, 0) / ts.length,
        rataKarbohidrat: ts.reduce((a, t) => a + t.karbohidrat, 0) / ts.length,
      }));
      return hasil.sort((a, b) => b.rataDelta - a.rataDelta);
    };

    A.rekapPemulihan = () => {
      let pulih = 0, total = 0;
      for (const s of sesi) {
        if (Sesi.deltaPuncak(s) == null) continue;
        total++;
        if (Sesi.waktuPemulihanDetik(s) != null) pulih++;
      }
      return { pulih, total };
    };

    /** Proporsi sesi yang pulih, paruh terbaru melawan paruh sebelumnya; null bila < 4. */
    A.selisihProporsiPemulihan = () => {
      const layak = A.urutWaktu().filter(s => Sesi.deltaPuncak(s) != null);
      if (layak.length < 4) return null;
      const tengah = Math.floor(layak.length / 2);
      const prop = (d) => d.filter(s => Sesi.waktuPemulihanDetik(s) != null).length / d.length;
      return prop(layak.slice(tengah)) - prop(layak.slice(0, tengah));
    };

    return A;
  }

  const Model = {
    StatusSesi, StatusSampel, WaktuMakan, KualitasRespons, statusKeKawat, statusDariKawat,
    ambangResponsLandai, ambangResponsSedang, ambangPemulihan,
    titikJadwal, jadwalSesi, jadwalNormal, faktorJadwalUji, jadwalUjiBawaan, labelTitikSampel,
    /** Jadwal uji yang berlaku; ditimpa konfigurasi bila faktor berbeda. */
    jadwalUji: jadwalUjiBawaan,
    KUNCI_METRIK, sampelMenunggu, Sampel, Sesi, jamRingkas,
    ZatGizi, Nutrisi, HasilDeteksi,
    SisiPergelangan, galatReferensiTensimeter, Kalibrasi,
    HasilPindai, KemampuanPerangkat, statusPerangkat,
    ambangKeyakinan, AnalisisSesi,
  };
  window.Model = Model;
})();
