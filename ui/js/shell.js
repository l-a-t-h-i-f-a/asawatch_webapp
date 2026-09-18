/**
 * shell.js — kerangka bersama semua halaman: sprite ikon, sidebar (desktop),
 * bottom nav 5 slot dengan tombol tengah kontekstual (ponsel), guard sesi
 * login, spanduk mode uji, toast, dan perakitan aplikasi (DB → jam →
 * SesiMakanController) yang dibagikan lewat `window.App`.
 *
 * Halaman cukup menulis <body data-page="beranda"> dan menunggu `App.siap`.
 */
(function () {
  'use strict';

  /* ---------- sprite ikon ---------- */
  const SPRITE = `
<svg class="sprite" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20.5 4.2 13a4.9 4.9 0 0 1 0-7 4.6 4.6 0 0 1 6.6 0l1.2 1.2 1.2-1.2a4.6 4.6 0 0 1 6.6 0 4.9 4.9 0 0 1 0 7Z"/></symbol>
<symbol id="i-heartbeat" viewBox="0 0 24 24"><path d="M20.8 6.2a4.6 4.6 0 0 0-6.6 0L12 8.4l-2.2-2.2a4.6 4.6 0 0 0-6.6 6.6l1 1h3.3l1.3-2.6 2.2 5.2 1.7-3.4h3.5l1.6-1.6a4.6 4.6 0 0 0 0-6.6Z"/></symbol>
<symbol id="i-drop" viewBox="0 0 24 24"><path d="M12 3.2s6 6.1 6 10a6 6 0 1 1-12 0c0-3.9 6-10 6-10Z"/></symbol>
<symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></symbol>
<symbol id="i-food" viewBox="0 0 24 24"><path d="M6 3v8a2.5 2.5 0 0 0 5 0V3"/><path d="M8.5 11v10"/><path d="M17.5 3c-1.4 1.6-2 3.4-2 5.5 0 1.6.7 2.8 2 3.5v9"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/></symbol>
<symbol id="i-scatter" viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><circle cx="9" cy="14" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="16.5" cy="7.5" r="1.3"/><circle cx="14" cy="15" r="1.3"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5v-6h5v6"/></symbol>
<symbol id="i-history" viewBox="0 0 24 24"><path d="M6 3.5h8.5L19 8v12.5H6Z"/><path d="M14 3.5V8h5"/><path d="M9 12.5h6M9 16h4"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 14-.6 1.4 1.2 2-2.6 2.6-2-1.2-1.4.6-.6 2.2h-3.6L9.2 21l-1.4-.6-2 1.2L3.2 19l1.2-2-.6-1.4L1.8 15V11.4l1.9-.6.6-1.4-1.1-2 2.5-2.6 2 1.2L9.2 5l.6-2.2h3.6l.6 2.2 1.4.6 2-1.2 2.6 2.6-1.2 2 .6 1.4 2.2.6V14Z"/></symbol>
<symbol id="i-watch" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="4"/><path d="M9 6V3h6v3M9 18v3h6v-3"/><path d="M12 10v2.4l1.6 1"/></symbol>
<symbol id="i-activity" viewBox="0 0 24 24"><path d="M3 12h4l2-5 3.5 11L15 12h6"/></symbol>
<symbol id="i-headset" viewBox="0 0 24 24"><path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="2.8" y="13.4" width="4" height="6" rx="2"/><rect x="17.2" y="13.4" width="4" height="6" rx="2"/><path d="M19.5 19.4c0 1.4-1.6 2.2-3.5 2.2"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.2A2 2 0 0 1 6 3.4h5v17H6a2 2 0 0 0-2 1.8Z"/><path d="M20 5.2a2 2 0 0 0-2-1.8h-5v17h5a2 2 0 0 1 2 1.8Z"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7 8.2 6 8.2-6"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M10.5 17.5h3"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24"><path d="M20.5 11.5c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.9-.4l-4.6 1.6 1.5-3.8a7 7 0 0 1-2-4.8C4 7.4 7.8 4.1 12 4.1s8.5 3.3 8.5 7.4Z"/></symbol>
<symbol id="i-sync" viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12a8 8 0 0 1 13.7-5.6"/><path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3"/><path d="M12 7.5V12l3 1.8"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M4.5 6.5h15"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M6.5 6.5 7.4 20a1.4 1.4 0 0 0 1.4 1.3h6.4A1.4 1.4 0 0 0 16.6 20l.9-13.5"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3"/><path d="M12 11v5.2"/><circle cx="12" cy="8" r=".8" fill="currentColor"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="4.8" y="10" width="14.4" height="10.5" rx="2.5"/><path d="M8.2 10V7.6a3.8 3.8 0 0 1 7.6 0V10"/></symbol>
<symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5Z"/><path d="m14.5 6.5 3 3"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5.5v13M5.5 12h13"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-leaf" viewBox="0 0 24 24"><path d="M20 4C9 4 4 9 4 15.5c0 2 .8 3.6.8 3.6S8 10 18 7c0 0-7.5 3.6-9.8 12 6.6 1.5 11.8-2.4 11.8-15Z"/></symbol>
<symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 4.2 21 19.5H3Z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r=".8" fill="currentColor"/></symbol>
<symbol id="i-camera" viewBox="0 0 24 24"><path d="M4.5 7.5h3L9 5.2h6l1.5 2.3h3A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5Z"/><circle cx="12" cy="13.2" r="3.4"/></symbol>
<symbol id="i-logout" viewBox="0 0 24 24"><path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M17 8.5 20.5 12 17 15.5M10 12h10"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
<symbol id="i-bt" viewBox="0 0 24 24"><path d="m7 7 10 10-5 4V3l5 4L7 17"/></symbol>
<symbol id="i-battery" viewBox="0 0 24 24"><rect x="3" y="7.5" width="16" height="9" rx="2.5"/><path d="M21 10.5v3"/></symbol>
<symbol id="i-image" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 5-5 4 4 2.5-2.5 4 4"/></symbol>
<symbol id="i-scan" viewBox="0 0 24 24"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M7 12h3l1.5-3 2.5 6 1.5-3H17"/></symbol>
</svg>`;

  const ic = (id) => `<svg><use href="#${id}"/></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- pengaturan lokal ---------- */
  const DEFAULT_SETTINGS = { notif: true, simulasi: false, jadwalUji: false, faktorJadwalUji: 60 };
  const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const Pengaturan = {
    semua() { return { ...DEFAULT_SETTINGS, ...readJSON('aw_settings', {}) }; },
    set(k, v) { const s = Pengaturan.semua(); s[k] = v; localStorage.setItem('aw_settings', JSON.stringify(s)); },
    user() { return readJSON('aw_user', null) || { nama: 'Pengguna', email: '—' }; },
    setUser(u) { localStorage.setItem('aw_user', JSON.stringify(u)); },
  };

  /* ---------- navigasi ---------- */
  const NAV = [
    { key: 'beranda', label: 'Beranda', icon: 'i-home', href: 'dashboard.html' },
    { key: 'riwayat', label: 'Riwayat', icon: 'i-history', href: 'riwayat.html' },
    { key: 'tengah' },
    { key: 'analisis', label: 'Analisis', icon: 'i-scatter', href: 'analisis.html' },
    { key: 'profil', label: 'Profil', icon: 'i-user', href: 'profil.html' },
  ];
  const NAV_SAMPING = [
    { key: 'perangkat', label: 'Perangkat', icon: 'i-watch', href: 'perangkat.html' },
    { key: 'pindai', label: 'Pindai Kesehatan', icon: 'i-scan', href: 'pindai-kesehatan.html' },
    { key: 'kalibrasi', label: 'Kalibrasi Tensi', icon: 'i-gauge', href: 'kalibrasi-tensi.html' },
    { key: 'bantuan', label: 'Bantuan', icon: 'i-headset', href: 'bantuan.html' },
  ];

  /** Tombol tengah kontekstual: idle → foto; ada sesi aktif → buka sesi. */
  function tombolTengah(ctl) {
    const aktif = ctl?.sesiAktif;
    return aktif
      ? { href: 'sesi-berjalan.html', label: 'Sesi', icon: 'i-activity', aktif: true }
      : { href: 'deteksi-makanan.html', label: 'Foto', icon: 'i-camera', aktif: false };
  }

  function sidebar(active) {
    const tautan = (n) => `<a href="${n.href}" data-nav="${n.key}" class="${n.key === active ? 'active' : ''}">${ic(n.icon)} ${n.label}</a>`;
    return `
<aside class="sidebar" id="sidebar">
  <a class="side-brand" href="dashboard.html"><div class="brand-mark sm">${ic('i-heartbeat')}</div><b>AsaWatch</b></a>
  <nav class="side-nav">
    ${NAV.filter(n => n.key !== 'tengah').map(tautan).join('')}
    <a href="deteksi-makanan.html" data-nav="tengah" id="sideTengah" class="${['nutrisi', 'sesi'].includes(active) ? 'active' : ''}">${ic('i-camera')} Foto Makanan</a>
    <hr class="side-sep">
    ${NAV_SAMPING.map(tautan).join('')}
  </nav>
  <div class="side-foot"><div id="watch-chip" class="chip">${ic('i-watch')} <span>Belum terhubung</span></div></div>
</aside>`;
  }

  function topbar() {
    return `
<header class="topbar">
  <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
  <div class="top-title" id="topTitle"></div>
  <div class="top-actions">
    <button class="icon-btn" id="btnSync" title="Sinkronkan dengan server">${ic('i-sync')}</button>
    <a class="who" href="profil.html"><div class="avatar" id="avatar">A</div><div><b id="topName">Pengguna</b><small>Pengguna</small></div></a>
  </div>
</header>`;
  }

  function bottomNav(active) {
    return `
<nav class="bottom-nav" id="bottomNav">
  ${NAV.map(n => n.key === 'tengah'
      ? `<a href="deteksi-makanan.html" id="navTengah" class="nav-tengah"><span class="bulat">${ic('i-camera')}</span><span class="lbl">Foto</span></a>`
      : `<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${ic(n.icon)}<span>${n.label}</span></a>`).join('')}
</nav>`;
  }

  function segarkanTombolTengah(ctl) {
    const t = tombolTengah(ctl);
    const nav = document.getElementById('navTengah');
    if (nav) {
      nav.href = t.href;
      nav.classList.toggle('aktif', t.aktif);
      nav.querySelector('.bulat').innerHTML = ic(t.icon);
      nav.querySelector('.lbl').textContent = t.label;
    }
    const side = document.getElementById('sideTengah');
    if (side) { side.href = t.href; side.innerHTML = `${ic(t.icon)} ${t.aktif ? 'Sesi Berjalan' : 'Foto Makanan'}`; }
  }

  /* ---------- helper tampilan bersama ---------- */
  const UI = {
    $: (id) => document.getElementById(id),
    ic, esc,
    toast(msg) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('show'), 3200);
    },
    tanggal(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    },
    tanggalSaja(ts) { return ts ? new Date(ts).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'; },
    jam(ts) { return ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./, ':') : '—'; },
    angka(n, digit = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '—';
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit });
    },
    /** "3 jam lalu" — setiap angka wajib membawa waktu ukurnya. */
    lalu(ts) {
      if (!ts) return '—';
      const s = Math.round((Date.now() - new Date(ts)) / 1000);
      if (s < 60) return 'baru saja';
      if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
      if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
      return `${Math.floor(s / 86400)} hari lalu`;
    },
    durasi(detik) {
      const d = Math.max(0, Math.round(detik));
      const j = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
      return j ? `${j}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },
    identitas() {
      const u = Pengaturan.user();
      const inisial = (u.nama || 'P').charAt(0).toUpperCase();
      document.querySelectorAll('[data-user="nama"]').forEach(e => e.textContent = u.nama || 'Pengguna');
      document.querySelectorAll('[data-user="email"]').forEach(e => e.textContent = u.email || '—');
      document.querySelectorAll('[data-user="inisial"]').forEach(e => e.textContent = inisial);
      const av = document.getElementById('avatar'); if (av) av.textContent = inisial;
      const tn = document.getElementById('topName'); if (tn) tn.textContent = u.nama || 'Pengguna';
    },
    /** Modal konfirmasi sederhana; mengembalikan Promise<boolean>. */
    konfirmasi({ judul, isi, ya = 'Ya', tidak = 'Batal', bahaya = false }) {
      return new Promise(res => {
        const m = document.createElement('div');
        m.className = 'modal';
        m.innerHTML = `<div class="modal-box"><h3>${esc(judul)}</h3><p class="muted" style="margin-bottom:1.2rem">${isi}</p>
          <div class="row gap"><button class="btn-ghost block" data-k="0">${esc(tidak)}</button><button class="${bahaya ? 'btn-ghost danger' : 'btn-primary'} block" data-k="1">${esc(ya)}</button></div></div>`;
        m.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b && e.target !== m) return; m.remove(); res(b ? b.dataset.k === '1' : false); });
        document.body.appendChild(m);
      });
    },
    /** URL objek untuk foto sesi dari IndexedDB, atau null. */
    async urlFoto(sesiId) {
      try { const b = await window.DB.muatFoto(sesiId); return b ? URL.createObjectURL(b) : null; } catch { return null; }
    },
    spanduk(html, kelas = '') {
      const w = document.getElementById('spanduk');
      if (!w) return;
      const d = document.createElement('div'); d.className = 'spanduk ' + kelas; d.innerHTML = html; w.appendChild(d);
    },
  };

  /* ---------- perakitan aplikasi ---------- */
  const App = { ctl: null, jam: null, settings: null, halamanAuth: false };
  // Dibuat sejak awal supaya skrip mana pun boleh `await App.siap` kapan saja.
  let _siapOk, _siapGagal;
  App.siap = new Promise((ok, no) => { _siapOk = ok; _siapGagal = no; });

  function jadwalBawaan(settings) {
    if (!settings.jadwalUji) return window.Model.jadwalNormal;
    const f = Number(settings.faktorJadwalUji) || window.Model.faktorJadwalUji;
    const j = window.Model.jadwalNormal.dibagi(f);
    window.Model.jadwalUji = j;   // sesi uji lama dinilai dengan jadwal uji yang berlaku
    return j;
  }

  async function rakit() {
    const settings = Pengaturan.semua();
    App.settings = settings;
    let riwayat = [];
    try { await window.DB.buka(); riwayat = await window.DB.muatSemuaSesi(); }
    catch (e) {
      // Basis data gagal dibuka → layar yang menjelaskan, bukan layar kosong.
      document.getElementById('content').innerHTML = `<div class="card"><h3>Aplikasi tidak bisa dimulai</h3><p class="muted" style="margin-top:.5rem">Penyimpanan browser tidak bisa dibuka (${esc(e.message)}). Coba tutup tab lain yang membuka AsaWatch, atau bersihkan data situs ini.</p></div>`;
      throw e;
    }
    const jam = window.Jam.buatJamBawaan(settings);
    const ctl = new window.SesiMakanController({ jam, jadwal: jadwalBawaan(settings), riwayatAwal: riwayat });
    App.jam = jam; App.ctl = ctl;

    // Penjaga sesi: 401 dari endpoint ber-token → keluar, dengan alasannya.
    let sudah = false;
    window.Server.setOnTokenDitolak(() => {
      if (sudah) return; sudah = true;
      try { sessionStorage.setItem('aw_alasan_keluar', 'Sesi Anda sudah berakhir. Silakan masuk lagi.'); } catch { }
      location.replace('login.html');
    });

    ctl.on('ubah', () => segarkanTombolTengah(ctl));
    jam.on('status', (st) => {
      const chip = document.querySelector('#watch-chip span');
      if (chip) chip.textContent = st.tersambung ? (st.namaPerangkat || 'Terhubung') + (st.baterai != null ? ` · ${st.baterai}%` : '') : st.sedangMenyambung ? 'Menyambung…' : 'Belum terhubung';
    });
    jam.on('galat', ({ pesan }) => UI.toast(pesan));
    segarkanTombolTengah(ctl);

    if (settings.jadwalUji) UI.spanduk(`${ic('i-warn')} <b>MODE JADWAL UJI</b> — sesi berjalan ${UI.angka(settings.faktorJadwalUji || 60)}× lebih cepat; sesi yang direkam ditandai <i>sesi uji</i>.`, 'uji');
    if (settings.simulasi) UI.spanduk(`${ic('i-watch')} <b>JAM PALSU</b> — tidak ada perangkat sungguhan yang dipakai.`, 'palsu');

    // Ganti akun harus dibersihkan SEBELUM unggahan pertama.
    await ctl.sinkronSetelahMasuk();
    ctl.kirimRiwayatKeServer();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ctl.kirimRiwayatKeServer(); });
    jam.sambungUlangSenyap();
    return App;
  }

  /* ---------- pasang kerangka ---------- */
  function mount() {
    const body = document.body;
    const active = body.dataset.nav || body.dataset.page || '';
    body.insertAdjacentHTML('afterbegin', SPRITE);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => { });

    if (body.classList.contains('auth-page')) {
      App.halamanAuth = true;
      body.insertAdjacentHTML('beforeend', `<div id="toast" class="toast"></div>`);
      _siapOk(App);
      return;
    }

    if (!localStorage.getItem('aw_token')) { App.dialihkan = true; location.replace('login.html'); return; }

    const inner = document.getElementById('page-content');
    body.insertAdjacentHTML('beforeend', `
<div class="app">
  ${sidebar(active)}
  <div class="main">
    ${topbar()}
    <div id="spanduk"></div>
    <div class="content" id="content"></div>
  </div>
</div>
${bottomNav(active)}
<div id="toast" class="toast"></div>`);
    if (inner) document.getElementById('content').append(...inner.childNodes);
    inner?.remove();
    UI.identitas();
    const judul = document.querySelector('.page-head h2, .page-head .title');
    const tt = document.getElementById('topTitle'); if (tt && judul) tt.textContent = judul.textContent.trim();

    document.getElementById('hamburger')?.addEventListener('click', e => { e.stopPropagation(); document.getElementById('sidebar')?.classList.toggle('open'); });
    document.addEventListener('click', e => {
      const sb = document.getElementById('sidebar');
      if (sb?.classList.contains('open') && !sb.contains(e.target)) sb.classList.remove('open');
    });
    document.getElementById('btnSync')?.addEventListener('click', async () => {
      UI.toast('Menyinkronkan…');
      await App.ctl?.kirimRiwayatKeServer();
      UI.toast(navigator.onLine ? 'Sinkronisasi selesai' : 'Offline — akan disinkronkan saat online');
    });

    // Identitas disegarkan dari server; token yang ditolak → login.
    window.Server.saya().then(data => {
      const nama = data?.nama || data?.profil?.nama || data?.user?.nama;
      const email = data?.email || data?.user?.email;
      if (nama || email) { Pengaturan.setUser({ ...Pengaturan.user(), ...(nama && { nama }), ...(email && { email }) }); UI.identitas(); }
    }).catch(() => { /* offline bukan berarti sesi berakhir; 401 ditangani penjaga */ });

    rakit().then(_siapOk, (e) => { console.error('[AsaWatch] Gagal merakit aplikasi:', e); _siapGagal(e); });
  }

  window.UI = UI;
  window.Pengaturan = Pengaturan;
  window.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
