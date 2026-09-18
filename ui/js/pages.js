/**
 * pages.js — controller tiap halaman. Halaman memilih dirinya lewat
 * <body data-page="..."> dan menunggu `App.siap` (DB + jam + controller).
 *
 * Setiap controller menggambar ulang dari state controller pada event 'ubah';
 * hitung mundur detik-detikan ditangani lokal (Komponen.pasangHitungMundur),
 * bukan lewat event, supaya seluruh pendengar tidak dirender tiap detik.
 */
(function () {
  'use strict';

  const M = window.Model;
  const { Sesi, Sampel, StatusSesi, StatusSampel } = M;
  const K = window.Komponen;
  const U = window.UI;
  const { $, ic, esc, toast } = U;
  const q = new URLSearchParams(location.search);

  /* ============================================================
     BERANDA — tiga wajah
     ============================================================ */
  async function halamanBeranda() {
    const { ctl } = await window.App.siap;
    const wadah = $('beranda');
    let lepas = null, generasi = 0;
    const u = window.Pengaturan.user();

    async function gambar() {
      // Render bersifat async (foto dari IndexedDB); yang lebih lama tidak boleh
      // menimpa yang lebih baru.
      const g = ++generasi;
      const aktif = ctl.sesiAktif;
      const p = ctl.statusPerangkat;
      const bagian = [];

      bagian.push(`<div class="hero"><div class="hero-txt"><h2>Halo${u.nama && u.nama !== 'Pengguna' ? `, ${esc(u.nama.split(' ')[0])}` : ''}! &#128075;</h2><p>${esc(U.tanggalSaja(new Date()))}</p></div><div class="hero-art">${ic('i-leaf')}</div></div>`);

      if (ctl.galatPenyimpanan) bagian.push(`<div class="peringatan">${ic('i-warn')}<div><b>Penyimpanan bermasalah.</b> ${esc(ctl.galatPenyimpanan)}</div></div>`);

      if (aktif) {
        // B. Sesi berjalan / draft — kartu utama: hero + aksi DI ATAS timeline.
        const fotoUrl = aktif.fotoAda ? await U.urlFoto(aktif.id) : null;
        // Hero = hitung mundur ke titik berjendela berikutnya; titik t0 milik jam sendiri.
        const berikut = ctl.titikBerikutnya;
        let hero = '';
        if (aktif.t0 && berikut) {
          const kapan = new Date(aktif.t0).getTime() + berikut.detikNominal * 1000;
          hero = `<div class="hero-sesi"><div><span class="label-kecil">${esc(berikut.label)} dalam</span><div class="hero-angka" data-mundur="${kapan}">${U.durasi((kapan - Date.now()) / 1000)}</div></div>
            <div class="kanan">${K.lencana(aktif)}<br>t0 ${U.jam(aktif.t0)} · ${esc(Sesi.labelWaktuMakan(aktif))}</div></div>`;
        } else if (aktif.t0) {
          hero = `<div class="hero-sesi"><div><span class="label-kecil">Menunggu sampel dari jam</span><div style="font-weight:800;font-size:1.2rem;margin-top:.2rem">Semua titik terjadwal sudah diminta.</div></div><div class="kanan">${K.lencana(aktif)}<br>t0 ${U.jam(aktif.t0)}</div></div>`;
        } else hero = `<div class="hero-sesi"><div><span class="label-kecil">Sesi makan</span><div style="font-weight:800;font-size:1.2rem;margin-top:.2rem">${esc(Sesi.verdict(aktif))}</div></div><div class="kanan">${K.lencana(aktif)}</div></div>`;
        bagian.push(`<div class="card utama" id="kartuSesi">${hero}
          ${aktif.t0 ? K.petunjukTombolUkur(ctl, { ringkas: true }) : K.petunjukTombolJam(ctl, aktif)}
          ${K.timeline(aktif, { ctl })}
          <div style="margin-top:.6rem">${K.ringkasanNutrisi(aktif, ctl, { fotoUrl })}</div>
          <a class="btn-ghost block" href="sesi-berjalan.html" style="margin-top:1rem">Buka Sesi</a></div>`);
      } else if (ctl.hasilBelumDibaca) {
        // C. Sesi baru selesai — persisten sampai dibuka.
        const s = ctl.hasilBelumDibaca;
        const delta = Sesi.deltaPuncak(s);
        bagian.push(`<div class="card utama klik" data-buka="${s.id}"><span class="label-kecil">Sesi baru selesai · ${esc(Sesi.labelWaktuMakan(s))}</span>
          ${delta != null ? `<div class="hero-angka">${delta >= 0 ? '+' : ''}${delta}<small>mg/dL dari baseline</small></div>` : `<div style="font-weight:800;font-size:1.1rem;margin-top:.3rem">${esc(Sesi.verdict(s))}</div>`}
          <div class="chart-box pendek" style="margin-top:.6rem"><canvas id="chartBaru"></canvas></div>
          <p class="muted" style="margin-top:.6rem">${delta != null ? esc(Sesi.verdict(s)) : ''} — ketuk untuk membuka ringkasan.</p></div>`);
      }

      if (!aktif) {
        // A. Idle: ringkasan hari ini hanya bila ada sesi; tanpa pembanding/target.
        const hariIni = ctl.sesiHariIni();
        if (hariIni.length) {
          const t = ctl.totalNutrisiHariIni(), parsial = ctl.zatTidakLengkapHariIni();
          const z = (k, sat) => t[k] == null ? '—' : `${parsial.has(k) ? '≥ ' : ''}${U.angka(t[k], sat === 'g' ? 0 : 0)}<i> ${sat}</i>`;
          bagian.push(`<div class="card ${ctl.hasilBelumDibaca ? 'sekunder' : 'utama'}"><span class="label-kecil">Hari ini · ${hariIni.length} sesi</span>
            ${t.kalori != null ? `<div class="hero-angka">${parsial.has('kalori') ? '≥ ' : ''}${U.angka(t.kalori)}<small>kcal</small></div>` : `<div class="hero-angka">—<small>kcal</small></div>`}
            <div class="gizi-grid"><div><small>Karbohidrat</small><b>${z('karbohidrat', 'g')}</b></div><div><small>Protein</small><b>${z('protein', 'g')}</b></div><div><small>Lemak</small><b>${z('lemak', 'g')}</b></div></div>
            <p class="catatan">Jumlah dari sesi hari ini. Tidak ada target pembanding — angka tanpa pembanding lebih jujur daripada pembanding yang tidak pernah dipilih siapa pun.</p></div>`);
        }
        const terakhir = ctl.sesiTerakhir;
        if (terakhir && terakhir.id !== ctl.hasilBelumDibaca?.id) {
          const fotoUrl = terakhir.fotoAda ? await U.urlFoto(terakhir.id) : null;
          bagian.push(`<div class="card sekunder"><div class="card-head"><h3>Sesi Terakhir</h3><small>${esc(U.lalu(terakhir.t0 || terakhir.waktuFoto))}</small></div>${K.itemSesi(terakhir, fotoUrl)}<p class="catatan">${esc(Sesi.verdict(terakhir))}</p></div>`);
        }
        const puncak = ctl.puncakTerakhir(7);
        if (puncak.length >= 2) bagian.push(`<div class="card sekunder"><div class="card-head"><h3>Puncak Gula Darah</h3><small>${puncak.length} sesi terakhir</small></div><div class="chart-box mini"><canvas id="chartSpark"></canvas></div></div>`);
      }

      // Status jam ringkas — apa adanya.
      const statusTeks = p.belumDipasangkan ? 'Belum ada jam dipasangkan' : p.tersambung ? `Tersambung${p.baterai != null ? ` · baterai ${p.baterai}%` : ''}${p.sampelTertunda ? ` · ${p.sampelTertunda} sampel tertahan di jam` : ''}` : p.sedangMenyambung ? 'Menyambung…' : `Terputus — sampel menunggu di buffer jam`;
      bagian.push(`<a class="card sekunder klik" href="perangkat.html" style="display:flex;align-items:center;gap:1rem"><div class="dev-media">${ic('i-watch')}</div><div style="flex:1"><b>${esc(p.namaPerangkat || 'AsaWatch')}</b><small class="muted" style="display:block">${esc(statusTeks)}</small></div>${ic('i-chev')}</a>`);
      if (!aktif && !ctl.riwayat.length) bagian.push(`<div class="card"><div class="chart-empty" style="position:static;padding:1.2rem">${ic('i-camera')}<p>Belum ada sesi makan. Potret makananmu lewat tombol kamera untuk memulai sesi pertama.</p></div></div>`);

      if (g !== generasi) return;
      lepas?.(); lepas = null;
      wadah.innerHTML = bagian.join('');
      lepas = K.pasangHitungMundur(wadah, () => ctl._armTitikBerikutnya());
      pasangAksiSesi(ctl, wadah);
      wadah.querySelector('[data-buka]')?.addEventListener('click', (e) => { const id = e.currentTarget.dataset.buka; ctl.tandaiHasilDibaca(); location.href = 'ringkasan-sesi.html?id=' + id; });
      if ($('chartBaru')) window.Kurva.sesi('chartBaru', ctl.hasilBelumDibaca, [window.Kurva.Seri.gulaDarah]);
      if ($('chartSpark')) window.Kurva.sparkline('chartSpark', ctl.puncakTerakhir(7));
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /** Tombol "Saya Sudah Selesai Makan" & "Ukur titik" — jalur sama di semua permukaan. */
  function pasangAksiSesi(ctl, wadah) {
    wadah.querySelector('#btnSelesaiMakan')?.addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Mengabari jam…';
      const ok = await ctl.mulaiSesiDariApp();
      if (!ok) { toast(ctl.alasanJamTidakBisaUkur || 'Jam tidak menerima perintahnya. Coba lagi.'); e.target.disabled = false; e.target.textContent = 'Saya Sudah Selesai Makan'; }
      // Layar berubah hanya saat jam menjawab (event selesaiMakanDitekan).
    });
    wadah.querySelector('#btnUkurTitik')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      const galat = await ctl.ukurTitikSekarang();
      if (galat) { toast(galat); e.target.disabled = false; }
    });
  }

  /* ============================================================
     DETEKSI MAKANAN — kamera → draft; kartu hasil bisa diedit; PetunjukTombolJam
     ============================================================ */
  async function halamanNutrisi() {
    const { ctl } = await window.App.siap;
    const video = $('camView'), galat = $('kamGalat'), rana = $('btnRana');
    let stream = null, generasi = 0;
    let lepas = null, generasiRender = 0;

    async function siapkanKamera() {
      const g = ++generasi;
      galat.classList.add('hidden');
      if (!navigator.mediaDevices?.getUserMedia) return tampilGalat('Browser ini tidak mendukung kamera. Pakai tombol Galeri.', false);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (g !== generasi) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s; video.srcObject = s; video.classList.remove('hidden'); rana.disabled = false;
      } catch (e) {
        if (g !== generasi) return;
        const izin = e.name === 'NotAllowedError' || e.name === 'SecurityError';
        tampilGalat(izin ? 'Izin kamera ditolak. Buka pengaturan situs di browser untuk mengizinkannya, atau pakai Galeri.' : 'Kamera tidak bisa dibuka. ' + (e.message || ''), !izin);
      }
    }
    function tampilGalat(pesan, bolehCoba) {
      galat.innerHTML = `${ic('i-camera')}<p>${esc(pesan)}</p>${bolehCoba ? '<button class="btn-ghost sm" id="btnCobaKam">Coba Lagi</button>' : ''}`;
      galat.classList.remove('hidden'); video.classList.add('hidden'); rana.disabled = true;
      $('btnCobaKam')?.addEventListener('click', siapkanKamera);
    }
    function lepasKamera() { generasi++; stream?.getTracks().forEach(t => t.stop()); stream = null; if (video) video.srcObject = null; }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') lepasKamera(); else if (!ctl.sesiAktif) siapkanKamera(); });
    window.addEventListener('pagehide', lepasKamera);

    rana.addEventListener('click', async () => {
      if (!stream) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
      mulai(blob);
    });
    $('btnGaleri').addEventListener('click', () => $('filePick').click());
    $('filePick').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) mulai(f); e.target.value = ''; });

    async function mulai(blob) {
      if (ctl.sesiAktif) {
        const ya = await U.konfirmasi({ judul: 'Masih ada sesi berjalan', isi: 'Hanya satu sesi pada satu waktu. Akhiri sesi yang sedang berjalan? Sampel yang sudah masuk tetap disimpan.', ya: 'Akhiri lalu foto' });
        if (!ya) return;
        await ctl.akhiriLebihAwal();
      }
      rana.disabled = true;
      lepasKamera();
      try { await ctl.mulaiDraft(blob); toast('Foto tersimpan — baseline diminta ke jam'); }
      catch (e) { toast(e.message); siapkanKamera(); }
    }

    async function gambar() {
      const g = ++generasiRender;
      const s = ctl.sesiAktif;
      const kartu = $('kartuDraft'), kam = $('kartuKamera');
      if (!s) { kartu.classList.add('hidden'); kam.classList.remove('hidden'); if (!stream) siapkanKamera(); return; }
      kam.classList.add('hidden'); kartu.classList.remove('hidden');
      const fotoUrl = s.fotoAda ? await U.urlFoto(s.id) : null;
      if (g !== generasiRender) return;
      const manual = !s.hasil && !ctl.sedangMenganalisis(s.id);
      kartu.innerHTML = `<div class="card-head"><h3>Hasil Deteksi</h3>${K.lencana(s)}</div>
        ${fotoUrl ? `<img src="${fotoUrl}" class="foto-thumb lg klik" data-buka-foto alt="Foto makanan" style="margin-bottom:.8rem">` : ''}
        ${K.ringkasanNutrisi(s, ctl, { editable: !!s.hasil && Sesi.sedangAktif(s) })}
        ${manual ? `<div style="margin-top:.8rem"><p class="muted" style="margin-bottom:.5rem">${window.Server.token() ? 'Analisis foto tidak tersedia — isi manual:' : 'Belum masuk akun, jadi foto tidak dianalisis server. Isi angka gizinya:'}</p>
          <div class="form-grid"><label>Nama makanan<input id="mNama" placeholder="mis. Nasi ayam"></label><label>Kalori (kcal)<input id="mKal" type="number" min="0"></label><label>Karbohidrat (g)<input id="mKarbo" type="number" min="0"></label><label>Protein (g)<input id="mProt" type="number" min="0"></label><label>Lemak (g)<input id="mLemak" type="number" min="0"></label><label>Gula total (g)<input id="mGula" type="number" min="0"></label></div>
          <button class="btn-ghost block" id="btnManual">Simpan Angka Gizi</button></div>` : ''}
        ${!s.t0 ? K.petunjukTombolJam(ctl, s) : `<div class="petunjuk"><p><b>Sesi sudah berjalan.</b> ${esc(Sesi.verdict(s))}</p><a class="btn-primary block" href="sesi-berjalan.html">Buka Sesi</a></div>`}
        <div class="row gap" style="margin-top:.8rem">${!s.t0 ? '<button class="btn-ghost block danger" id="btnUlang">Ambil ulang foto</button>' : ''}<a class="btn-ghost block" href="sesi-berjalan.html">Lihat Sesi</a></div>`;
      pasangAksiSesi(ctl, kartu);
      kartu.querySelector('[data-buka-foto]')?.addEventListener('click', () => K.bukaFoto(fotoUrl));
      kartu.querySelectorAll('[data-koreksi]').forEach(b => b.addEventListener('click', async () => {
        const i = Number(b.dataset.koreksi);
        const item = s.hasil.makanan[i];
        const ubah = await K.koreksiItem(item);
        if (!ubah) return;
        const makanan = s.hasil.makanan.map((m, j) => j === i ? M.HasilDeteksi.salinItem(m, ubah) : m);
        ctl.koreksiHasil(makanan);
        toast('Koreksi disimpan');
      }));
      $('btnManual')?.addEventListener('click', () => {
        const n = (id) => { const v = $(id).value; return v === '' ? null : Number(v); };
        if (n('mKal') == null && n('mKarbo') == null) return toast('Isi setidaknya kalori atau karbohidrat');
        ctl.isiHasilManual($('mNama').value.trim(), { kalori: n('mKal'), karbohidrat: n('mKarbo'), protein: n('mProt'), lemak: n('mLemak'), gulaTotal: n('mGula'), serat: null });
        toast('Angka gizi disimpan');
      });
      $('btnUlang')?.addEventListener('click', async () => {
        if (!await U.konfirmasi({ judul: 'Buang foto ini?', isi: 'Draft sesi dibatalkan dan baseline yang sudah diukur ikut dibuang.', ya: 'Buang', bahaya: true })) return;
        await ctl.batalkan(); toast('Draft dibuang');
      });
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     SESI BERJALAN
     ============================================================ */
  async function halamanSesi() {
    const { ctl } = await window.App.siap;
    const wadah = $('sesi');
    let lepas = null, berakhirId = null, generasi = 0;

    async function gambar() {
      const g = ++generasi;
      const s = ctl.sesiAktif;
      if (!s) {
        lepas?.(); lepas = null;
        const baru = berakhirId ? ctl.cariSesi(berakhirId) : ctl.hasilBelumDibaca;
        wadah.innerHTML = `<div class="card utama"><h3 style="font-weight:800">Sesi sudah berakhir</h3><p class="muted" style="margin:.5rem 0 1rem">${baru ? esc(Sesi.verdict(baru)) : 'Tidak ada sesi yang sedang berjalan.'}</p>
          <div class="row gap">${baru ? `<a class="btn-primary block" href="ringkasan-sesi.html?id=${baru.id}">Lihat Ringkasan</a>` : ''}<a class="btn-ghost block" href="deteksi-makanan.html">Foto Makanan Baru</a></div></div>`;
        return;
      }
      berakhirId = s.id;
      const p = ctl.statusPerangkat;
      const fotoUrl = s.fotoAda ? await U.urlFoto(s.id) : null;
      const jumlahTerisi = Sesi.sampelTerisi(s).length;
      const statusJam = p.tersambung ? `Jam tersambung${p.baterai != null ? ` · baterai ${p.baterai}%` : ''}${p.sampelTertunda ? ` · ${p.sampelTertunda} sampel tertahan` : ''}` : p.belumDipasangkan ? 'Belum ada jam dipasangkan' : 'Jam terputus. Sampel tetap tersimpan di buffer jam dan menyusul saat tersambung — sesi tidak gagal karena telat.';
      if (g !== generasi) return;
      lepas?.(); lepas = null;
      wadah.innerHTML = `<div class="card utama">
        <div class="card-head"><h3>${esc(Sesi.labelWaktuMakan(s))}${s.t0 ? ` · t0 ${U.jam(s.t0)}` : ''}</h3>${K.lencana(s)}</div>
        ${s.waktuTidakPasti ? `<div class="peringatan">${ic('i-warn')}<div>Waktu sesi ini tidak bisa dipastikan (jam sempat menyala tanpa pernah tersambung). Pengukurannya tetap benar; hanya jamnya yang tidak diketahui.</div></div>` : ''}
        ${s.t0 ? K.petunjukTombolUkur(ctl) : K.petunjukTombolJam(ctl, s)}
        ${K.timeline(s, { ctl })}
        <p class="catatan">${esc(statusJam)}</p></div>
        <div class="card sekunder"><div class="card-head"><h3>Makanan</h3></div>${K.ringkasanNutrisi(s, ctl, { fotoUrl, bisaDibuka: true })}</div>
        <div class="row gap">${s.t0 ? '<button class="btn-ghost block" id="btnSelesaikan">Selesaikan Sesi</button>' : ''}<button class="btn-ghost block danger" id="btnBatal">Batalkan Sesi</button></div>
        <p class="catatan">Sesi berakhir sendiri setelah ${M.jamRingkas(Sesi.jadwal(s).tenggatSetelahAkhirDetik)} lewat dari titik terakhir. Selagi tab ini tertutup tidak ada pengingat — buka lagi saat waktunya.</p>`;
      lepas = K.pasangHitungMundur(wadah, () => ctl._armTitikBerikutnya());
      pasangAksiSesi(ctl, wadah);
      wadah.querySelector('[data-buka-foto]')?.addEventListener('click', () => K.bukaFoto(fotoUrl));
      $('btnSelesaikan')?.addEventListener('click', async () => {
        const ya = await U.konfirmasi({ judul: 'Selesaikan sesi sekarang?', isi: `${jumlahTerisi} dari ${s.sampel.length} titik sudah terukur. Titik yang belum diukur ditandai terlewat dan sesi disimpan sebagai <b>tidak lengkap</b>. Yang masih tertahan di buffer jam tidak akan masuk ke sesi ini.`, ya: 'Selesaikan' });
        if (ya) await ctl.akhiriLebihAwal();
      });
      $('btnBatal')?.addEventListener('click', async () => {
        const ya = await U.konfirmasi({ judul: 'Batalkan sesi?', isi: 'Foto, angka gizi, dan sampel yang sudah masuk dibuang. Tidak bisa dikembalikan.', ya: 'Batalkan sesi', bahaya: true });
        if (ya) { berakhirId = null; await ctl.batalkan(); toast('Sesi dibatalkan'); }
      });
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     RINGKASAN SESI — satu angka, satu tempat
     ============================================================ */
  async function halamanRingkasan() {
    const { ctl } = await window.App.siap;
    const id = q.get('id');
    const s = id ? (ctl.cariSesi(id) || (await window.DB.muatSesi(id))) : null;
    const wadah = $('ringkasan');
    if (!s) { wadah.innerHTML = `<div class="card"><p class="muted">Sesi tidak ditemukan.</p></div>`; return; }
    if (ctl.hasilBelumDibaca?.id === s.id) ctl.tandaiHasilDibaca();
    const Kv = window.Kurva, Seri = Kv.Seri;
    const tampil = M.KemampuanPerangkat.tampil(ctl.statusPerangkat.kemampuan);
    const adaNilai = (k) => s.sampel.some(sp => sp[k] != null);
    const fotoUrl = s.fotoAda ? await U.urlFoto(s.id) : null;
    const delta = Sesi.deltaPuncak(s), pemulihan = Sesi.waktuPemulihanDetik(s), baseline = Sesi.gulaDarahBaseline(s), puncak = Sesi.sampelPuncak(s);
    const tensiTampil = (tampil.tekananDarah || adaNilai('sistolik'));
    const spo2Tampil = (tampil.spo2 || adaNilai('spo2'));
    const spo2Min = Math.min(...s.sampel.filter(sp => sp.spo2 != null).map(sp => sp.spo2));
    const tensiMaks = s.sampel.filter(sp => sp.sistolik != null).reduce((a, sp) => (!a || sp.sistolik > a.sistolik ? sp : a), null);

    wadah.innerHTML = `
      <div class="card utama">
        <div class="card-head"><h3>${esc(Sesi.waktuMakan(s) ? U.jam(s.t0 || s.waktuFoto) : 'Waktu tidak pasti')} · ${esc(U.tanggalSaja(s.t0 || s.waktuFoto))}</h3>${K.lencana(s)}</div>
        ${delta != null ? `<span class="label-kecil">Kenaikan puncak dari baseline</span><div class="hero-angka">${delta >= 0 ? '+' : ''}${delta}<small>mg/dL</small></div>` : `<p style="font-weight:700">${esc(Sesi.verdict(s))}</p>`}
        <div class="gizi-grid" style="margin-top:.8rem">
          <div><small>Baseline</small><b>${baseline ?? '—'}<i> mg/dL</i></b></div>
          <div><small>Puncak (${puncak ? esc(Sesi.labelSampel(s, puncak)) : '—'})</small><b>${puncak?.gulaDarah ?? '—'}<i> mg/dL</i></b></div>
          <div><small>Pemulihan</small><b>${pemulihan != null ? esc(M.jamRingkas(pemulihan)) : (delta != null ? 'belum' : '—')}</b></div>
        </div>
        ${delta != null && (Sesi.adaSampelTerlewat(s) || pemulihan == null) ? `<p class="catatan">${pemulihan == null ? 'Gula darah belum kembali ke sekitar baseline dalam 2 jam.' : ''}${Sesi.adaSampelTerlewat(s) ? ' Ada titik yang terlewat.' : ''}</p>` : ''}
      </div>
      ${(tampil.gulaDarah || adaNilai('gulaDarah')) ? `<div class="card"><div class="card-head"><h3>Kurva Gula Darah</h3></div><div class="chart-box"><canvas id="chartGula"></canvas></div></div>` : ''}
      ${tensiTampil ? `<div class="card"><div class="card-head"><h3>Tekanan Darah</h3><small>${tensiMaks ? `tertinggi ${tensiMaks.sistolik}/${tensiMaks.diastolik} mmHg` : ''}</small></div><div class="chart-box pendek"><canvas id="chartTensi"></canvas></div></div>` : ''}
      ${spo2Tampil ? (Number.isFinite(spo2Min) && spo2Min >= 95 ? `<div class="card sekunder"><b>SpO₂</b> <span class="muted">terendah ${spo2Min}% — semua titik dalam rentang wajar.</span></div>` : `<div class="card"><div class="card-head"><h3>SpO₂</h3><small>${Number.isFinite(spo2Min) ? `terendah ${spo2Min}%` : ''}</small></div><div class="chart-box pendek"><canvas id="chartSpo2"></canvas></div></div>`) : ''}
      <div class="card"><div class="card-head"><h3>Makanan</h3></div>${K.ringkasanNutrisi(s, ctl, { fotoUrl, bisaDibuka: true })}</div>
      <div class="card"><div class="card-head"><h3>Rincian per Titik</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Titik</th><th>Jam</th>${(tampil.gulaDarah || adaNilai('gulaDarah')) ? '<th class="num">Gula<br>mg/dL</th>' : ''}<th class="num">Nadi<br>bpm</th>${tensiTampil ? '<th class="num">Tensi<br>mmHg</th>' : ''}${spo2Tampil ? '<th class="num">SpO₂<br>%</th>' : ''}</tr></thead>
        <tbody>${s.sampel.map(sp => `<tr><td>${esc(Sesi.labelSampel(s, sp))}${Sesi.sampelTelat(s, sp) ? ' <span class="tag warn">telat</span>' : ''}</td><td>${Sampel.terisi(sp) && s.t0 ? U.jam(Sampel.waktuUkur(sp, s.t0)) : (sp.status === StatusSampel.terlewat ? 'terlewat' : '—')}</td>${(tampil.gulaDarah || adaNilai('gulaDarah')) ? `<td class="num">${sp.gulaDarah ?? '—'}</td>` : ''}<td class="num">${sp.detakJantung ?? '—'}</td>${tensiTampil ? `<td class="num">${Sampel.tekananDarah(sp) ?? '—'}</td>` : ''}${spo2Tampil ? `<td class="num">${sp.spo2 ?? '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>
      <div class="metrik-pintu" style="margin-bottom:1rem">
        ${(tampil.gulaDarah || adaNilai('gulaDarah')) ? `<a href="gula-darah.html?id=${s.id}">${ic('i-drop')} Gula Darah<small>kurva lintas sesi</small></a>` : ''}
        <a href="detak-jantung.html?id=${s.id}">${ic('i-heart')} Detak Jantung<small>per titik</small></a>
        ${tensiTampil ? `<a href="tensi.html?id=${s.id}">${ic('i-gauge')} Tekanan Darah<small>tren & kalibrasi</small></a>` : ''}
      </div>`;
    wadah.querySelector('[data-buka-foto]')?.addEventListener('click', () => K.bukaFoto(fotoUrl));
    if ($('chartGula')) Kv.sesi('chartGula', s, [Seri.gulaDarah]);
    if ($('chartTensi')) Kv.sesi('chartTensi', s, [Seri.sistolik, Seri.diastolik], { baseline: false });
    if ($('chartSpo2')) Kv.sesi('chartSpo2', s, [Seri.spo2], { baseline: false });
  }

  /* ============================================================
     RIWAYAT — per sesi, kelompok tanggal, filter waktu makan / kualitas
     ============================================================ */
  async function halamanRiwayat() {
    const { ctl } = await window.App.siap;
    let filter = 'semua';
    document.querySelectorAll('.pill[data-f]').forEach(p => p.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-f]').forEach(x => x.classList.remove('active')); p.classList.add('active'); filter = p.dataset.f; gambar();
    }));
    let generasi = 0;
    async function gambar() {
      const g = ++generasi;
      const wadah = $('daftarRiwayat');
      let semua = ctl.riwayat;
      if (ctl.sesiAktif) semua = [ctl.sesiAktif, ...semua];
      if (M.WaktuMakan.semua.includes(filter)) semua = semua.filter(s => Sesi.waktuMakan(s) === filter);
      else if (M.KualitasRespons.semua.includes(filter)) semua = semua.filter(s => Sesi.kualitasRespons(s) === filter);
      if (!semua.length) { wadah.innerHTML = `<div class="empty-row">Belum ada sesi untuk filter ini.</div>`; return; }
      const kelompok = new Map();
      for (const s of semua) { const k = s.waktuTidakPasti ? 'Waktu tidak pasti' : U.tanggalSaja(s.t0 || s.waktuFoto); if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k).push(s); }
      const potongan = [];
      for (const [tgl, daftar] of kelompok) {
        potongan.push(`<div class="kelompok-tanggal">${esc(tgl)}</div>`);
        for (const s of daftar) potongan.push(K.itemSesi(s, s.fotoAda ? await U.urlFoto(s.id) : null));
      }
      if (g !== generasi) return;
      wadah.innerHTML = potongan.join('');
      wadah.querySelectorAll('[data-sesi]').forEach(el => el.addEventListener('click', () => {
        const s = ctl.cariSesi(el.dataset.sesi);
        location.href = s && Sesi.sedangAktif(s) ? 'sesi-berjalan.html' : 'ringkasan-sesi.html?id=' + el.dataset.sesi;
      }));
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     ANALISIS — sebaran karbo vs delta, pemicu, pemulihan
     ============================================================ */
  async function halamanAnalisis() {
    const { ctl } = await window.App.siap;
    function gambar() {
      const A = M.AnalisisSesi(ctl.riwayat);
      const wadah = $('analisis');
      const tampil = M.KemampuanPerangkat.tampil(ctl.statusPerangkat.kemampuan);
      if (A.kosong) { wadah.innerHTML = `<div class="card"><div class="chart-empty" style="position:static;padding:1.5rem">${ic('i-scatter')}<p>Analisis muncul setelah ada sesi makan yang selesai. Sesi uji dan sesi berwaktu tidak pasti tidak ikut dihitung.</p></div></div>`; return; }
      const titik = A.titikSebaran(), tren = A.tren(), pemicu = A.pemicuTeratas().slice(0, 5), rekap = A.rekapPemulihan(), selisih = A.selisihProporsiPemulihan();
      wadah.innerHTML = `
        <div class="card utama"><div class="card-head"><h3>Karbohidrat vs Kenaikan Gula Darah</h3><small>${A.sesi.length} sesi</small></div>
          <div class="chart-box"><canvas id="chartSebaran"></canvas></div>
          <p class="catatan">${tren ? (tren.meyakinkan ? `Setiap 10 g karbohidrat tambahan menaikkan puncak sekitar <b>${U.angka(tren.kemiringan * 10, 0)} mg/dL</b> (korelasi ${tren.korelasi.toFixed(2)}).` : `Belum ada hubungan yang meyakinkan (korelasi ${tren.korelasi.toFixed(2)}).`) : 'Garis tren muncul setelah 3 sesi dengan estimasi porsi yang bisa dipercaya.'}${A.jumlahDikecualikan() ? ` ${A.jumlahDikecualikan()} sesi berkeyakinan rendah ditampilkan berongga dan tidak ikut tren — koreksi porsinya agar ikut dihitung.` : ''}</p></div>
        <div class="grid-2">
          <div class="card"><div class="card-head"><h3>Pemicu Lonjakan</h3></div>${pemicu.length ? `<ul class="kv">${pemicu.map(p => `<li><span>${esc(p.nama)}<br><small class="muted">${p.jumlahSesi} sesi · ~${U.angka(p.rataKarbohidrat)} g karbo</small></span><b>+${U.angka(p.rataDelta)} mg/dL</b></li>`).join('')}</ul>` : '<p class="muted">Belum ada makanan yang bisa dibandingkan.</p>'}</div>
          <div class="card"><div class="card-head"><h3>Pemulihan</h3></div>
            <div class="hero-angka">${rekap.total ? `${rekap.pulih}<small>dari ${rekap.total} sesi kembali ke baseline</small>` : '—'}</div>
            <p class="catatan">${selisih == null ? 'Perbandingan membaik/memburuk butuh minimal 4 sesi.' : selisih > 0 ? `Membaik: proporsi sesi yang pulih naik ${Math.round(selisih * 100)} poin dibanding paruh sebelumnya.` : selisih < 0 ? `Menurun ${Math.round(-selisih * 100)} poin dibanding paruh sebelumnya.` : 'Sama dengan paruh sebelumnya.'}</p>
            <ul class="kv"><li><span>Rata-rata puncak</span><b>${A.rataPuncak() != null ? U.angka(A.rataPuncak()) + ' mg/dL' : '—'}</b></li><li><span>Rata-rata kenaikan</span><b>${A.rataDelta() != null ? '+' + U.angka(A.rataDelta()) + ' mg/dL' : '—'}</b></li></ul></div>
        </div>
        <div class="card"><div class="card-head"><h3>Telusuri per Metrik</h3></div><div class="metrik-pintu">
          ${tampil.gulaDarah ? `<a href="gula-darah.html">${ic('i-drop')} Gula Darah<small>kurva respons ditumpuk</small></a>` : ''}
          <a href="detak-jantung.html">${ic('i-heart')} Detak Jantung<small>per titik</small></a>
          ${tampil.tekananDarah ? `<a href="tensi.html">${ic('i-gauge')} Tekanan Darah<small>tren & kalibrasi</small></a>` : ''}
        </div></div>`;
      window.Kurva.sebaran('chartSebaran', titik, tren, { onKlik: (s) => location.href = 'ringkasan-sesi.html?id=' + s.id });
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     DETAIL METRIK — gula (lintas sesi), tensi (+ kalibrasi), detak (tipis)
     ============================================================ */
  async function halamanMetrik() {
    const { ctl } = await window.App.siap;
    const jenis = document.body.dataset.metric;
    const Kv = window.Kurva, Seri = Kv.Seri;
    const s = (q.get('id') && ctl.cariSesi(q.get('id'))) || ctl.sesiTerakhir;
    const A = M.AnalisisSesi(ctl.riwayat);
    const wadah = $('metrik');
    const seri = { gula: Seri.gulaDarah, detak: Seri.detakJantung, tensi: Seri.sistolik }[jenis];
    if (!s) { wadah.innerHTML = `<div class="card"><p class="muted">Belum ada sesi. Halaman ini menampilkan sampel per sesi, bukan nilai "sekarang" — jam hanya mengukur saat sesi makan.</p></div>`; return; }
    const terakhir = Sesi.sampelTerisi(s).filter(sp => sp[seri.kunci] != null).pop();
    const nilaiTerakhir = terakhir ? (jenis === 'tensi' ? Sampel.tekananDarah(terakhir) : terakhir[seri.kunci]) : null;
    const rentang = { gula: 'Gula darah sebelum makan umumnya 70–100 mg/dL; puncak setelah makan di bawah 140 mg/dL dan kembali dalam 2 jam.', detak: 'Detak jantung istirahat orang dewasa umumnya 60–100 bpm.', tensi: 'Tekanan darah normal di bawah 120/80 mmHg.' }[jenis];
    const potongan = [`<div class="card utama"><span class="label-kecil">${esc(seri.label)} · sesi ${esc(Sesi.labelWaktuMakan(s))} ${U.tanggalSaja(s.t0 || s.waktuFoto)}</span>
      <div class="hero-angka">${nilaiTerakhir ?? '—'}<small>${esc(seri.satuan)}${terakhir && s.t0 ? ` · ${esc(Sesi.labelSampel(s, terakhir))}, ${esc(U.lalu(Sampel.waktuUkur(terakhir, s.t0)))}` : ''}</small></div>
      <div class="chart-box" style="margin-top:.6rem"><canvas id="chartSesi"></canvas></div>
      <p class="catatan">${esc(rentang)}</p></div>`];
    if (jenis === 'gula') potongan.push(`<div class="card"><div class="card-head"><h3>Kurva Lintas Sesi</h3><small>${A.rataPuncak() != null ? `rata-rata puncak ${U.angka(A.rataPuncak())} mg/dL` : ''}</small></div><div class="chart-box"><canvas id="chartTumpuk"></canvas></div><p class="catatan">Sesi terbaru digambar tebal. Sesi uji dan sesi berwaktu tidak pasti tidak ikut.</p></div>`);
    if (jenis === 'tensi') {
      const k = ctl.kalibrasiTerakhir;
      const teks = !k ? 'Jam belum pernah dikalibrasi — tekanan darah ditampilkan tanpa koreksi.' : M.Kalibrasi.kedaluwarsaPada(k) ? `Kalibrasi terakhir ${U.lalu(k.waktu)} sudah kedaluwarsa (berlaku 4 minggu). Jam masih memakai koreksi lama.` : `Terakhir dikalibrasi ${U.lalu(k.waktu)} (${M.SisiPergelangan.label(k.sisi)}), berlaku ${M.Kalibrasi.sisaHariPada(k)} hari lagi · koreksi ${M.Kalibrasi.ringkasanOffset(k)}.`;
      potongan.push(`<div class="card"><div class="card-head"><h3>Kalibrasi</h3>${k && !M.Kalibrasi.kedaluwarsaPada(k) ? '<span class="tag ok">Berlaku</span>' : '<span class="tag warn">Perlu kalibrasi</span>'}</div><p class="muted">${esc(teks)}</p><a class="btn-primary block" href="kalibrasi-tensi.html" style="margin-top:.8rem">Kalibrasi dengan Tensimeter</a></div>`);
      potongan.push(`<div class="card"><div class="card-head"><h3>Tren per Sesi</h3></div><div class="chart-box pendek"><canvas id="chartTumpuk"></canvas></div></div>`);
    }
    wadah.innerHTML = potongan.join('');
    Kv.sesi('chartSesi', s, jenis === 'tensi' ? [Seri.sistolik, Seri.diastolik] : [seri], { baseline: jenis === 'gula' });
    if ($('chartTumpuk')) { const d = A.urutWaktu().reverse(); if (d.length) Kv.tumpuk('chartTumpuk', d, seri); else Kv.kosong('chartTumpuk', 'Belum ada sesi selesai untuk dibandingkan.'); }
  }

  /* ============================================================
     PINDAI KESEHATAN — UKUR_SEKARANG, hasil di memori saja
     ============================================================ */
  async function halamanPindai() {
    const { ctl } = await window.App.siap;
    const wadah = $('pindai');
    function gambar() {
      const h = ctl.pindaiTerakhir, sedang = ctl.sedangMemindai, k = ctl.kemajuanUkur, alasan = ctl.alasanJamTidakBisaUkur;
      const tampil = M.KemampuanPerangkat.tampil(ctl.statusPerangkat.kemampuan);
      let hasil = '';
      if (h) {
        const sp = h.sampel;
        hasil = M.HasilPindai.kosong(h) ? `<div class="peringatan">${ic('i-warn')}<div>Tidak satu pun angka terbaca. Rapatkan jam di pergelangan, diamkan tangan, lalu ukur lagi.</div></div>`
          : `<div class="hasil-grid">
            ${tampil.gulaDarah ? `<div><small>Gula darah</small><b>${sp.gulaDarah ?? '—'}<i>mg/dL</i></b></div>` : ''}
            <div><small>Detak jantung</small><b>${sp.detakJantung ?? '—'}<i>bpm</i></b></div>
            ${tampil.tekananDarah ? `<div><small>Tekanan darah</small><b>${Sampel.tekananDarah(sp) ?? '—'}<i>mmHg</i></b></div>` : ''}
            ${tampil.spo2 ? `<div><small>SpO₂</small><b>${sp.spo2 ?? '—'}<i>%</i></b></div>` : ''}</div>
            <p class="catatan">Diukur ${esc(U.lalu(h.waktu))}${M.HasilPindai.sebagianGagal(h) ? ' · sebagian sensor tidak membaca — "—" berarti diukur tapi gagal.' : ''}</p>`;
      }
      wadah.innerHTML = `<div class="card utama"><span class="label-kecil">Pindai kesehatan</span>
        <p style="margin:.4rem 0 .8rem">Ukur keempat metrik saat ini juga, di luar sesi makan. Hasilnya <b>tidak masuk riwayat</b> — bacaan lepas tanpa makanan dan tanpa titik pembanding bukan sesi, dan akan mencemari analisis.</p>
        ${hasil}
        ${sedang ? `<div class="kemajuan"><div class="bar"><i class="${k?.persen == null ? 'tanpa' : ''}" style="width:${k?.persen ?? 0}%"></i></div><small>${k ? (k.macet ? 'Jam belum menemukan nadi — rapatkan jam di pergelangan.' : `Jam sedang mengukur${k.persen != null ? ` · ${k.persen}%` : ''}${k.sisaDetik ? ` · ~${k.sisaDetik} detik lagi` : ''}`) : 'Menunggu jam mulai mengukur…'}</small></div>` : ''}
        <button class="btn-primary block" id="btnPindai" style="margin-top:1rem" ${sedang || alasan ? 'disabled' : ''}>${sedang ? 'Mengukur…' : h ? 'Ukur Lagi' : 'Ukur Sekarang'}</button>
        ${alasan ? `<small class="alasan" style="display:block;margin-top:.5rem;color:#b8790f">${esc(alasan)}</small>` : ''}
        ${h && !sedang ? '<button class="btn-ghost block" id="btnBuangPindai" style="margin-top:.5rem">Tutup Hasil</button>' : ''}</div>`;
      $('btnPindai')?.addEventListener('click', async () => { try { await ctl.pindaiKesehatan(); } catch (e) { toast(e.pesanPengguna || e.message); } });
      $('btnBuangPindai')?.addEventListener('click', () => ctl.buangPindaiTerakhir());
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     KALIBRASI TENSI — persiapan → ukur bersamaan → ringkasan
     ============================================================ */
  async function halamanKalibrasi() {
    const { ctl } = await window.App.siap;
    const wadah = $('kalibrasi');
    const Kb = M.Kalibrasi;
    let tahap = 0, sisi = 'kiri', putaran = [], bacaanJam = null, sedangUkur = false, galatUkur = null, terakhirPutaran = 0;
    let lepas = null;

    function gambar() {
      lepas?.(); lepas = null;
      const k = ctl.kalibrasiTerakhir;
      const bar = `<div class="langkah">${[0, 1, 2].map(i => `<span class="${i <= tahap ? 'aktif' : ''}"></span>`).join('')}</div>`;
      let isi = '';
      if (tahap === 0) {
        isi = `<h3 style="font-weight:800">Persiapan</h3>
          <p class="muted" style="margin:.4rem 0 1rem">${k ? `Kalibrasi terakhir ${esc(U.lalu(k.waktu))}, ${Kb.kedaluwarsaPada(k) ? 'sudah kedaluwarsa' : `berlaku ${Kb.sisaHariPada(k)} hari lagi`}.` : 'Jam belum pernah dikalibrasi.'} Kalibrasi berlaku 4 minggu dan terikat pada satu pergelangan.</p>
          <p style="font-weight:700;margin-bottom:.5rem">Jam dipakai di pergelangan mana?</p>
          <div class="pilih-sisi"><button data-sisi="kiri" class="${sisi === 'kiri' ? 'aktif' : ''}">Tangan kiri</button><button data-sisi="kanan" class="${sisi === 'kanan' ? 'aktif' : ''}">Tangan kanan</button></div>
          <ul class="kv" style="margin-top:1rem"><li><span>1. Pasang manset tensimeter di <b>${esc(M.SisiPergelangan.labelLengan(M.SisiPergelangan.seberang(sisi)))}</b> — lengan yang <b>berlawanan</b> dengan jam. Manset yang mengembang menutup aliran darah ke pergelangan di bawahnya.</span></li><li><span>2. Duduk tenang 5 menit, lengan setinggi jantung.</span></li><li><span>3. Tensimeter dan jam mengukur <b>bersamaan</b>: tekan mulai di tensimeter, lalu tekan tombol di bawah.</span></li></ul>
          <button class="btn-primary block" id="btnLanjut" ${ctl.alasanJamTidakBisaUkur ? 'disabled' : ''} style="margin-top:1rem">Mulai Pengukuran</button>
          ${ctl.alasanJamTidakBisaUkur ? `<small class="alasan" style="display:block;margin-top:.5rem;color:#b8790f">${esc(ctl.alasanJamTidakBisaUkur)}</small>` : ''}`;
      } else if (tahap === 1) {
        const kj = ctl.kemajuanUkur;
        isi = `<h3 style="font-weight:800">Putaran ${putaran.length + 1}</h3>
          <p class="muted" style="margin:.4rem 0 1rem">Jam ${sedangUkur ? 'sedang mengukur' : bacaanJam ? 'sudah selesai mengukur' : 'siap'}. Ketik angka tensimeter <b>setelah</b> keduanya selesai.</p>
          ${sedangUkur ? `<div class="kemajuan"><div class="bar"><i class="${kj?.persen == null ? 'tanpa' : ''}" style="width:${kj?.persen ?? 0}%"></i></div><small>${kj?.macet ? 'Jam belum menemukan nadi — rapatkan jam.' : 'Jam sedang mengukur…'}</small></div>` : ''}
          ${galatUkur ? `<div class="peringatan">${ic('i-warn')}<div>${esc(galatUkur)}</div></div><button class="btn-ghost block" id="btnUlangUkur">Ukur Ulang di Jam</button>` : ''}
          ${!sedangUkur && !bacaanJam && !galatUkur ? '<button class="btn-primary block" id="btnUkurJam">Jam: Ukur Sekarang</button>' : ''}
          <div class="tirai" style="margin:1rem 0">${bacaanJam ? 'Pembacaan jam disembunyikan sampai angka tensimeter diketik — supaya angka yang diketik tidak "menyesuaikan diri".' : 'Pembacaan jam muncul di sini setelah angka tensimeter diketik.'}</div>
          <div class="form-grid"><label>Sistolik tensimeter (atas)<input type="number" id="refSis" inputmode="numeric" ${!bacaanJam ? 'disabled' : ''}></label><label>Diastolik tensimeter (bawah)<input type="number" id="refDia" inputmode="numeric" ${!bacaanJam ? 'disabled' : ''}></label></div>
          <div class="galat-form hidden" id="galatRef"></div>
          <button class="btn-primary block" id="btnSimpanPutaran" ${!bacaanJam ? 'disabled' : ''}>Bandingkan</button>`;
      } else {
        const kal = { waktu: new Date().toISOString(), sisi, putaran };
        const p = putaran[putaran.length - 1];
        const bisa = Kb.bisaDipakai(kal);
        const sisaJeda = Math.max(0, Kb.jedaAntarPutaranDetik - Math.floor((Date.now() - terakhirPutaran) / 1000));
        isi = `<h3 style="font-weight:800">Ringkasan</h3>
          <div class="hasil-grid" style="margin-top:.8rem"><div><small>Tensimeter</small><b>${p.sistolikReferensi}/${p.diastolikReferensi}<i>mmHg</i></b></div><div><small>Jam (sebelum koreksi)</small><b>${p.sistolikJam}/${p.diastolikJam}<i>mmHg</i></b></div></div>
          <p style="font-weight:700">${esc(Kb.kalimatOffset(kal))}</p>
          <p class="muted" style="margin:.4rem 0 1rem">Koreksi ${esc(Kb.ringkasanOffset(kal))}${putaran.length > 1 ? ` (median ${putaran.length} putaran)` : ''}.</p>
          ${!Kb.masukAkal(kal) ? `<div class="peringatan">${ic('i-warn')}<div>Koreksi lebih dari ${Kb.offsetMaksimum} mmHg hampir pasti bukan tekanan darah, melainkan pengukuran yang gagal — manset kendur, lengan tidak setinggi jantung, atau jam tidak menempel. Periksa keduanya lalu ukur ulang.</div></div>` : ''}
          ${!Kb.konsisten(kal) ? `<div class="peringatan">${ic('i-warn')}<div>Putaran-putarannya saling berselisih lebih dari ${Kb.sebaranMaksimum} mmHg. Istirahat sebentar, lalu ukur sekali lagi — putaran ketiga yang memutuskan.</div></div>` : ''}
          <button class="btn-primary block" id="btnKirim" ${bisa ? '' : 'disabled'}>Kirim Koreksi ke Jam</button>
          <button class="btn-ghost block" id="btnPutaranLagi" style="margin-top:.5rem" ${sisaJeda > 0 ? 'disabled' : ''}>${sisaJeda > 0 ? `Ukur sekali lagi untuk lebih yakin (tunggu <span data-mundur="${terakhirPutaran + Kb.jedaAntarPutaranDetik * 1000}">${sisaJeda}</span>)` : 'Ukur sekali lagi untuk lebih yakin'}</button>
          <p class="catatan">Jeda 60 detik antar putaran: manset yang langsung dipompa ulang membaca terlalu tinggi.</p>
          <button class="btn-ghost block danger" id="btnUlangSemua" style="margin-top:.5rem">Ulangi dari Awal</button>`;
      }
      wadah.innerHTML = `<div class="card utama">${bar}${isi}</div>`;
      lepas = K.pasangHitungMundur(wadah, () => gambar());
      wadah.querySelectorAll('[data-sisi]').forEach(b => b.addEventListener('click', () => { sisi = b.dataset.sisi; gambar(); }));
      $('btnLanjut')?.addEventListener('click', () => { tahap = 1; bacaanJam = null; galatUkur = null; gambar(); });
      const ukurJam = async () => {
        sedangUkur = true; galatUkur = null; gambar();
        try { bacaanJam = await ctl.ukurUntukKalibrasi(); if (bacaanJam.sistolik == null || bacaanJam.diastolik == null) { bacaanJam = null; galatUkur = 'Jam tidak berhasil membaca tekanan darah. Rapatkan jam, lalu ukur ulang.'; } }
        catch (e) { galatUkur = e.pesanPengguna || e.message; }
        sedangUkur = false; gambar();
      };
      $('btnUkurJam')?.addEventListener('click', ukurJam);
      $('btnUlangUkur')?.addEventListener('click', ukurJam);
      $('btnSimpanPutaran')?.addEventListener('click', () => {
        const sis = Number($('refSis').value), dia = Number($('refDia').value);
        const g = $('galatRef');
        if (!$('refSis').value || !$('refDia').value) { g.textContent = 'Isi kedua angka tensimeter dulu.'; g.classList.remove('hidden'); return; }
        const galat = M.galatReferensiTensimeter(sis, dia);
        if (galat) { g.textContent = galat; g.classList.remove('hidden'); return; }
        putaran.push({ sistolikReferensi: sis, diastolikReferensi: dia, sistolikJam: bacaanJam.sistolik, diastolikJam: bacaanJam.diastolik });
        terakhirPutaran = Date.now(); bacaanJam = null; tahap = 2; gambar();
      });
      $('btnPutaranLagi')?.addEventListener('click', () => { tahap = 1; bacaanJam = null; galatUkur = null; gambar(); });
      $('btnUlangSemua')?.addEventListener('click', () => { tahap = 0; putaran = []; bacaanJam = null; gambar(); });
      $('btnKirim')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await ctl.simpanKalibrasi({ waktu: new Date().toISOString(), sisi, putaran }); toast('Koreksi dikirim ke jam dan disimpan'); location.href = 'tensi.html'; }
        catch (err) { toast(err.pesanPengguna || err.message); e.target.disabled = false; }
      });
    }
    ctl.on('kemajuan', () => { if (tahap === 1 && sedangUkur) gambar(); });
    ctl.on('status', () => { if (tahap === 0) gambar(); });
    gambar();
  }

  /* ============================================================
     PERANGKAT — pemasangan, status, mode
     ============================================================ */
  async function halamanPerangkat() {
    const { ctl, jam } = await window.App.siap;
    const wadah = $('perangkat');
    const S = window.Pengaturan;
    let tahap = null;
    jam.on('tahap', t => { tahap = t; gambar(); });

    function gambar() {
      const p = ctl.statusPerangkat, st = S.semua();
      const palsu = jam instanceof window.Jam.JamPalsu;
      let statusIsi;
      if (p.sedangMenyambung) statusIsi = `<b>${{ menyambung: 'Menyambung…', menyandingkan: 'Menunggu penyandingan dijawab…', menyiapkan: 'Menyiapkan jam…' }[tahap] || 'Menyambung…'}</b><small class="muted" style="display:block">${tahap === 'menyandingkan' ? 'Jawab permintaan penyandingan dari sistem. Tidak ada batas waktu di sini — yang ditunggu jari Anda, bukan radio.' : 'Radio sedang bekerja.'}</small>`;
      else if (p.belumDipasangkan) statusIsi = `<b>Belum ada jam yang dipasangkan</b><small class="muted" style="display:block">Hanya jam AsaWatch yang dicari; perangkat Bluetooth lain tidak akan muncul.</small>`;
      else if (p.penyandinganHilang) statusIsi = `<b>Jam Tidak Tersandingkan</b><small class="muted" style="display:block">Ponsel dan jam tidak lagi saling mengenali. Lupakan jam di pengaturan Bluetooth sistem, lalu sandingkan ulang.</small>`;
      else if (p.tersambung) statusIsi = `<b>${esc(p.namaPerangkat)}</b><small class="muted" style="display:block">Tersambung${p.baterai != null ? ` · baterai ${p.baterai}%` : ''}${p.bateraiKritis ? ' · <b style="color:var(--red)">kritis — jam menolak mengukur di bawah 10%</b>' : ''}</small>`;
      else statusIsi = `<b>${esc(p.namaPerangkat)}</b><small class="muted" style="display:block">Terputus. Sampel yang diukur selagi terputus menunggu di buffer jam dan menyusul saat tersambung.</small>`;

      wadah.innerHTML = `
        <div class="card utama"><div class="perangkat-status"><div class="dev-media lg">${ic('i-watch')}</div><div style="flex:1">${statusIsi}</div><span class="tag ${p.tersambung ? 'ok' : p.sedangMenyambung ? 'warn' : 'danger'}">${p.tersambung ? 'Tersambung' : p.sedangMenyambung ? 'Menyambung' : 'Terputus'}</span></div>
          <div class="dev-btns" style="margin-top:1rem">
            ${p.belumDipasangkan ? '<button class="btn-primary" id="btnCari">Cari Jam AsaWatch</button>' : ''}
            ${!p.belumDipasangkan && !p.tersambung && !p.sedangMenyambung ? '<button class="btn-primary" id="btnSambung">Sambungkan Ulang</button>' : ''}
            ${p.penyandinganHilang ? '<button class="btn-ghost" id="btnSandingUlang">Sandingkan Ulang</button>' : ''}
            ${p.tersambung ? '<button class="btn-ghost" id="btnPutus">Putuskan</button><button class="btn-ghost" id="btnSinkronJam">Tarik Buffer Jam</button>' : ''}
            ${!p.belumDipasangkan ? '<button class="btn-ghost danger" id="btnLupakan">Lupakan Jam</button>' : ''}
          </div>
          ${!window.Jam.JamAsli.didukung() && !palsu ? `<p class="catatan">Browser ini tidak mendukung Web Bluetooth. Pakai Chrome/Edge (HTTPS), atau nyalakan Jam Palsu untuk mencoba alurnya.</p>` : ''}
          ${window.Jam.JamAsli.didukung() && !palsu && !window.Jam.JamAsli.bisaSambungUlangSenyap() ? `<p class="catatan">Koneksi Bluetooth di web hanya hidup selama satu halaman terbuka. Browser ini belum bisa menyambung ulang otomatis saat pindah halaman — aktifkan <code>chrome://flags/#enable-web-bluetooth-new-permissions-backend</code> lalu mulai ulang Chrome; tanpa itu tekan <b>Sambungkan Ulang</b> setiap kali pindah halaman. Sampel yang diukur selagi terputus tetap aman di buffer jam.</p>` : ''}</div>
        <div class="card"><div class="card-head"><h3>Keadaan Jam</h3></div><ul class="kv">
          <li><span>Baterai</span><b>${p.baterai != null ? p.baterai + '%' : '— (hanya terbaca selagi tersambung)'}</b></li>
          <li><span>Sampel tertahan di buffer</span><b>${p.sampelTertunda}</b></li>
          <li><span>Sinkron terakhir</span><b>${p.sinkronTerakhir ? U.tanggal(p.sinkronTerakhir) : '—'}</b></li>
          <li><span>Sensor</span><b>${p.kemampuan ? ['Detak jantung', p.kemampuan.gulaDarah && 'Gula darah', p.kemampuan.tekananDarah && 'Tensi', p.kemampuan.spo2 && 'SpO₂'].filter(Boolean).join(', ') : 'diketahui setelah tersambung'}</b></li>
          <li><span>Firmware</span><b>${p.firmwareBuild != null ? 'build ' + p.firmwareBuild : '—'}</b></li>
          <li><span>Sesi aktif</span><b>${ctl.sesiAktif ? esc(StatusSesi.label(ctl.sesiAktif.status)) : 'tidak ada'}</b></li></ul></div>
        ${palsu ? `<div class="card sekunder"><div class="card-head"><h3>Kendali Jam Palsu</h3></div><p class="muted" style="margin-bottom:.6rem">Tombol fisik jam dan keadaan yang tidak bisa dipesan pada jam sungguhan.</p>
          <div class="dev-btns"><button class="btn-ghost" id="pTombolJam" ${!p.tersambung ? 'disabled' : ''}>Tekan tombol "Selesai Makan"</button><button class="btn-ghost" id="pTombolUkur" ${!jam.tombolUkurMenyala ? 'disabled' : ''}>Tekan tombol ukur${jam.tombolUkurMenyala ? ' (menyala)' : ''}</button><button class="btn-ghost" id="pBateraiKritis">Baterai ${p.bateraiKritis ? 'normal' : 'kritis'}</button><button class="btn-ghost" id="pPutusMendadak" ${!p.tersambung ? 'disabled' : ''}>Putus mendadak</button></div></div>` : ''}
        <div class="card"><div class="card-head"><h3>Mode Pengembangan</h3></div><ul class="list">
          <li><i class="ic blue sm">${ic('i-watch')}</i><div><b>Jam palsu</b><small>Tanpa perangkat; alur sesi lengkap bisa dicoba</small></div><button class="tgl ${st.simulasi ? 'on' : ''}" data-tgl="simulasi" aria-label="Jam palsu"></button></li>
          <li><i class="ic amber sm">${ic('i-clock')}</i><div><b>Jadwal uji</b><small>Sesi ${st.faktorJadwalUji || 60}× lebih cepat; sesinya ditandai sesi uji</small></div><button class="tgl ${st.jadwalUji ? 'on' : ''}" data-tgl="jadwalUji" aria-label="Jadwal uji"></button></li>
          <li><i class="ic green sm">${ic('i-activity')}</i><div><b>Faktor jadwal uji</b><small>60 untuk jam palsu, 12 untuk jam sungguhan</small></div><select id="faktor" style="margin-left:auto;padding:.4rem;border-radius:8px;background:var(--bg)"><option ${st.faktorJadwalUji == 60 ? 'selected' : ''} value="60">60×</option><option ${st.faktorJadwalUji == 12 ? 'selected' : ''} value="12">12×</option><option ${st.faktorJadwalUji == 6 ? 'selected' : ''} value="6">6×</option></select></li>
          <li><i class="ic red sm">${ic('i-trash')}</i><div><b>Hapus semua sesi uji</b><small>${ctl.adaSesiUji ? 'Ada sesi uji tersimpan' : 'Tidak ada sesi uji'}</small></div><button class="btn-ghost sm" id="btnHapusUji" ${ctl.adaSesiUji ? '' : 'disabled'} style="margin-left:auto">Hapus</button></li>
          <li><i class="ic violet sm">${ic('i-info')}</i><div><b>Izin notifikasi pengingat</b><small>${typeof Notification === 'undefined' ? 'tidak didukung' : Notification.permission === 'granted' ? 'diizinkan — berbunyi selagi tab terbuka' : 'belum diizinkan'}</small></div>${typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? '<button class="btn-ghost sm" id="btnNotif" style="margin-left:auto">Izinkan</button>' : ''}</li>
        </ul><p class="catatan">Perubahan mode berlaku setelah halaman dimuat ulang. Bisa juga lewat URL: <code>?jamPalsu=1&jadwalUji=1&faktor=12</code>.</p></div>`;

      $('btnCari')?.addEventListener('click', async () => {
        try {
          const d = await jam.pindai();
          if (!d) return toast('Tidak ada jam yang dipilih.');
          toast(`Menyambung ke ${d.nama}…`);
          const h = await jam.sambungkan(d.id);
          if (h !== window.Jam.HasilSambung.berhasil) toast(window.Jam.HasilSambung.pesan(h, d.nama));
          else toast('Jam tersambung');
        } catch (e) { toast(e.pesanPengguna || e.message); }
      });
      $('btnSambung')?.addEventListener('click', async () => { const h = await jam.sambungkan(); if (h !== 'berhasil') toast(window.Jam.HasilSambung.pesan(h, p.namaPerangkat || 'Jam')); });
      $('btnSandingUlang')?.addEventListener('click', async () => { await jam.lupakanPenyandingan(); toast('Buka pengaturan Bluetooth sistem, lupakan jam, lalu cari lagi.'); });
      $('btnPutus')?.addEventListener('click', () => jam.putuskan());
      $('btnSinkronJam')?.addEventListener('click', () => { jam.sinkronkan(); toast('Buffer jam diminta'); });
      $('btnLupakan')?.addEventListener('click', async () => {
        const ya = await U.konfirmasi({ judul: 'Lupakan jam ini?', isi: 'Sampel yang masih tersimpan di buffer jam tidak akan pernah masuk ke akun ini sampai jam dipasangkan lagi.', ya: 'Lupakan', bahaya: true });
        if (ya) { await jam.lupakanPerangkat(); toast('Jam dilupakan'); }
      });
      $('pTombolJam')?.addEventListener('click', () => toast(jam.tekanSelesaiMakan() ? 'Tombol jam ditekan' : 'Jam menolak: belum ada sesi yang di-ARM (belum ada foto), atau sudah ditekan.'));
      $('pTombolUkur')?.addEventListener('click', () => toast(jam.tekanTombolUkur() ? 'Jam mengukur…' : 'Tombol ukur belum menyala.'));
      $('pBateraiKritis')?.addEventListener('click', () => jam.setBaterai(p.bateraiKritis ? 68 : 8));
      $('pPutusMendadak')?.addEventListener('click', () => jam.putuskan());
      wadah.querySelectorAll('.tgl[data-tgl]').forEach(t => t.addEventListener('click', () => {
        const aktif = t.classList.toggle('on'); S.set(t.dataset.tgl, aktif);
        toast('Tersimpan — muat ulang halaman untuk menerapkan'); gambar();
      }));
      $('faktor')?.addEventListener('change', e => { S.set('faktorJadwalUji', Number(e.target.value)); toast('Tersimpan — muat ulang halaman untuk menerapkan'); });
      $('btnHapusUji')?.addEventListener('click', async () => { if (await U.konfirmasi({ judul: 'Hapus semua sesi uji?', isi: 'Hanya sesi bertanda sesi uji yang dihapus. Data lain dan penyandingan jam tetap.', ya: 'Hapus', bahaya: true })) { await ctl.hapusSesiUji(); toast('Sesi uji dihapus'); } });
      $('btnNotif')?.addEventListener('click', async () => { await Notification.requestPermission(); gambar(); });
    }
    ctl.on('ubah', gambar);
    gambar();
  }

  /* ============================================================
     PROFIL — §5.1, semua opsional; keluar tidak menghapus data
     ============================================================ */
  async function halamanProfil() {
    const { ctl } = await window.App.siap;
    U.identitas();
    const form = $('formProfil');
    let lokalSaja = false;
    const isi = (p) => { if (!p) return; $('pNama').value = p.nama || ''; $('pLahir').value = p.tanggalLahir || ''; $('pJk').value = p.jenisKelamin || ''; $('pGol').value = p.golonganDarah || ''; $('pTinggi').value = p.tinggi || ''; $('pBerat').value = p.berat || ''; };
    const lokal = JSON.parse(localStorage.getItem('aw_profil') || 'null');
    isi(lokal);
    window.Server.profil().then(p => { if (p) { isi(p); localStorage.setItem('aw_profil', JSON.stringify(p)); } }).catch(() => { lokalSaja = true; });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const p = { nama: $('pNama').value.trim(), tanggalLahir: $('pLahir').value, jenisKelamin: $('pJk').value, golonganDarah: $('pGol').value, tinggi: $('pTinggi').value, berat: $('pBerat').value };
      const g = $('galatProfil'); g.classList.add('hidden');
      if (p.tinggi && (Number(p.tinggi) < 50 || Number(p.tinggi) > 250)) { g.textContent = 'Tinggi badan harus 50–250 cm.'; g.classList.remove('hidden'); return; }
      if (p.berat && (Number(p.berat) < 2 || Number(p.berat) > 400)) { g.textContent = 'Berat badan harus 2–400 kg.'; g.classList.remove('hidden'); return; }
      if (p.tanggalLahir && new Date(p.tanggalLahir) > new Date()) { g.textContent = 'Tanggal lahir tidak boleh di masa depan.'; g.classList.remove('hidden'); return; }
      localStorage.setItem('aw_profil', JSON.stringify(p));
      if (p.nama) { window.Pengaturan.setUser({ ...window.Pengaturan.user(), nama: p.nama }); U.identitas(); }
      try { await window.Server.simpanProfil(p); toast('Profil tersimpan ke akun'); }
      catch (err) { toast(err.status === 401 ? err.message : 'Tersimpan di browser ini saja — belum sampai ke akun (' + (err.message || 'offline') + ').'); }
    });

    $('btnLogout').addEventListener('click', async () => {
      if (!await U.konfirmasi({ judul: 'Keluar dari akun?', isi: 'Data sesi di browser ini tidak dihapus; masuk lagi dengan akun yang sama akan menemukannya kembali.', ya: 'Keluar' })) return;
      await window.Server.keluar();
      location.href = 'login.html';
    });
    const sub = () => {
      const p = ctl.statusPerangkat, k = ctl.kalibrasiTerakhir;
      $('subPerangkat').textContent = p.belumDipasangkan ? 'Belum dipasangkan' : p.tersambung ? `${p.namaPerangkat} · tersambung` : `${p.namaPerangkat} · terputus`;
      $('subKalibrasi').textContent = !k ? 'Belum pernah' : M.Kalibrasi.kedaluwarsaPada(k) ? 'Kedaluwarsa' : `Berlaku ${M.Kalibrasi.sisaHariPada(k)} hari lagi`;
    };
    ctl.on('ubah', sub);
    sub();
  }

  /* ============================================================
     LOGIN / DAFTAR
     ============================================================ */
  function halamanAuth() {
    document.addEventListener('click', e => {
      const eye = e.target.closest('.eye'); if (!eye) return;
      const input = document.getElementById(eye.dataset.eye); if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    try { const alasan = sessionStorage.getItem('aw_alasan_keluar'); if (alasan) { sessionStorage.removeItem('aw_alasan_keluar'); setTimeout(() => toast(alasan), 300); } } catch { }
    const sibuk = (b, teks) => { if (b) { b.disabled = true; b.dataset.teks = b.textContent; b.textContent = teks; } };
    const selesai = (b) => { if (b) { b.disabled = false; b.textContent = b.dataset.teks || b.textContent; } };
    const tampilGalat = (form, hasil) => {
      // Di atas tombol, bukan toast: kalimatnya menyebut apa yang harus diubah pada form ini.
      let g = form.querySelector('.galat-form'); if (!g) { g = document.createElement('div'); g.className = 'galat-form'; form.querySelector('button[type="submit"]').before(g); }
      g.textContent = hasil.pesan; g.classList.remove('hidden');
    };
    const berhasil = () => { localStorage.removeItem('aw_akun_email_sementara'); location.href = 'dashboard.html'; };

    $('loginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('loginId').value.trim(), sandi = $('loginPass').value, tombol = e.target.querySelector('button[type="submit"]');
      if (!email.includes('@')) return tampilGalat(e.target, { pesan: 'Masuk memakai email yang terdaftar.' });
      sibuk(tombol, 'Memproses…');
      try { await window.Server.masuk(email, sandi); berhasil(); }
      catch (err) { tampilGalat(e.target, err.hasil || { pesan: err.message }); selesai(tombol); }
    });
    $('registerForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const nama = $('regName').value.trim(), email = $('regEmail').value.trim(), sandi = $('regPass').value, sandi2 = $('regPass2').value, tombol = e.target.querySelector('button[type="submit"]');
      if (sandi !== sandi2) return tampilGalat(e.target, { pesan: 'Kata sandi tidak cocok.' });
      if (sandi.length < 8) return tampilGalat(e.target, { pesan: 'Kata sandi minimal 8 karakter.' });
      sibuk(tombol, 'Mendaftarkan…');
      try {
        await window.Server.daftar(nama, email, sandi);
        if (!window.Server.token()) await window.Server.masuk(email, sandi);   // server lama tanpa token saat daftar
        berhasil();
      } catch (err) { tampilGalat(e.target, err.hasil || { pesan: err.message }); selesai(tombol); }
    });
    pasangTombolGoogle();
    if (window.Server?.token()) location.replace('dashboard.html');
  }

  function pasangTombolGoogle() {
    const wadah = $('tombolGoogle'), galat = $('googleGalat');
    if (!wadah) return;
    const idKlien = window.ASAWATCH_SERVER?.googleClientId;
    const beritahu = (pesan) => { if (!galat) return; galat.textContent = pesan; galat.classList.remove('hidden'); wadah.closest('.gsi-wrap')?.classList.add('hidden'); };
    if (!idKlien || idKlien.startsWith('GANTI')) return beritahu('Masuk dengan Google belum dikonfigurasi.');
    let sisa = 40;
    (function tunggu() {
      if (!window.google?.accounts?.id) { if (--sisa <= 0) return beritahu('Gagal memuat layanan Google. Cek koneksi, lalu muat ulang halaman.'); return setTimeout(tunggu, 150); }
      try {
        google.accounts.id.initialize({
          client_id: idKlien,
          callback: async ({ credential }) => {
            if (!credential) return toast('Tidak ada token dari Google');
            toast('Memverifikasi akun Google…');
            try { await window.Server.masukGoogle(credential); location.href = 'dashboard.html'; }
            catch (err) { toast(err.hasil?.pesan || err.message); }
          },
        });
        google.accounts.id.renderButton(wadah, { theme: 'outline', size: 'large', shape: 'pill', text: document.getElementById('registerForm') ? 'signup_with' : 'signin_with', logo_alignment: 'center', width: 320 });
      } catch (e) { beritahu('Google menolak halaman ini: ' + (e.message || e)); }
    })();
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  const HALAMAN = {
    auth: halamanAuth, beranda: halamanBeranda, nutrisi: halamanNutrisi, sesi: halamanSesi, ringkasan: halamanRingkasan,
    riwayat: halamanRiwayat, analisis: halamanAnalisis, kesehatan: halamanMetrik, pindai: halamanPindai,
    kalibrasi: halamanKalibrasi, perangkat: halamanPerangkat, profil: halamanProfil,
    bantuan: async () => { await window.App.siap; U.identitas(); },
  };
  function mulai() {
    const fn = HALAMAN[document.body.dataset.page];
    if (!fn || window.App?.dialihkan) return;   // sedang dialihkan ke login
    Promise.resolve(fn()).catch(e => console.error('[AsaWatch] halaman:', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
