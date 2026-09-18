/**
 * AsaWatch PWA — Main Application Controller
 * Sidebar dashboard layout, BLE, DB, API, charts integration
 */

const U = window.AsaWatchUtils || {};

// ── state ──
const S = {
  token: localStorage.getItem('aw_token'),
  user: JSON.parse(localStorage.getItem('aw_user') || 'null'),
  connected: false,
  info: null,
  battery: null,
  sesiRunning: null,
  samples: [],
  chartHome: null,
  chartDetail: null,
};

// ── refs ──
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── init ──
document.addEventListener('DOMContentLoaded', () => {
  bindAuth();
  bindNav();
  bindDevice();
  bindKesehatan();
  bindNutrisi();
  bindRiwayat();
  bindProfil();
  bindTopbar();

  if (S.token) showApp();
  else showAuth();
});

/* ============================================================
   NAVIGATION
   ============================================================ */
function bindNav() {
  // sidebar
  $$('.side-nav a, .bottom-nav a, [data-nav]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const t = el.dataset.nav;
      if (t) goTo(t);
    });
  });
  $('hamburger')?.addEventListener('click', () => $('sidebar')?.classList.toggle('open'));

  // close sidebar on overlay click (mobile)
  document.addEventListener('click', e => {
    const sb = $('sidebar');
    if (sb?.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'hamburger')
      sb.classList.remove('open');
  });
}

function goTo(page) {
  $$('.page').forEach(p => p.classList.add('hidden'));
  const t = $(`[data-page="${page}"]`);
  if (t) t.classList.remove('hidden');

  // active nav
  $$('.side-nav a, .bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
  $('sidebar')?.classList.remove('open');

  // page-specific init
  if (page === 'beranda') refreshBeranda();
  if (page === 'kesehatan') refreshKesehatan();
  if (page === 'riwayat') loadRiwayat();
  if (page === 'profil') refreshProfil();
}

/* ============================================================
   AUTH
   ============================================================ */
function bindAuth() {
  // switch login / register
  $$('.auth-switch .as-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.auth-switch .as-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.auth;
      $('loginForm').classList.toggle('hidden', t !== 'login');
      $('registerForm').classList.toggle('hidden', t !== 'register');
    });
  });
  // register link inside login form
  $$('[data-auth="register"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      $$('.auth-switch .as-btn').forEach(b => b.classList.remove('active'));
      $$('.auth-switch .as-btn')[1]?.classList.add('active');
      $('loginForm').classList.add('hidden');
      $('registerForm').classList.remove('hidden');
    });
  });

  // login submit
  $('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('loginId').value.trim();
    const pass = $('loginPass').value;
    if (!id || !pass) return toast('Isi email & password');

    try {
      const r = await fetch(apiUrl('/api/v1/auth/masuk'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: id, kata_sandi: pass, nama_perangkat: 'AsaWatch Web' })
      });
      const d = await r.json();
      if (r.ok && d.data) {
        S.token = d.data.token;
        S.user = d.data.profil;
        localStorage.setItem('aw_token', S.token);
        localStorage.setItem('aw_user', JSON.stringify(S.user));
        showApp();
        toast('Login berhasil!');
      } else {
        toast(d.galat?.detail || d.galat?.pesan || 'Login gagal');
      }
    } catch { toast('Gagal terhubung ke server'); }
  });

  // register submit
  $('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nama = $('regName').value.trim();
    const email = $('regEmail').value.trim();
    const pass = $('regPass').value;
    const pass2 = $('regPass2').value;
    if (pass !== pass2) return toast('Password tidak cocok');
    if (pass.length < 8) return toast('Password minimal 8 karakter');

    try {
      const r = await fetch(apiUrl('/api/v1/auth/daftar'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, email, kata_sandi: pass, nama_perangkat: 'AsaWatch Web' })
      });
      const d = await r.json();
      if (r.ok) {
        toast('Registrasi berhasil! Silakan masuk.');
        // switch to login
        $$('.auth-switch .as-btn')[0]?.click();
        $('loginId').value = email;
      } else {
        toast(d.galat?.detail || 'Registrasi gagal');
      }
    } catch { toast('Gagal terhubung ke server'); }
  });
}

