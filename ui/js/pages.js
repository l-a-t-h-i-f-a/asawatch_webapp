/**
 * pages.js — controller tiap halaman. Halaman memilih dirinya lewat
 * <body data-page="..."> sehingga satu berkas melayani semua halaman.
 */
(function () {
  'use strict';

  const { $, ic, toast } = window.UI;
  const S = window.Store, U = window.UI;
  const M = S.METRICS;

  /* ============================================================
     PERANGKAT — pengikat tampilan untuk window.Perangkat (ui/js/device.js)
     ============================================================ */
  const Device = {
    _terpasang: false,

    tulisMeta() {
      const P = window.Perangkat;
      const d = S.device();
      const sync = S.lastSync();
      const baterai = P?.baterai ?? d.baterai;
      const bagian = [
        'Baterai ' + (baterai === null || baterai === undefined ? '—' : baterai + '%'),
        P?.mode === 'simulasi' ? 'Mode simulasi' : null,
        'Terakhir sinkron ' + (sync ? U.tanggal(sync.getTime()) : '—'),
      ].filter(Boolean);
      document.querySelectorAll('[data-dev="meta"]').forEach(e => e.textContent = bagian.join(' · '));
      document.querySelectorAll('[data-dev="nama"]').forEach(e => e.textContent = P?.nama || d.nama);
    },

    tandaiStatus({ terhubung, menyambung, mode }) {
      document.querySelectorAll('[data-dev="status"]').forEach(e => {
        e.textContent = terhubung ? (mode === 'simulasi' ? 'Simulasi' : 'Terhubung')
          : menyambung ? 'Menyambung…' : 'Terputus';
        e.className = 'tag ' + (terhubung ? 'ok' : menyambung ? 'warn' : 'danger');
      });
      const chip = document.querySelector('#watch-chip span');
      if (chip) chip.textContent = terhubung ? (window.Perangkat?.nama || 'Terhubung') : 'Belum terhubung';

      const sambung = $('btnConnect'), putus = $('btnDisconnect'), ukur = $('btnMeasure');
      sambung?.classList.toggle('hidden', terhubung);
      putus?.classList.toggle('hidden', !terhubung);
      if (sambung) { sambung.disabled = !!menyambung; sambung.textContent = menyambung ? 'Menyambung…' : 'Sambungkan'; }
      if (ukur) ukur.disabled = !terhubung;
      Device.tulisMeta();
    },

    progres({ persen, sisaDetik, status }) {
      const bar = $('measureBar'), fill = $('measureFill'), teks = $('measureText');
      if (!bar) return;
      bar.classList.remove('hidden');
      if (fill) fill.style.width = (persen || 0) + '%';
      if (teks) {
        teks.textContent = status === 2 ? 'Pengukuran gagal'
          : status === 1 ? 'Pengukuran selesai'
            : sisaDetik ? `Mengukur… sisa ${sisaDetik} detik` : 'Mengukur…';
      }
      if (status === 1 || status === 2) setTimeout(() => bar.classList.add('hidden'), 2500);
    },

    /** Pasang semua tombol & pendengar sekali per halaman. */
    pasangTombol(onSampelBaru) {
      const P = window.Perangkat;
      if (!P) return;

      if (!Device._terpasang) {
        Device._terpasang = true;
        P.on('status', st => Device.tandaiStatus(st));
        P.on('progres', pr => Device.progres(pr));
        P.on('baterai', ({ level, kritis }) => {
          Device.tulisMeta();
          if (kritis) toast('Baterai jam tinggal ' + level + '%');
        });
        P.on('kemampuan', () => Device.tulisMeta());
        P.on('menyambungUlang', ({ percobaan }) => toast(`Koneksi putus, mencoba menyambung ulang (${percobaan})…`));
        P.on('galat', ({ pesan }) => toast(pesan));
        P.on('sampel', ({ tersimpan }) => {
          toast(tersimpan ? 'Hasil pengukuran tersimpan' : 'Hasil diterima, tapi gagal disimpan');
          onSampelBaru?.();
        });
      }

      $('btnConnect')?.addEventListener('click', () => P.sambung());
      $('btnDisconnect')?.addEventListener('click', () => P.putus());
      $('btnMeasure')?.addEventListener('click', async () => {
        try { await P.ukurSekarang(); } catch (e) { toast(e.message || 'Pengukuran gagal'); }
      });

      Device.tandaiStatus({ terhubung: P.terhubung, mode: P.mode });
      P.sambungUlangSenyap();   // pakai izin yang sudah ada, diam bila tak bisa
    },
  };

  /* ============================================================
     GRAFIK
     ============================================================ */
  function garis(canvasId, labels, datasets, opsi = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    if (ctx._chart) ctx._chart.destroy();
    ctx._chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, padding: 14 } },
          tooltip: { backgroundColor: '#14301f', padding: 10, cornerRadius: 8, displayColors: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#93a399', font: { size: 11 } } },
          y: { border: { display: false }, grid: { color: '#f2f6f3' }, ticks: { color: '#93a399', font: { size: 11 } }, ...(opsi.y || {}) },
        },
        elements: { point: { radius: 3, hoverRadius: 5, backgroundColor: '#fff', borderWidth: 2 } },
      },
    });
    return ctx._chart;
  }

  const dataset = (label, data, warna) => ({
    label, data, borderColor: warna, backgroundColor: warna + '20',
    borderWidth: 2.4, fill: true, tension: .35, pointBorderColor: warna,
  });

  /* ============================================================
     HALAMAN: BERANDA
     ============================================================ */
  async function halamanBeranda() {
    U.identitas();
    const u = S.user();
    const hero = $('heroName'); if (hero) hero.textContent = (u.nama || 'Sahabat').split(' ')[0];

    const samples = await S.samples();
    const terakhir = (key) => {
      for (let i = samples.length - 1; i >= 0; i--) if (samples[i][key]) return samples[i];
      return null;
    };

    // kartu metrik
    const kartu = [
      { id: 'mHr', m: M.detak, fmt: s => `${s.detakJantung} <i>bpm</i>` },
      { id: 'mGula', m: M.gula, fmt: s => `${s.gulaDarah} <i>mg/dL</i>` },
      { id: 'mTensi', m: M.tensi, fmt: s => `${s.sistolik}/${s.diastolik || '—'} <i>mmHg</i>` },
    ];
    kartu.forEach(k => {
      const el = $(k.id), tag = $(k.id + 'Tag');
      const s = terakhir(k.m.key);
      if (!s) { if (el) el.innerHTML = '— <i>' + k.m.unit + '</i>'; if (tag) { tag.textContent = 'Belum ada data'; tag.className = 'tag'; } return; }
      if (el) el.innerHTML = k.fmt(s);
      const st = U.status(s[k.m.key], k.m);
      if (tag) { tag.textContent = st.teks; tag.className = 'tag ' + st.kelas; }
    });

    // kalori dari catatan makanan terakhir
    const food = await S.foodTerakhir();
    const kal = $('mKal'), kalTag = $('mKalTag');
    if (kal) kal.innerHTML = food ? `${U.angka(food.kalori)} <i>kcal</i>` : '— <i>kcal</i>';
    if (kalTag) {
      kalTag.textContent = food ? (food.kalori <= 2000 ? 'Baik' : 'Berlebih') : 'Belum ada data';
      kalTag.className = 'tag ' + (food ? (food.kalori <= 2000 ? 'ok' : 'warn') : '');
    }

    // status hari ini
    const hariIni = samples.filter(s => new Date(s.waktu).toDateString() === new Date().toDateString());
    const sAktif = $('sAktif'); if (sAktif) sAktif.textContent = hariIni.length ? `${hariIni.length} pengukuran` : 'Belum ada';
    const sMakan = $('sMakan'); if (sMakan) sMakan.textContent = food ? `${U.angka(food.kalori)} kcal` : '—';
    const sTidur = $('sTidur'); if (sTidur) sTidur.textContent = '—';
    const sLangkah = $('sLangkah'); if (sLangkah) sLangkah.textContent = '—';
    const badge = $('statusBadge');
    if (badge) {
      const semuaNormal = hariIni.length && hariIni.every(U.normal);
      badge.textContent = !hariIni.length ? 'Belum ada data' : (semuaNormal ? 'Sehat' : 'Perlu dicek');
      badge.className = 'tag ' + (!hariIni.length ? '' : semuaNormal ? 'ok' : 'warn');
    }

    gambarGrafikBeranda(samples);
    Device.pasangTombol(() => halamanBeranda());

    const stamp = $('chartStamp');
    if (stamp) stamp.textContent = samples.length
      ? `Data terakhir ${U.tanggal(samples[samples.length - 1].waktu)}`
      : 'Belum ada data tersimpan';
  }

  function gambarGrafikBeranda(samples) {
    const n = samples.slice(-12);
    if (!n.length) return kosongkanGrafik('chartHome');
    garis('chartHome',
      n.map(s => U.jam(s.waktu)),
      [
        dataset('Gula Darah (mg/dL)', n.map(s => s.gulaDarah), M.gula.color),
        dataset('Detak Jantung (bpm)', n.map(s => s.detakJantung), M.detak.color),
        dataset('Sistolik (mmHg)', n.map(s => s.sistolik), M.tensi.color),
      ]);
  }

  function kosongkanGrafik(id) {
    const c = document.getElementById(id);
    if (!c) return;
    if (c._chart) { c._chart.destroy(); c._chart = null; }
    const box = c.closest('.chart-box');
    if (box && !box.querySelector('.chart-empty'))
      box.insertAdjacentHTML('beforeend', `<div class="chart-empty">${ic('i-chart')}<p>Belum ada data tersimpan.<br>Sambungkan jam lalu tekan “Ukur Sekarang”.</p></div>`);
  }

  /* ============================================================
     HALAMAN: DETAIL METRIK (detak / gula / tensi)
     ============================================================ */
  async function halamanMetrik() {
    U.identitas();
    const id = document.body.dataset.metric;
    const m = M[id];
    const samples = await S.samplesOf(id);
    const st = S.stats(samples, id);

    const nilai = $('dValue'), sub = $('dSub'), tag = $('dTag');
    if (st) {
      const teks = id === 'tensi'
        ? `${st.last}/${samples[samples.length - 1].diastolik || '—'} ${m.unit}`
        : `${st.last} ${m.unit}`;
      if (nilai) nilai.textContent = teks;
      if (sub) sub.textContent = 'Pengukuran terakhir · ' + U.tanggal(samples[samples.length - 1].waktu);
      const s = U.status(st.last, m);
      if (tag) { tag.textContent = s.teks; tag.className = 'tag ' + s.kelas; }
    } else {
      if (nilai) nilai.textContent = '— ' + m.unit;
      if (sub) sub.textContent = 'Belum ada pengukuran';
      if (tag) { tag.textContent = 'Belum ada data'; tag.className = 'tag'; }
    }

    const set = (elId, v) => { const e = $(elId); if (e) e.textContent = v; };
    set('stMax', st ? `${st.max} ${m.unit}` : '—');
    set('stMin', st ? `${st.min} ${m.unit}` : '—');
    set('stAvg', st ? `${st.avg.toFixed(0)} ${m.unit}` : '—');
    set('stN', st ? st.n : '0');

    // grafik
    const n = samples.slice(-12);
    if (n.length) {
      const ds = [dataset(m.label + ' (' + m.unit + ')', n.map(s => s[m.key]), m.color)];
      if (id === 'tensi') ds.push(dataset('Diastolik (mmHg)', n.map(s => s.diastolik), '#f0a132'));
      garis('chartDetail', n.map(s => U.jam(s.waktu)), ds);
    } else kosongkanGrafik('chartDetail');

    // tabel riwayat
    const tbody = $('tbDetail');
    if (tbody) {
      const baris = samples.slice().reverse();
      tbody.innerHTML = baris.length ? baris.map(s => {
        const v = id === 'tensi' ? `${s.sistolik}/${s.diastolik || '—'}` : s[m.key];
        const st2 = U.status(s[m.key], m);
        return `<tr><td>${U.tanggal(s.waktu)}</td><td>${v} ${m.unit}</td><td><span class="tag ${st2.kelas}">${st2.teks}</span></td></tr>`;
      }).join('') : `<tr><td colspan="3" class="empty">Belum ada data untuk ${m.label}.</td></tr>`;
    }
  }

  /* ============================================================
     HALAMAN: DETEKSI MAKANAN
     ============================================================ */
  async function halamanNutrisi() {
    U.identitas();
    const awal = await S.foodTerakhir();
    let fotoDataUrl = awal?.foto || null;

    const img = $('shotImg'), kosong = $('shotEmpty'), video = $('camView');
    const tampilkanFoto = (url) => {
      fotoDataUrl = url;
      if (img) { img.src = url; img.classList.remove('hidden'); }
      kosong?.classList.add('hidden');
      video?.classList.add('hidden');
    };
    if (fotoDataUrl) tampilkanFoto(fotoDataUrl);

    $('btnCam')?.addEventListener('click', async () => {
      if (!navigator.mediaDevices?.getUserMedia) return toast('Kamera tidak didukung browser ini');
      try {
        if (video && !video.srcObject) {
          video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.classList.remove('hidden');
          kosong?.classList.add('hidden');
          img?.classList.add('hidden');
          $('btnCam').textContent = 'Jepret';
          return;
        }
        // jepret
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        tampilkanFoto(c.toDataURL('image/jpeg', .85));
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
        $('btnCam').innerHTML = `${ic('i-camera')} Ambil Foto`;
      } catch (e) { toast('Gagal membuka kamera: ' + e.message); }
    });

    $('btnUpload')?.addEventListener('click', () => $('filePick')?.click());
    $('filePick')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => tampilkanFoto(fr.result);
      fr.readAsDataURL(f);
    });

    // isi form dari catatan terakhir
    const food = awal;
    if (food) {
      ['kalori', 'karbo', 'protein', 'lemak', 'gula'].forEach(k => {
        const el = $('f_' + k); if (el && food[k] !== undefined) el.value = food[k];
      });
      hitungNutrisi();
    }
    ['f_kalori', 'f_karbo', 'f_protein', 'f_lemak', 'f_gula'].forEach(id =>
      $(id)?.addEventListener('input', hitungNutrisi));

    $('btnSaveFood')?.addEventListener('click', async () => {
      const data = bacaNutrisi();
      if (!data.kalori) return toast('Isi jumlah kalori dulu');
      const hasil = await S.simpanFood(data, fotoDataUrl);
      toast(hasil ? 'Hasil deteksi tersimpan' : 'Gagal menyimpan hasil');
    });
  }

  function bacaNutrisi() {
    const num = id => Number($(id)?.value || 0);
    return { kalori: num('f_kalori'), karbo: num('f_karbo'), protein: num('f_protein'), lemak: num('f_lemak'), gula: num('f_gula') };
  }

  function hitungNutrisi() {
    const d = bacaNutrisi();
    const total = d.karbo + d.protein + d.lemak || 1;
    const pct = v => Math.round(v / total * 100);
    const k = pct(d.karbo), p = pct(d.protein), l = 100 - k - p;

    const donut = $('donut');
    if (donut) donut.style.background =
      `conic-gradient(var(--pri) 0 ${k}%, var(--blue) ${k}% ${k + p}%, var(--amber) ${k + p}% 100%)`;
    const tot = $('kalTotal');
    if (tot) tot.innerHTML = `${U.angka(d.kalori)}<small>kcal</small>`;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('mc', `${d.karbo} g (${k}%)`);
    set('mp', `${d.protein} g (${p}%)`);
    set('mf', `${d.lemak} g (${Math.max(0, l)}%)`);

    const alert = $('foodAlert');
    if (alert) alert.classList.toggle('hidden', !(d.gula > 10));
  }

  /* ============================================================
     HALAMAN: RIWAYAT
     ============================================================ */
  const PER_HALAMAN = 8;
  async function halamanRiwayat() {
    U.identitas();
    const semua = await S.samples();
    const foodTerakhir = await S.foodTerakhir();
    let filter = 'semua', halaman = 1;

    document.querySelectorAll('.pill[data-hist]').forEach(p => p.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-hist]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      filter = p.dataset.hist; halaman = 1; gambar();
    }));

    function baris(s) {
      const out = [];
      const tambah = (m, nilai) => {
        const st = U.status(s[m.key], m);
        out.push(`<tr>
          <td>${U.tanggal(s.waktu)}</td>
          <td><span class="cell-ic ${m.tone}">${ic(m.icon)}</span>${m.label}</td>
          <td><b>${nilai} ${m.unit}</b></td>
          <td><span class="tag ${st.kelas}">${st.teks}</span></td>
          <td><a class="row-link" href="${m.page || '#'}">${ic('i-chev')}</a></td>
        </tr>`);
      };
      if (s.detakJantung && ['semua', 'jantung'].includes(filter)) tambah(M.detak, s.detakJantung);
      if (s.gulaDarah && ['semua', 'gula'].includes(filter)) tambah(M.gula, s.gulaDarah);
      if (s.sistolik && ['semua', 'tensi'].includes(filter)) tambah(M.tensi, `${s.sistolik}/${s.diastolik || '—'}`);
      if (s.spo2 && filter === 'semua') tambah(M.spo2, s.spo2);
      return out;
    }

    function gambar() {
      const tbody = $('tbHistory'), pager = $('pager');
      if (!tbody) return;
      let rows = [];
      semua.slice().reverse().forEach(s => rows.push(...baris(s)));

      if (filter === 'kalori') {
        const f = foodTerakhir;
        rows = f ? [`<tr>
            <td>${U.tanggal(f.waktu)}</td>
            <td><span class="cell-ic amber">${ic('i-fire')}</span>Kalori</td>
            <td><b>${U.angka(f.kalori)} kcal</b></td>
            <td><span class="tag ${f.kalori <= 2000 ? 'ok' : 'warn'}">${f.kalori <= 2000 ? 'Baik' : 'Berlebih'}</span></td>
            <td><a class="row-link" href="deteksi-makanan.html">${ic('i-chev')}</a></td>
          </tr>`] : [];
      }

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">Belum ada riwayat untuk filter ini.</td></tr>`;
        if (pager) pager.innerHTML = '';
        return;
      }

      const total = Math.ceil(rows.length / PER_HALAMAN);
      halaman = Math.min(halaman, total);
      tbody.innerHTML = rows.slice((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN).join('');

      if (pager) {
        pager.innerHTML = '';
        for (let i = 1; i <= total; i++) {
          const b = document.createElement('button');
          b.textContent = i;
          if (i === halaman) b.className = 'active';
          b.addEventListener('click', () => { halaman = i; gambar(); });
          pager.appendChild(b);
        }
      }
    }
    gambar();
  }

  /* ============================================================
     HALAMAN: PROFIL
     ============================================================ */
  function halamanProfil() {
    U.identitas();
    $('btnEditProf')?.addEventListener('click', () => {
      const u = S.user();
      const nama = prompt('Nama lengkap:', u.nama || '');
      if (nama === null) return;
      const email = prompt('Email:', u.email === '—' ? '' : u.email);
      if (email === null) return;
      S.setUser({ ...u, nama: nama.trim() || u.nama, email: email.trim() || u.email })
        .then(() => toast('Profil diperbarui'));
      U.identitas();
    });
    $('btnLogout')?.addEventListener('click', async () => {
      if (!confirm('Keluar dari akun?')) return;
      await S.logout();
      location.href = 'login.html';
    });
  }

  /* ============================================================
     HALAMAN: PENGATURAN PERANGKAT
     ============================================================ */
  async function halamanPengaturan() {
    U.identitas();
    Device.pasangTombol();
    Device.tulisMeta();

    const st = S.settings();
    document.querySelectorAll('.tgl[data-tgl]').forEach(t => {
      t.classList.toggle('on', !!st[t.dataset.tgl]);
      t.addEventListener('click', () => {
        const aktif = t.classList.toggle('on');
        S.setSetting(t.dataset.tgl, aktif);
        const label = t.closest('li')?.querySelector('small');
        if (label && t.dataset.tgl === 'notif') label.textContent = aktif ? 'Aktif' : 'Nonaktif';

        // Ganti mode perangkat: putuskan dulu supaya tidak campur aduk.
        if (t.dataset.tgl === 'simulasi') {
          window.Perangkat?.putus();
          toast(aktif ? 'Mode simulasi aktif — tekan Sambungkan' : 'Kembali ke Bluetooth asli');
          return;
        }
        toast(aktif ? 'Diaktifkan' : 'Dinonaktifkan');
      });
    });

    $('pSync')?.addEventListener('click', async () => {
      toast('Menyinkronkan data…');
      try {
        const { terkirim, sisa } = await S.kirimAntrean();
        await S.muatSesi(true);
        Device.tulisMeta();
        toast(sisa ? `${terkirim} terkirim, ${sisa} masih tertahan`
          : terkirim ? `${terkirim} sesi terkirim ke server` : 'Semua data sudah tersinkron');
        halamanPengaturan();
      } catch { toast('Sinkronisasi gagal'); }
    });

    $('btnReset')?.addEventListener('click', async () => {
      if (!confirm('Hapus salinan data di browser ini? Data di server tidak ikut terhapus.')) return;
      const n = await S.bersihkanCacheLokal();
      toast(`Salinan ${n} sesi dibersihkan`);
      halamanPengaturan();
    });

    // ringkasan pemakaian
    const sampel = await S.samples();
    const sumber = S.sumber();
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('uSumber', {
      'server': 'Server AsaWatch (online)',
      'offline': 'Offline — memakai salinan lokal',
      'belum-masuk': 'Belum masuk',
    }[sumber]);
    const antre = S.jumlahAntrean();
    set('uAntrean', antre ? `${antre} sesi menunggu dikirim` : 'Tidak ada');
    set('uSampel', sampel.length);
    set('uSync', S.lastSync() ? U.tanggal(S.lastSync().getTime()) : '—');

    const P = window.Perangkat;
    set('uKoneksi', !P ? '—'
      : P.terhubung ? (P.mode === 'simulasi' ? 'Terhubung (simulasi)' : 'Terhubung (Bluetooth)')
        : P.dukunganBluetooth() ? 'Terputus' : 'Bluetooth tidak didukung browser');

    const k = P?.kemampuan;
    const namaSensor = { gulaDarah: 'Gula darah', detakJantung: 'Detak jantung', tekananDarah: 'Tensi', spo2: 'SpO2' };
    set('uSensor', k ? (Object.keys(namaSensor).filter(x => k[x]).map(x => namaSensor[x]).join(', ') || '—')
      : 'Diketahui setelah tersambung');
  }

  /* ============================================================
     HALAMAN: TUJUAN KESEHATAN
     ============================================================ */
  async function halamanTujuan() {
    U.identitas();
    await S.muatTujuan();
    gambarTujuan();

    $('btnAddGoal')?.addEventListener('click', async () => {
      const nama = prompt('Nama tujuan (mis. Jalan Kaki):');
      if (!nama) return;
      const target = prompt('Target (mis. 8.000 langkah/hari):') || '—';
      await S.tambahTujuan({ nama, target });
      gambarTujuan();
      toast('Tujuan ditambahkan');
    });
  }

  function gambarTujuan() {
    const ul = $('goalList');
    if (!ul) return;
    const goals = S.goals();
    ul.innerHTML = goals.map(g => `
      <li>
        <i class="ic ${g.tone} sm">${ic(g.icon)}</i>
        <div>
          <span>${g.nama}</span><small>${g.target}</small>
          <div class="bar"><i style="width:${Math.max(0, Math.min(100, g.progres))}%"></i></div>
        </div>
        <b>${g.progres}%</b>
        <button class="goal-del" data-id="${g.id}" aria-label="Hapus tujuan">${ic('i-trash')}</button>
      </li>`).join('') || `<li class="empty-row">Belum ada tujuan. Tambahkan lewat tombol di bawah.</li>`;

    ul.querySelectorAll('.goal-del').forEach(b => b.addEventListener('click', async () => {
      await S.hapusTujuan(b.dataset.id);
      gambarTujuan();
      toast('Tujuan dihapus');
    }));
  }

  /* ============================================================
     HALAMAN: LOGIN / DAFTAR
     ============================================================ */
  function halamanAuth() {
    // tombol mata
    document.addEventListener('click', e => {
      const eye = e.target.closest('.eye');
      if (!eye) return;
      const input = document.getElementById(eye.dataset.eye);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    const sibuk = (b, teks) => { if (b) { b.disabled = true; b.dataset.teks = b.textContent; b.textContent = teks; } };
    const selesai = (b) => { if (b) { b.disabled = false; b.textContent = b.dataset.teks || b.textContent; } };

    // ---- masuk ----
    $('loginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('loginId').value.trim();
      const sandi = $('loginPass').value;
      const tombol = e.target.querySelector('button[type="submit"]');
      if (!email.includes('@')) return toast('Masuk memakai email yang terdaftar');

      sibuk(tombol, 'Memproses…');
      try {
        await window.Server.masuk(email, sandi);
        location.href = 'dashboard.html';
      } catch (err) {
        toast(err.message);
        selesai(tombol);
      }
    });

    // ---- daftar ----
    $('registerForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const nama = $('regName').value.trim();
      const email = $('regEmail').value.trim();
      const sandi = $('regPass').value, sandi2 = $('regPass2').value;
      const tombol = e.target.querySelector('button[type="submit"]');

      if (sandi !== sandi2) return toast('Password tidak cocok');
      if (sandi.length < 8) return toast('Password minimal 8 karakter');

      sibuk(tombol, 'Mendaftarkan…');
      try {
        await window.Server.daftar(nama, email, sandi);
        // Sebagian server tidak langsung memberi token setelah daftar.
        if (!window.Server.token()) {
          await window.Server.masuk(email, sandi);
        }
        location.href = 'dashboard.html';
      } catch (err) {
        toast(err.message);
        selesai(tombol);
      }
    });

    pasangTombolGoogle();

    // sudah punya token -> tidak perlu lihat halaman ini lagi
    if (window.Server?.token()) location.replace('dashboard.html');
  }

  /**
   * Tombol "Masuk dengan Google".
   *
   * Browser mengambil ID token dari Google, server yang memverifikasinya
   * (POST /auth/google) — jadi tidak ada rahasia yang disimpan di halaman ini.
   */
  function pasangTombolGoogle() {
    const wadah = $('tombolGoogle');
    const galat = $('googleGalat');
    if (!wadah) return;

    const idKlien = window.ASAWATCH_SERVER?.googleClientId;
    const beritahu = (pesan) => {
      if (!galat) return;
      galat.textContent = pesan;
      galat.classList.remove('hidden');
      wadah.closest('.gsi-wrap')?.classList.add('hidden');
    };

    if (!idKlien || idKlien.startsWith('GANTI')) {
      return beritahu('Masuk dengan Google belum dikonfigurasi.');
    }

    // Skrip GIS dimuat async; tunggu sebentar sebelum menyerah.
    let sisa = 40;
    (function tunggu() {
      if (!window.google?.accounts?.id) {
        if (--sisa <= 0) return beritahu('Gagal memuat layanan Google. Cek koneksi, lalu muat ulang halaman.');
        return setTimeout(tunggu, 150);
      }

      try {
        google.accounts.id.initialize({
          client_id: idKlien,
          callback: async ({ credential }) => {
            if (!credential) return toast('Tidak ada token dari Google');
            toast('Memverifikasi akun Google…');
            try {
              await window.Server.masukGoogle(credential);
              location.href = 'dashboard.html';
            } catch (err) {
              toast(err.message);
            }
          },
        });

        google.accounts.id.renderButton(wadah, {
          theme: 'outline', size: 'large', shape: 'pill',
          text: document.getElementById('registerForm') ? 'signup_with' : 'signin_with',
          logo_alignment: 'center', width: 320,
        });
      } catch (e) {
        beritahu('Google menolak halaman ini: ' + (e.message || e));
      }
    })();
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  const HALAMAN = {
    auth: halamanAuth,
    beranda: halamanBeranda,
    kesehatan: halamanMetrik,
    nutrisi: halamanNutrisi,
    riwayat: halamanRiwayat,
    profil: halamanProfil,
    pengaturan: halamanPengaturan,
    tujuan: halamanTujuan,
    bantuan: () => U.identitas(),
  };

  function mulai() {
    const key = document.body.dataset.page;
    HALAMAN[key]?.();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
