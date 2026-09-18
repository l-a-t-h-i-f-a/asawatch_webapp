/**
 * kurva.js — grafik dari sampel (Chart.js). Padanan KurvaSampelPainter,
 * KurvaTumpukSesi, SebaranKarbo, dan MiniSparklinePainter di Flutter.
 *
 * Aturan yang dibawa dari sana: sumbu x SELALU diturunkan dari sampel (termasuk
 * yang masih menunggu, agar sesi dua titik tidak direntang seluas kartu), tidak
 * pernah dari literal; sumbu y diskalakan dari data dengan lantai per seri
 * (SpO₂ 8, sisanya 20); titik yang belum ada tidak digambar, bukan diisi nilai lama.
 */
(function () {
  'use strict';

  const M = window.Model;
  const { Sesi, Sampel } = M;

  const Seri = {
    gulaDarah: { kunci: 'gulaDarah', label: 'Gula Darah', satuan: 'mg/dL', warna: '#2fa360', rentangMinimum: 20 },
    detakJantung: { kunci: 'detakJantung', label: 'Detak Jantung', satuan: 'bpm', warna: '#e5484d', rentangMinimum: 20 },
    sistolik: { kunci: 'sistolik', label: 'Sistolik', satuan: 'mmHg', warna: '#3d82f6', rentangMinimum: 20 },
    diastolik: { kunci: 'diastolik', label: 'Diastolik', satuan: 'mmHg', warna: '#f0a132', rentangMinimum: 20 },
    spo2: { kunci: 'spo2', label: 'SpO₂', satuan: '%', warna: '#8b6cf0', rentangMinimum: 8 },
  };

  const ada = () => typeof Chart !== 'undefined';
  const ctxDari = (id) => { const c = typeof id === 'string' ? document.getElementById(id) : id; if (c && c._chart) { c._chart.destroy(); c._chart = null; } return c; };
  const menit = (detik) => detik / 60;
  const labelMenit = (m) => {
    const d = Math.round(m * 60);
    if (d === 0) return 't0';
    if (d < 0) return `−${Math.round(-d / 60)} mnt`;
    if (d % 3600 === 0) return `+${d / 3600} jam`;
    return d >= 3600 ? `+${Math.floor(d / 3600)} j ${Math.round((d % 3600) / 60)} m` : `+${Math.round(d / 60)} mnt`;
  };

  /** Rentang detik dari sampel — ikut yang masih menunggu (nilai jadwal nominal). */
  function rentangDetik(daftarSesi) {
    let min = Infinity, maks = -Infinity;
    for (const s of daftarSesi) for (const sp of s.sampel) {
      if (sp.status === M.StatusSampel.terlewat && !Sampel.terisi(sp)) continue;
      min = Math.min(min, sp.detikRelatifT0); maks = Math.max(maks, sp.detikRelatifT0);
    }
    if (!Number.isFinite(min)) return { min: -600, maks: 7200 };
    if (min === maks) maks = min + 60;
    return { min, maks };
  }

  function batasY(nilai, seri) {
    const v = nilai.filter(x => x != null);
    if (!v.length) return {};
    let lo = Math.min(...v), hi = Math.max(...v);
    if (hi - lo < seri.rentangMinimum) { const t = (seri.rentangMinimum - (hi - lo)) / 2; lo -= t; hi += t; }
    const pad = (hi - lo) * 0.15;
    return { suggestedMin: Math.floor(lo - pad), suggestedMax: Math.ceil(hi + pad) };
  }

  const dasar = (opsi = {}) => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'nearest' },
    plugins: {
      legend: { display: !!opsi.legenda, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, padding: 12 } },
      tooltip: { backgroundColor: '#14301f', padding: 10, cornerRadius: 8, displayColors: false, callbacks: opsi.tooltip || {} },
    },
    scales: {
      x: { type: 'linear', grid: { display: false }, ticks: { color: '#93a399', font: { size: 11 }, callback: (v) => labelMenit(v), maxRotation: 0, autoSkip: true }, ...(opsi.x || {}) },
      y: { border: { display: false }, grid: { color: '#f2f6f3' }, ticks: { color: '#93a399', font: { size: 11 } }, ...(opsi.y || {}) },
    },
    elements: { point: { radius: 4, hoverRadius: 6, backgroundColor: '#fff', borderWidth: 2 }, line: { tension: .3 } },
  });

  const Kurva = {
    Seri, rentangDetik,

    /** Kurva satu sesi untuk satu/dua seri. Baseline sebagai garis putus tanpa angka. */
    sesi(canvas, sesi, daftarSeri, { baseline = true } = {}) {
      const c = ctxDari(canvas); if (!c || !ada()) return null;
      const { min, maks } = rentangDetik([sesi]);
      const titikTerisi = sesi.sampel.filter(sp => Sampel.terisi(sp));
      const datasets = daftarSeri.map(seri => ({
        label: `${seri.label} (${seri.satuan})`, borderColor: seri.warna, pointBorderColor: seri.warna,
        backgroundColor: seri.warna + '18', fill: daftarSeri.length === 1, borderWidth: 2.4,
        data: titikTerisi.filter(sp => sp[seri.kunci] != null).map(sp => ({ x: menit(sp.detikRelatifT0), y: sp[seri.kunci], sp })),
        spanGaps: true,
      }));
      const dasarY = baseline && daftarSeri.length === 1 ? Sesi.baseline(sesi)?.[daftarSeri[0].kunci] : null;
      if (dasarY != null) datasets.push({
        label: 'baseline', data: [{ x: menit(min), y: dasarY }, { x: menit(maks), y: dasarY }],
        borderColor: '#9cb1ac', borderDash: [5, 5], borderWidth: 1.2, pointRadius: 0, fill: false,
      });
      const semuaNilai = datasets.flatMap(d => d.data.map(p => p.y));
      c._chart = new Chart(c, {
        type: 'line', data: { datasets },
        options: dasar({
          legenda: daftarSeri.length > 1,
          x: { min: menit(min), max: menit(maks), ticks: { color: '#93a399', font: { size: 11 }, callback: (v) => labelMenit(v), maxRotation: 0 }, afterBuildTicks: (sk) => { sk.ticks = sesi.sampel.map(sp => ({ value: menit(sp.detikRelatifT0) })); } },
          y: batasY(semuaNilai, daftarSeri[0]),
          tooltip: {
            title: (it) => it[0]?.raw?.sp ? Sesi.labelSampel(sesi, it[0].raw.sp) : labelMenit(it[0].parsed.x),
            label: (it) => it.raw?.sp ? `${it.dataset.label}: ${it.parsed.y}` : null,
          },
        }),
      });
      return c._chart;
    },

    /** Kurva lintas sesi ditumpuk pada satu sumbu (halaman detail gula darah). */
    tumpuk(canvas, daftarSesi, seri, { maks = 8 } = {}) {
      const c = ctxDari(canvas); if (!c || !ada()) return null;
      const sesiTampil = daftarSesi.slice(0, maks);
      const { min, maks: mx } = rentangDetik(sesiTampil);
      const warna = ['#2fa360', '#3d82f6', '#f0a132', '#8b6cf0', '#e5484d', '#1fb6c9', '#7bb661', '#c97f16'];
      const datasets = sesiTampil.map((s, i) => ({
        label: `${Sesi.labelWaktuMakan(s)} · ${new Date(s.t0 || s.waktuFoto).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
        borderColor: warna[i % warna.length], pointBorderColor: warna[i % warna.length], borderWidth: i === 0 ? 2.6 : 1.4,
        data: s.sampel.filter(sp => Sampel.terisi(sp) && sp[seri.kunci] != null).map(sp => ({ x: menit(sp.detikRelatifT0), y: sp[seri.kunci] })),
        fill: false, spanGaps: true, pointRadius: i === 0 ? 4 : 2.5,
      }));
      c._chart = new Chart(c, {
        type: 'line', data: { datasets },
        options: dasar({ legenda: true, x: { min: menit(min), max: menit(mx) }, y: batasY(datasets.flatMap(d => d.data.map(p => p.y)), seri), tooltip: { title: (it) => labelMenit(it[0].parsed.x), label: (it) => `${it.dataset.label}: ${it.parsed.y} ${seri.satuan}` } }),
      });
      return c._chart;
    },

    /** Sebaran karbohidrat vs kenaikan gula, titik tidak andal dibedakan, garis tren opsional. */
    sebaran(canvas, titik, tren, { onKlik } = {}) {
      const c = ctxDari(canvas); if (!c || !ada()) return null;
      const andal = titik.filter(t => t.andal), ragu = titik.filter(t => !t.andal);
      const ke = (t) => ({ x: t.karbohidrat, y: t.delta, t });
      const datasets = [
        { type: 'scatter', label: 'Sesi', data: andal.map(ke), backgroundColor: '#2fa360', borderColor: '#2fa360', pointRadius: 6, pointHoverRadius: 8 },
        { type: 'scatter', label: 'Keyakinan rendah (tidak ikut tren)', data: ragu.map(ke), backgroundColor: '#fff', borderColor: '#9cb1ac', pointRadius: 6, pointStyle: 'circle', borderDash: [2, 2] },
      ];
      if (tren && titik.length) {
        const xs = titik.map(t => t.karbohidrat);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        datasets.push({ type: 'line', label: 'Tren', data: [{ x: x0, y: tren.nilaiPada(x0) }, { x: x1, y: tren.nilaiPada(x1) }], borderColor: tren.meyakinkan ? '#1f7d47' : '#c9d6d0', borderDash: tren.meyakinkan ? [] : [6, 4], borderWidth: 2, pointRadius: 0, fill: false });
      }
      c._chart = new Chart(c, {
        data: { datasets },
        options: {
          ...dasar({
            legenda: ragu.length > 0,
            x: { type: 'linear', title: { display: true, text: 'Karbohidrat (g)', color: '#93a399', font: { size: 11 } }, grid: { display: false }, ticks: { color: '#93a399', font: { size: 11 } } },
            y: { title: { display: true, text: 'Kenaikan puncak (mg/dL)', color: '#93a399', font: { size: 11 } } },
            tooltip: { title: (it) => it[0]?.raw?.t ? M.HasilDeteksi.ringkasanNama(it[0].raw.t.sesi.hasil) : '', label: (it) => it.raw?.t ? `${Math.round(it.parsed.x)} g karbo → +${it.parsed.y} mg/dL` : null },
          }),
          onClick: (e, el) => { const p = el[0] && datasets[el[0].datasetIndex].data[el[0].index]; if (p?.t && onKlik) onKlik(p.t.sesi); },
        },
      });
      c._chart.options.scales.x.ticks.callback = (v) => v;
      c._chart.update();
      return c._chart;
    },

    /** Sparkline kecil tanpa sumbu. */
    sparkline(canvas, nilai, warna = '#2fa360') {
      const c = ctxDari(canvas); if (!c || !ada() || !nilai.length) return null;
      c._chart = new Chart(c, {
        type: 'line',
        data: { labels: nilai.map((_, i) => i), datasets: [{ data: nilai, borderColor: warna, backgroundColor: warna + '22', fill: true, borderWidth: 2, pointRadius: 2.5, pointBackgroundColor: warna, tension: .35 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, suggestedMin: Math.min(...nilai) - 10, suggestedMax: Math.max(...nilai) + 10 } }, animation: false },
      });
      return c._chart;
    },

    kosong(canvas, pesan) {
      const c = ctxDari(canvas); if (!c) return;
      const box = c.closest('.chart-box');
      if (box && !box.querySelector('.chart-empty')) box.insertAdjacentHTML('beforeend', `<div class="chart-empty">${window.UI.ic('i-chart')}<p>${pesan}</p></div>`);
    },
  };

  window.Kurva = Kurva;
})();