function showAuth() {
  $('auth-screen')?.classList.remove('hidden');
  $('app')?.classList.add('hidden');
  $('bottomNav')?.classList.add('hidden');
}
function showApp() {
  $('auth-screen')?.classList.add('hidden');
  $('app')?.classList.remove('hidden');
  $('bottomNav')?.classList.remove('hidden');
  refreshBeranda();
  updateIdentityUI();
}
function updateIdentityUI() {
  const name = S.user?.nama || S.user?.name || 'Pengguna';
  const email = S.user?.email || '—';
  const initial = name.charAt(0).toUpperCase();
  if ($('heroName')) $('heroName').textContent = name;
  if ($('topName')) $('topName').textContent = name;
  if ($('avatar')) $('avatar').textContent = initial;
  if ($('pName')) $('pName').textContent = name;
  if ($('pMail')) $('pMail').textContent = email;
  if ($('pAvatar')) $('pAvatar').textContent = initial;
}

/* ============================================================
   TOPBAR
   ============================================================ */
function bindTopbar() {
  $('btnSync')?.addEventListener('click', async () => {
    if (!S.token) return toast('Belum login');
    toast('Menyinkronkan data…');
    try {
      if (window.api?.syncPendingData) await window.api.syncPendingData();
      toast('Sinkronisasi selesai!');
    } catch { toast('Sinkronisasi gagal'); }
  });
}

/* ============================================================
   BERANDA
   ============================================================ */
function refreshBeranda() {
  updateIdentityUI();
  renderHomeChart();
}

function renderHomeChart() {
  const ctx = $('chartHome');
  if (!ctx || typeof Chart === 'undefined') return;
  if (S.chartHome) S.chartHome.destroy();

  const labels = ['Baseline', '+2 jam', '+4 jam', '+6 jam'];
  const gula = [null, null, null, null];
  const detak = [null, null, null, null];
  const tensiS = [null, null, null, null];

  // fill from latest samples if available
  if (S.samples.length) {
    S.samples.forEach((s, i) => {
      if (i < 4) {
        gula[i] = s.gulaDarah;
        detak[i] = s.detakJantung;
        tensiS[i] = s.sistolik;
      }
    });
  }

  S.chartHome = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Gula Darah', data: gula, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', fill: true, tension: .3 },
        { label: 'Detak Jantung', data: detak, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.08)', fill: true, tension: .3, yAxisID: 'y2' },
        { label: 'Sistolik', data: tensiS, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.08)', fill: true, tension: .3, yAxisID: 'y2' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } } },
      scales: {
        y: { position: 'left', title: { display: true, text: 'mg/dL' }, min: 50, max: 200 },
        y2: { position: 'right', title: { display: true, text: 'bpm / mmHg' }, grid: { drawOnChartArea: false } },
      }
    }
  });
}

/* ============================================================
   DATA KESEHATAN (detail metric)
   ============================================================ */
const METRIC_INFO = {
  detak: { icon: 'i-heart', tone: 'red', label: 'Detak Jantung', unit: 'bpm', key: 'detakJantung', lo: 60, hi: 100, color: '#e5484d' },
  gula: { icon: 'i-drop', tone: 'green', label: 'Gula Darah', unit: 'mg/dL', key: 'gulaDarah', lo: 70, hi: 140, color: '#2fa360' },
  tensi: { icon: 'i-gauge', tone: 'blue', label: 'Tensi', unit: 'mmHg', key: 'sistolik', lo: 90, hi: 140, color: '#3d82f6' },
  spo2: { icon: 'i-activity', tone: 'violet', label: 'SpO2', unit: '%', key: 'spo2', lo: 95, hi: 100, color: '#8b6cf0' },
};

/** Ganti isi tile ikon dengan simbol dari sprite + warna sesuai metrik. */
function setMetricIcon(el, m) {
  if (!el) return;
  el.className = `ic ${m.tone} lg`;
  el.innerHTML = `<svg><use href="#${m.icon}"/></svg>`;
}
let currentMetric = 'detak';

