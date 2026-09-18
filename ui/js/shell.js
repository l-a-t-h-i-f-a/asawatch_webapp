/**
 * shell.js — kerangka bersama semua halaman UI (sprite ikon, sidebar, topbar,
 * bottom nav, toast). Halaman cukup menulis <body data-page="beranda">.
 */
(function () {
  'use strict';

  /* ---------- sprite ikon ---------- */
  const SPRITE = `
<svg class="sprite" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20.5 4.2 13a4.9 4.9 0 0 1 0-7 4.6 4.6 0 0 1 6.6 0l1.2 1.2 1.2-1.2a4.6 4.6 0 0 1 6.6 0 4.9 4.9 0 0 1 0 7Z"/></symbol>
<symbol id="i-pulse" viewBox="0 0 24 24"><path d="M2 12h4l2.5-6 4 13L15 12h7"/></symbol>
<symbol id="i-heartbeat" viewBox="0 0 24 24"><path d="M20.8 6.2a4.6 4.6 0 0 0-6.6 0L12 8.4l-2.2-2.2a4.6 4.6 0 0 0-6.6 6.6l1 1h3.3l1.3-2.6 2.2 5.2 1.7-3.4h3.5l1.6-1.6a4.6 4.6 0 0 0 0-6.6Z"/></symbol>
<symbol id="i-drop" viewBox="0 0 24 24"><path d="M12 3.2s6 6.1 6 10a6 6 0 1 1-12 0c0-3.9 6-10 6-10Z"/></symbol>
<symbol id="i-gauge" viewBox="0 0 24 24"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></symbol>
<symbol id="i-food" viewBox="0 0 24 24"><path d="M6 3v8a2.5 2.5 0 0 0 5 0V3"/><path d="M8.5 11v10"/><path d="M17.5 3c-1.4 1.6-2 3.4-2 5.5 0 1.6.7 2.8 2 3.5v9"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5v-6h5v6"/></symbol>
<symbol id="i-history" viewBox="0 0 24 24"><path d="M6 3.5h8.5L19 8v12.5H6Z"/><path d="M14 3.5V8h5"/><path d="M9 12.5h6M9 16h4"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 14-.6 1.4 1.2 2-2.6 2.6-2-1.2-1.4.6-.6 2.2h-3.6L9.2 21l-1.4-.6-2 1.2L3.2 19l1.2-2-.6-1.4L1.8 15V11.4l1.9-.6.6-1.4-1.1-2 2.5-2.6 2 1.2L9.2 5l.6-2.2h3.6l.6 2.2 1.4.6 2-1.2 2.6 2.6-1.2 2 .6 1.4 2.2.6V14Z"/></symbol>
<symbol id="i-bell" viewBox="0 0 24 24"><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></symbol>
<symbol id="i-watch" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="4"/><path d="M9 6V3h6v3M9 18v3h6v-3"/><path d="M12 10v2.4l1.6 1"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/></symbol>
<symbol id="i-steps" viewBox="0 0 24 24"><path d="M7.5 3.5c1.7 0 2.5 1.4 2.5 3.3 0 1.5-.7 2.6-.7 4 0 1.4.4 2.4-1.8 2.4s-2.5-1-2.5-2.6c0-1.8.4-2.6.4-4.1 0-1.9.4-3 2.1-3Z"/><path d="M16.5 8.5c1.7 0 2.1 1.1 2.1 3 0 1.5.4 2.3.4 4.1 0 1.6-.3 2.6-2.5 2.6s-1.8-1-1.8-2.4c0-1.4-.7-2.5-.7-4 0-1.9.8-3.3 2.5-3.3Z"/><path d="M5 17.5c0 1.6 1 2.5 2.6 2.5s2.4-.8 2.4-2.2M19 12c0-1.6-1-2.5-2.6-2.5"/></symbol>
<symbol id="i-fire" viewBox="0 0 24 24"><path d="M12 3s5 4 5 8.5A5 5 0 0 1 7 12c0-1.6.8-2.8.8-2.8S9 11 10.5 11C10.5 8 12 5.5 12 3Z"/><path d="M12 20.5A5 5 0 0 0 17 15.5"/></symbol>
<symbol id="i-activity" viewBox="0 0 24 24"><path d="M3 12h4l2-5 3.5 11L15 12h6"/></symbol>
<symbol id="i-scale" viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8.5 11.5 12 8l3.5 3.5"/><path d="M8 15.5h8"/></symbol>
<symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/></symbol>
<symbol id="i-headset" viewBox="0 0 24 24"><path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="2.8" y="13.4" width="4" height="6" rx="2"/><rect x="17.2" y="13.4" width="4" height="6" rx="2"/><path d="M19.5 19.4c0 1.4-1.6 2.2-3.5 2.2"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.2A2 2 0 0 1 6 3.4h5v17H6a2 2 0 0 0-2 1.8Z"/><path d="M20 5.2a2 2 0 0 0-2-1.8h-5v17h5a2 2 0 0 1 2 1.8Z"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7 8.2 6 8.2-6"/></symbol>
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M10.5 17.5h3"/></symbol>
<symbol id="i-chat" viewBox="0 0 24 24"><path d="M20.5 11.5c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.9-.4l-4.6 1.6 1.5-3.8a7 7 0 0 1-2-4.8C4 7.4 7.8 4.1 12 4.1s8.5 3.3 8.5 7.4Z"/></symbol>
<symbol id="i-sync" viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-13.7 5.6"/><path d="M4 12a8 8 0 0 1 13.7-5.6"/><path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.3"/><path d="M12 7.5V12l3 1.8"/></symbol>
<symbol id="i-palette" viewBox="0 0 24 24"><path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8s3.8 8 8.5 8c1.3 0 2-.8 2-1.8s-.8-1.4-.8-2.2.6-1.3 1.5-1.3h1.6c2.3 0 4.2-1.8 4.2-4.1 0-3.6-3.6-6.6-8.5-6.6Z"/><circle cx="8" cy="10" r="1.1" fill="currentColor"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/><circle cx="16" cy="10.5" r="1.1" fill="currentColor"/></symbol>
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
<symbol id="i-water" viewBox="0 0 24 24"><path d="M12 3.2s6 6.1 6 10a6 6 0 1 1-12 0c0-3.9 6-10 6-10Z"/><path d="M9.2 13.8a2.8 2.8 0 0 0 2.8 2.8"/></symbol>
<symbol id="i-logout" viewBox="0 0 24 24"><path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M17 8.5 20.5 12 17 15.5M10 12h10"/></symbol>
</svg>`;

  /* ---------- menu sidebar ---------- */
  const NAV = [
    { key: 'beranda', label: 'Beranda', icon: 'i-home', href: 'dashboard.html' },
    { key: 'kesehatan', label: 'Data Kesehatan', icon: 'i-heart', href: 'detak-jantung.html' },
    { key: 'nutrisi', label: 'Nutrisi Makanan', icon: 'i-food', href: 'deteksi-makanan.html' },
    { key: 'riwayat', label: 'Riwayat', icon: 'i-history', href: 'riwayat.html' },
    { key: 'profil', label: 'Profil', icon: 'i-user', href: 'profil.html' },
    { key: 'pengaturan', label: 'Pengaturan', icon: 'i-settings', href: 'pengaturan-perangkat.html' },
  ];
  const BOTTOM = ['beranda', 'kesehatan', 'nutrisi', 'riwayat', 'profil'];

  const ic = id => `<svg><use href="#${id}"/></svg>`;

  function sidebar(active) {
    return `
<aside class="sidebar" id="sidebar">
  <a class="side-brand" href="dashboard.html">
    <div class="brand-mark sm">${ic('i-heartbeat')}</div><b>AsaWatch</b>
  </a>
  <nav class="side-nav">
    ${NAV.map(n => `<a href="${n.href}" data-nav="${n.key}" class="${n.key === active ? 'active' : ''}">${ic(n.icon)} ${n.label}</a>`).join('')}
  </nav>
  <div class="side-foot">
    <div id="watch-chip" class="chip">${ic('i-watch')} <span>Belum terhubung</span></div>
  </div>
</aside>`;
  }

  function topbar() {
    return `
<header class="topbar">
  <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
  <div class="search">${ic('i-search')}<input placeholder="Cari fitur, data, atau informasi..."></div>
  <div class="top-actions">
    <button class="icon-btn" id="btnSync" title="Sinkronkan data">${ic('i-sync')}</button>
    <button class="icon-btn" title="Notifikasi">${ic('i-bell')}<em class="dot"></em></button>
    <a class="who" href="profil.html">
      <div class="avatar" id="avatar">A</div>
      <div><b id="topName">Pengguna</b><small>Pengguna</small></div>
    </a>
  </div>
</header>`;
  }

  function bottomNav(active) {
    return `
<nav class="bottom-nav" id="bottomNav">
  ${BOTTOM.map(k => {
      const n = NAV.find(x => x.key === k);
      const label = k === 'kesehatan' ? 'Data' : k === 'nutrisi' ? 'Nutrisi' : n.label;
      return `<a href="${n.href}" class="${k === active ? 'active' : ''}">${ic(n.icon)}<span>${label}</span></a>`;
    }).join('')}
</nav>`;
  }

  /* ---------- pasang kerangka ---------- */
  function mount() {
    const body = document.body;
    const active = body.dataset.nav || body.dataset.page || '';
    body.insertAdjacentHTML('afterbegin', SPRITE);

    // PWA: daftarkan service worker dari akar situs
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => { });

    // halaman auth hanya butuh sprite + toast
    if (body.classList.contains('auth-page')) {
      body.insertAdjacentHTML('beforeend', `<div id="toast" class="toast"></div>`);
      return;
    }

    // halaman aplikasi butuh sesi; landing publik ada di luar folder ini
    if (!localStorage.getItem('aw_token')) {
      location.replace('login.html');
      return;
    }
    // Pastikan token masih diterima server; kalau ditolak, kembali ke halaman masuk.
    window.Store?.segarkanIdentitas().then(sah => {
      if (sah === false) location.replace('login.html');
      else window.UI?.identitas();
    });

    const inner = document.getElementById('page-content');
    const html = `
<div class="app">
  ${sidebar(active)}
  <div class="main">
    ${topbar()}
    <div class="content" id="content"></div>
  </div>
</div>
${bottomNav(active)}
<div id="toast" class="toast"></div>`;
    body.insertAdjacentHTML('beforeend', html);
    if (inner) document.getElementById('content').append(...inner.childNodes);
    inner?.remove();

    // sidebar mobile
    document.getElementById('hamburger')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      const sb = document.getElementById('sidebar');
      if (sb?.classList.contains('open') && !sb.contains(e.target)) sb.classList.remove('open');
    });

    document.getElementById('btnSync')?.addEventListener('click', async () => {
      window.UI.toast('Menyinkronkan…');
      try {
        const { terkirim, sisa } = await window.Store.kirimAntrean();
        await window.Store.muatSesi(true);
        window.UI.toast(sisa ? `${terkirim} terkirim, ${sisa} masih tertahan`
          : terkirim ? `${terkirim} sesi terkirim` : 'Data sudah terbaru');
      } catch { window.UI.toast('Sinkronisasi gagal'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