function bindKesehatan() {
  $$('.pill[data-metric]').forEach(p => {
    p.addEventListener('click', () => {
      $$('.pill[data-metric]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      currentMetric = p.dataset.metric;
      refreshKesehatan();
    });
  });
}

function refreshKesehatan() {
  const m = METRIC_INFO[currentMetric];
  if (!m) return;
  setMetricIcon($('dIcon'), m);
  if ($('thVal')) $('thVal').textContent = m.label;

  const samples = S.samples.filter(s => s[m.key] !== null && s[m.key] !== 0);
  if (samples.length === 0) {
    if ($('dValue')) $('dValue').textContent = '— ' + m.unit;
    if ($('dTag')) { $('dTag').textContent = 'Belum ada data'; $('dTag').className = 'tag'; }
    if ($('stMax')) $('stMax').textContent = '—';
    if ($('stMin')) $('stMin').textContent = '—';
    if ($('stAvg')) $('stAvg').textContent = '—';
    if ($('stN')) $('stN').textContent = '0';
    renderDetailChart(m, []);
    renderDetailTable(m, []);
    return;
  }

  const vals = samples.map(s => s[m.key]);
  const last = vals[vals.length - 1];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length);

  if ($('dValue')) $('dValue').textContent = `${last} ${m.unit}`;
  if ($('dSub')) $('dSub').textContent = m.label;

  const ok = last >= m.lo && last <= m.hi;
  if ($('dTag')) {
    $('dTag').textContent = ok ? 'Normal' : (last < m.lo ? 'Rendah' : 'Tinggi');
    $('dTag').className = 'tag ' + (ok ? 'ok' : 'danger');
  }
  if ($('stMax')) $('stMax').textContent = `${max} ${m.unit}`;
  if ($('stMin')) $('stMin').textContent = `${min} ${m.unit}`;
  if ($('stAvg')) $('stAvg').textContent = `${avg.toFixed(1)} ${m.unit}`;
  if ($('stN')) $('stN').textContent = vals.length;

  renderDetailChart(m, samples);
  renderDetailTable(m, samples);
}

function renderDetailChart(m, samples) {
  const ctx = $('chartDetail');
  if (!ctx || typeof Chart === 'undefined') return;
  if (S.chartDetail) S.chartDetail.destroy();

  const labels = samples.map((_, i) => i === 0 ? 'Baseline' : `#${i}`);
  const data = samples.map(s => s[m.key]);

  S.chartDetail = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: m.label, data, borderColor: m.color,
        backgroundColor: m.color + '18', fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: m.color,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: m.unit } } },
    }
  });
}

function renderDetailTable(m, samples) {
  const tbody = $('tbDetail');
  if (!tbody) return;
  if (!samples.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">Belum ada data.</td></tr>`;
    return;
  }
  tbody.innerHTML = samples.slice().reverse().map(s => {
    const v = s[m.key];
    const ok = v >= m.lo && v <= m.hi;
    return `<tr><td>${formatTime(s)}</td><td>${v} ${m.unit}</td><td><span class="tag ${ok ? 'ok' : 'danger'}">${ok ? 'Normal' : 'Abnormal'}</span></td></tr>`;
  }).join('');
}

/* ============================================================
   NUTRISI / DETEKSI MAKANAN
   ============================================================ */
function bindNutrisi() {
  $('btnCam')?.addEventListener('click', startCamera);
  $('btnUpload')?.addEventListener('click', () => $('filePick')?.click());
  $('filePick')?.addEventListener('change', handleFilePick);
  $('btnStartSession')?.addEventListener('click', startFoodSession);
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('camView');
    if (!video) return;
    video.srcObject = stream;
    video.classList.remove('hidden');
    $('shotImg')?.classList.add('hidden');
    $('shotEmpty')?.classList.add('hidden');
  } catch { toast('Tidak dapat mengakses kamera'); }
}

function handleFilePick(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = $('shotImg');
    if (img) { img.src = ev.target.result; img.classList.remove('hidden'); }
    $('camView')?.classList.add('hidden');
    $('shotEmpty')?.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function startFoodSession() {
  toast('Mulai sesi makan — sambungkan jam untuk pengukuran');
  goTo('kesehatan');
}

/* ============================================================
   RIWAYAT
   ============================================================ */
let riwayatFilter = 'semua';
let riwayatPage = 1;
const RIWAYAT_PER_PAGE = 10;

function bindRiwayat() {
  $$('.pill[data-hist]').forEach(p => {
    p.addEventListener('click', () => {
      $$('.pill[data-hist]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      riwayatFilter = p.dataset.hist;
      riwayatPage = 1;
      loadRiwayat();
    });
  });
}

async function loadRiwayat() {
  const tbody = $('tbHistory');
  if (!tbody) return;

  let sessions = [];
  try {
    if (window.db?.getAllSessions) sessions = await window.db.getAllSessions();
  } catch {}

  if (!sessions.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Belum ada riwayat data kesehatan.</td></tr>`;
    $('pager').innerHTML = '';
    return;
  }

  // flatten samples from sessions
  let rows = [];
  for (const sesi of sessions) {
    try {
      const samps = await window.db.getSamplesBySession(sesi.sesiId);
      for (const s of samps) {
        if (riwayatFilter === 'jantung' && !s.detakJantung) continue;
        if (riwayatFilter === 'gula' && !s.gulaDarah) continue;
        if (riwayatFilter === 'tensi' && !s.sistolik) continue;
        if (riwayatFilter === 'kalori') continue; // no calorie data yet
        rows.push(s);
      }
    } catch {}
  }

  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const total = rows.length;
  const pages = Math.ceil(total / RIWAYAT_PER_PAGE);
  const start = (riwayatPage - 1) * RIWAYAT_PER_PAGE;
  const page = rows.slice(start, start + RIWAYAT_PER_PAGE);

  tbody.innerHTML = page.map(s => {
    const t = formatTime(s);
    const jenis = [];
    if (s.detakJantung) jenis.push(`<span class="cell-ic red"><svg><use href="#i-heart"/></svg></span>${s.detakJantung} bpm`);
    if (s.gulaDarah) jenis.push(`<span class="cell-ic green"><svg><use href="#i-drop"/></svg></span>${s.gulaDarah} mg/dL`);
    if (s.sistolik) jenis.push(`<span class="cell-ic blue"><svg><use href="#i-gauge"/></svg></span>${s.sistolik}/${s.diastolik} mmHg`);
    if (s.spo2) jenis.push(`<span class="cell-ic violet"><svg><use href="#i-activity"/></svg></span>${s.spo2}%`);
    const ok = isNormal(s);
    return `<tr><td>${t}</td><td>${jenis[0] || '—'}</td><td>${jenis.slice(1).join(' · ') || '—'}</td><td><span class="tag ${ok ? 'ok' : 'danger'}">${ok ? 'Normal' : 'Perhatian'}</span></td><td></td></tr>`;
  }).join('') || `<tr><td colspan="5" class="empty">Tidak ada data untuk filter ini.</td></tr>`;

  // pager
  const pager = $('pager');
  if (!pager) return;
  pager.innerHTML = '';
  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === riwayatPage) btn.className = 'active';
    btn.addEventListener('click', () => { riwayatPage = i; loadRiwayat(); });
    pager.appendChild(btn);
  }
}

/* ============================================================
   PROFIL
   ============================================================ */
function bindProfil() {
  $('btnLogout')?.addEventListener('click', async () => {
    try {
      if (S.token) {
        await fetch(apiUrl('/api/v1/auth/keluar'), {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }
        }).catch(() => {});
      }
    } finally {
      S.token = null; S.user = null;
      localStorage.removeItem('aw_token');
      localStorage.removeItem('aw_user');
      showAuth();
      toast('Berhasil logout');
    }
  });
}

function refreshProfil() { updateIdentityUI(); }

/* ============================================================
   DEVICE (Bluetooth)
   ============================================================ */
function bindDevice() {
  $('btnConnect')?.addEventListener('click', connectWatch);
  $('btnDisconnect')?.addEventListener('click', disconnectWatch);
  $('btnMeasure')?.addEventListener('click', measureNow);
}

async function connectWatch() {
  if (!navigator.bluetooth) { toast('Web Bluetooth tidak didukung di browser ini'); return; }
  try {
    toast('Mencari AsaWatch…');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'AsaWatch' }, { services: ['battery_service'] }],
      optionalServices: ['battery_service'],
    });
    const server = await device.gatt.connect();
    S.connected = true;
    $('btnConnect')?.classList.add('hidden');
    $('btnDisconnect')?.classList.remove('hidden');
    const ds = $('devState'); if (ds) ds.textContent = 'Terhubung';
    const pc = $('pConn'); if (pc) { pc.textContent = 'Terhubung'; pc.className = 'tag ok'; }
    toast('Terhubung dengan ' + (device.name || 'AsaWatch'));

    // try read battery
    try {
      const svc = await server.getPrimaryService('battery_service');
      const ch = await svc.getCharacteristic('battery_level');
      const val = await ch.readValue();
      S.battery = val.getUint8(0);
      $('devMeta').textContent = `Baterai ${S.battery}%`;
    } catch {}
  } catch (e) {
    if (e.name !== 'NotFoundError') toast('Gagal menyambung: ' + e.message);
  }
}

function disconnectWatch() {
  S.connected = false;
  $('btnConnect')?.classList.remove('hidden');
  $('btnDisconnect')?.classList.add('hidden');
  const ds = $('devState'); if (ds) ds.textContent = 'Terputus';
  const pc = $('pConn'); if (pc) { pc.textContent = 'Terputus'; pc.className = 'tag danger'; }
  toast('Koneksi diputus');
}

async function measureNow() {
  if (!S.connected) { toast('Sambungkan jam terlebih dahulu'); return; }
  const bar = $('measureBar');
  const fill = $('measureFill');
  const text = $('measureText');
  if (bar) bar.classList.remove('hidden');
  if (text) text.textContent = 'Mengukur…';

  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 15 + 5;
    if (pct >= 100) {
      pct = 100;
      clearInterval(iv);
      if (fill) fill.style.width = '100%';
      if (text) text.textContent = 'Pengukuran selesai!';
      // simulate sample
      const s = {
        sesiId: S.sesiRunning || 'demo',
        index: S.samples.length,
        detakJantung: 60 + Math.floor(Math.random() * 40),
        gulaDarah: 85 + Math.floor(Math.random() * 60),
        systolik: 100 + Math.floor(Math.random() * 40),
        diastolik: 60 + Math.floor(Math.random() * 30),
        diastolik: 60 + Math.floor(Math.random() * 30),
        spo2: 94 + Math.floor(Math.random() * 6),
        createdAt: Date.now(),
      };
      S.samples.push(s);
      updateMetricCards(s);
      toast('Pengukuran berhasil!');
      setTimeout(() => bar?.classList.add('hidden'), 2000);
    } else {
      if (fill) fill.style.width = pct + '%';
    }
  }, 300);
}

function updateMetricCards(s) {
  if (s.detakJantung) {
    $('mHr').innerHTML = `${s.detakJantung} <i>bpm</i>`;
  }
  if (s.gulaDarah) {
    $('mGula').innerHTML = `${s.gulaDarah} <i>mg/dL</i>`;
  }
  if (s.sistolik) {
    $('mTensi').innerHTML = `${s.sistolik}/${s.diastolik} <i>mmHg</i>`;
  }
}

/* ============================================================
   HELPERS
   ============================================================ */
function apiUrl(path) {
  const base = location.hostname === 'localhost' ? 'http://localhost:8000' : '';
  return base + path;
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function formatTime(s) {
  if (!s.createdAt) return '—';
  const d = new Date(s.createdAt);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function isNormal(s) {
  if (s.detakJantung && (s.detakJantung < 60 || s.detakJantung > 100)) return false;
  if (s.gulaDarah && (s.gulaDarah < 70 || s.gulaDarah > 140)) return false;
  if (s.sistolik && (s.sistolik < 90 || s.sistolik > 140)) return false;
  return true;
}

// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
