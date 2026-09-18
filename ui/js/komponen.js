/**
 * komponen.js — potongan tampilan yang dipakai lebih dari satu halaman.
 * Padanan lib/widgets/ di Flutter: timeline sampel, petunjuk tombol jam,
 * petunjuk tombol ukur, ringkasan nutrisi, foto makanan, kartu sesi, hitung
 * mundur. Semua mengembalikan string HTML; pemasang event dilakukan terpisah.
 */
(function () {
  'use strict';

  const M = window.Model;
  const { Sesi, Sampel, StatusSesi, StatusSampel } = M;
  const U = () => window.UI;
  const esc = (s) => window.UI.esc(s);
  const ic = (s) => window.UI.ic(s);

  const Komponen = {
    /** Lencana status sesi (+ sesi uji). */
    lencana(sesi) {
      const kelas = sesi.status;
      let h = `<span class="tag ${kelas}">${esc(StatusSesi.label(sesi.status))}</span>`;
      if (sesi.sesiUji) h += ` <span class="tag uji">Sesi uji</span>`;
      if (sesi.waktuTidakPasti) h += ` <span class="tag tidakLengkap">Waktu tidak pasti</span>`;
      return h;
    },

    lencanaKualitas(sesi) {
      const k = Sesi.kualitasRespons(sesi);
      return `<span class="tag ${k}">${esc(M.KualitasRespons.label(k))}</span>`;
    },

    /** Timeline 4 titik. Titik yang belum ada ditulis "—", tidak pernah nilai lama. */
    timeline(sesi, { metrik, ctl } = {}) {
      const tampil = M.KemampuanPerangkat.tampil(metrik ?? ctl?.statusPerangkat?.kemampuan);
      const berikut = Sesi.sampelBerikutnya(sesi);
      return `<ul class="timeline">${sesi.sampel.map(sp => {
        const terisi = Sampel.terisi(sp);
        const kelas = terisi ? 'terisi' : sp.status === StatusSampel.terlewat ? 'terlewat' : (berikut && berikut.index === sp.index ? 'berikut' : '');
        const telat = Sesi.sampelTelat(sesi, sp);
        let waktu = '';
        if (terisi && sesi.t0) waktu = U().jam(Sampel.waktuUkur(sp, sesi.t0)) + (sp.dariBuffer ? ' · dari buffer jam' : '');
        else if (!terisi && sp.status === StatusSampel.menunggu && sesi.t0 && sp.index > 1) waktu = `<span data-hitung="${new Date(sesi.t0).getTime() + sp.detikRelatifT0 * 1000}"></span>`;
        else if (sp.status === StatusSampel.terlewat) waktu = 'terlewat';
        else if (!sesi.t0 && sp.index === 1) waktu = 'menunggu tombol jam';
        let nilai;
        if (terisi) {
          const gd = tampil.gulaDarah || sp.gulaDarah != null;
          nilai = gd && sp.gulaDarah != null ? `${sp.gulaDarah}<small>mg/dL</small>` : (gd ? '—<small>mg/dL</small>' : '');
          const sekunder = [];
          if (sp.detakJantung != null) sekunder.push(`${sp.detakJantung} bpm`);
          if ((tampil.tekananDarah || sp.sistolik != null) && Sampel.tekananDarah(sp)) sekunder.push(`${Sampel.tekananDarah(sp)} mmHg`);
          if ((tampil.spo2 || sp.spo2 != null) && sp.spo2 != null) sekunder.push(`${sp.spo2}%`);
          nilai += sekunder.length ? `<small>${sekunder.join(' · ')}</small>` : '';
        } else nilai = `<span class="nilai tunggu">—</span>`;
        return `<li><span class="titik ${kelas}">${terisi ? ic('i-check') : sp.index + 1}</span>
          <span class="nama ${telat ? 'telat' : ''}">${esc(Sesi.labelSampel(sesi, sp))}${telat ? ' <small class="telat">diukur telat</small>' : ''}<small>${waktu}</small></span>
          <span class="nilai">${nilai}</span></li>`;
      }).join('')}</ul>`;
    },

    /**
     * PetunjukTombolJam — tombol jam disebut LEBIH DULU, lalu tombol app di
     * bawahnya; keduanya menekan tombol yang sama. Tidak boleh dihapus.
     */
    petunjukTombolJam(ctl, sesi) {
      const p = ctl.statusPerangkat;
      const alasan = ctl.alasanJamTidakBisaUkur;
      const baseline = sesi.sampel[0];
      const barisBaseline = baseline.status === StatusSampel.menunggu && ctl.kemajuanUkur
        ? `<small class="muted">Jam sedang mengukur baseline${ctl.kemajuanUkur.persen != null ? ` (${ctl.kemajuanUkur.persen}%)` : '…'}</small>` : '';
      return `<div class="petunjuk" id="petunjukJam">
        <p><b>Selesai makan? Tekan tombol di jam.</b> Momen itulah yang menjadi titik nol sesi — jam yang mencatatnya, bukan ponsel.</p>
        ${barisBaseline}
        <p class="muted" style="margin-top:.5rem">Kalau ponsel sedang di tangan, tombol di bawah melakukan hal yang sama: jam menekan tombolnya sendiri.</p>
        <button class="btn-primary block" id="btnSelesaiMakan" ${alasan || !p.tersambung ? 'disabled' : ''}>Saya Sudah Selesai Makan</button>
        ${alasan ? `<small class="alasan">${esc(alasan)}</small>` : ''}
      </div>`;
    },

    /**
     * PetunjukTombolUkur — tombol app disebut lebih dulu (notifikasi baru berbunyi
     * di ponsel), tombol jam kalimat kedua. Ringkas: tanpa kotak penjelasan,
     * tetapi alasan tombol mati tetap ada di keterangan.
     */
    petunjukTombolUkur(ctl, { ringkas = false } = {}) {
      const t = ctl.titikBerikutnya;
      if (!t) return '';
      const alasan = ctl.alasanJamTidakBisaUkur;
      const sisa = ctl.sisaSampaiTitikBerikutnyaDetik ?? 0;
      const kemajuan = ctl.kemajuanUkur;
      let label = `Ukur ${t.label} Sekarang`, mati = !!alasan, ket = alasan || '';
      if (kemajuan) { label = `Mengukur…${kemajuan.persen != null ? ` ${kemajuan.persen}%` : ''}`; mati = true; ket = kemajuan.macet ? 'Jam belum menemukan nadi — rapatkan jam di pergelangan.' : (kemajuan.sisaDetik ? `Perkiraan ${kemajuan.sisaDetik} detik lagi.` : 'Jam sedang mengukur.'); }
      else if (sisa > 0) { label = `Ukur ${t.label} dalam <span data-mundur="${Date.now() + sisa * 1000}">${U().durasi(sisa)}</span>`; mati = true; ket = 'Terlalu cepat masih bisa diperbaiki — tombol menyala begitu jendelanya terbuka.'; }
      return `<div class="petunjuk ${ringkas ? 'ringkas' : ''}" id="petunjukUkur">
        ${ringkas ? '' : `<p><b>Saat ${esc(t.label)} tiba, tekan tombol di bawah.</b> Tombol ukur di jam menyala pada saat yang sama — keduanya mengukur titik yang sama.</p>`}
        <button class="btn-primary block" id="btnUkurTitik" ${mati ? 'disabled' : ''}>${label}</button>
        ${ket ? `<small class="${alasan ? 'alasan' : 'muted'}" style="display:block;margin-top:.5rem">${esc(ket)}</small>` : ''}
        ${ringkas ? `<small class="muted" style="display:block;margin-top:.3rem">Tombol ukur di jam melakukan hal yang sama.</small>` : ''}
      </div>`;
    },

    /** Kartu gizi: spinner hanya saat analisis benar-benar berjalan; kosong = "tidak tersedia". */
    ringkasanNutrisi(sesi, ctl, { fotoUrl = null, bisaDibuka = false, editable = false } = {}) {
      const h = sesi.hasil;
      const foto = fotoUrl
        ? `<img src="${fotoUrl}" class="foto-thumb ${bisaDibuka ? 'klik' : ''}" ${bisaDibuka ? 'data-buka-foto' : ''} alt="Foto makanan">`
        : `<div class="foto-thumb">${ic('i-food')}</div>`;
      if (!h) {
        const sedang = ctl?.sedangMenganalisis(sesi.id);
        return `<div class="row" style="display:flex;gap:.9rem;align-items:center">${foto}<div><b>${sedang ? 'Menganalisis makanan…' : 'Rincian makanan tidak tersedia'}</b>
          <small class="muted" style="display:block">${sedang ? 'Angka gizi menyusul; sesi tetap berjalan normal.' : (editable ? 'Isi angka gizinya secara manual di bawah.' : 'Foto tidak dianalisis atau analisis gagal.')}</small></div></div>`;
      }
      const z = (kunci, satuan) => {
        const v = h.total[kunci];
        if (v == null) return '—';
        const parsial = (h.zatTidakLengkap || []).includes(kunci);
        if (parsial && v === 0) return '—';
        return `${parsial ? '≥ ' : ''}${U().angka(v, satuan === 'g' ? 1 : 0)}<i> ${satuan}</i>`;
      };
      const catatan = [];
      if (h.total.karbohidrat != null) catatan.push(`${U().angka(h.total.karbohidrat, 0)} g karbohidrat`);
      if (h.indeksGlikemikPerkiraan) catatan.push(`indeks glikemik ${h.indeksGlikemikPerkiraan}`);
      if (h.keyakinan != null) catatan.push(`keyakinan deteksi ${Math.round(h.keyakinan * 100)}%`);
      if (h.dikoreksiUser) catatan.push('dikoreksi pengguna');
      return `<div style="display:flex;gap:.9rem;align-items:center">${foto}<div style="min-width:0"><b>${esc(M.HasilDeteksi.ringkasanNama(h))}</b>
          <small class="muted" style="display:block">${h.makanan.length} makanan${(h.zatTidakLengkap || []).length ? ' · sebagian angka hanya perkiraan minimum' : ''}</small></div></div>
        <div class="gizi-grid">
          <div><small>Kalori</small><b>${z('kalori', 'kcal')}</b></div>
          <div><small>Karbohidrat</small><b>${z('karbohidrat', 'g')}</b></div>
          <div><small>Protein</small><b>${z('protein', 'g')}</b></div>
          <div><small>Lemak</small><b>${z('lemak', 'g')}</b></div>
          <div><small>Gula total</small><b>${z('gulaTotal', 'g')}</b></div>
          <div><small>Serat</small><b>${z('serat', 'g')}</b></div>
        </div>
        ${h.makanan.length ? `<div id="daftarMakanan">${h.makanan.map((m, i) => `<div class="makanan-item"><div><b>${esc(m.nama)}</b><small>${esc(m.porsi)}${m.estimasiGram ? ` · ${U().angka(m.estimasiGram)} g` : ''}${m.nutrisi.kalori != null ? ` · ${U().angka(m.nutrisi.kalori)} kcal` : ''}</small></div>${editable ? `<button class="btn-ghost sm" data-koreksi="${i}">Koreksi</button>` : ''}</div>`).join('')}</div>` : ''}
        ${catatan.length ? `<p class="catatan">${esc(catatan.join(' · '))}</p>` : ''}`;
    },

    /** Entri daftar sesi (Riwayat, sesi terakhir). Foto sebagai thumbnail bila ada. */
    itemSesi(sesi, fotoUrl) {
      const waktu = new Date(sesi.t0 || sesi.waktuFoto);
      const nama = sesi.hasil ? M.HasilDeteksi.ringkasanNama(sesi.hasil) : 'Makanan';
      const kal = Sesi.kalori(sesi);
      return `<div class="sesi-item" data-sesi="${sesi.id}">
        ${fotoUrl ? `<img class="foto-thumb" src="${fotoUrl}" alt="">` : `<div class="foto-thumb">${ic('i-food')}</div>`}
        <div class="isi"><b>${esc(nama)}</b><small>${esc(Sesi.labelWaktuMakan(sesi))} · ${U().jam(waktu)}${kal != null ? ` · ${U().angka(kal)} kcal` : ''}${sesi.sesiUji ? ' · sesi uji' : ''}</small></div>
        <div class="kanan">${Sesi.sedangAktif(sesi) ? Komponen.lencana(sesi) : Komponen.lencanaKualitas(sesi)}${Sesi.deltaPuncak(sesi) != null ? `<small class="muted">+${Sesi.deltaPuncak(sesi)} mg/dL</small>` : ''}</div>
      </div>`;
    },

    /** Hitung mundur per detik untuk semua [data-mundur] / [data-hitung] di wadah; lokal, bukan event. */
    pasangHitungMundur(wadah, onHabis) {
      let habisDipanggil = false;
      const tik = () => {
        const kini = Date.now();
        wadah.querySelectorAll('[data-mundur]').forEach(el => {
          const sisa = Math.ceil((Number(el.dataset.mundur) - kini) / 1000);
          el.textContent = U().durasi(sisa);
          if (sisa <= 0 && !habisDipanggil) { habisDipanggil = true; onHabis?.(); }
        });
        wadah.querySelectorAll('[data-hitung]').forEach(el => {
          const sisa = Math.ceil((Number(el.dataset.hitung) - kini) / 1000);
          el.textContent = sisa > 0 ? `dalam ${U().durasi(sisa)}` : 'sudah waktunya';
        });
      };
      tik();
      const t = setInterval(tik, 1000);
      return () => clearInterval(t);
    },

    /** Pratinjau foto penuh layar. */
    bukaFoto(url) {
      const w = document.createElement('div');
      w.className = 'pratinjau';
      w.innerHTML = `<img src="${url}" alt="Foto makanan"><button aria-label="Tutup">${ic('i-x')}</button>`;
      w.addEventListener('click', () => w.remove());
      document.body.appendChild(w);
    },

    /** Modal koreksi satu item makanan (nama, porsi, gram). */
    koreksiItem(item) {
      return new Promise(res => {
        const m = document.createElement('div');
        m.className = 'modal';
        m.innerHTML = `<div class="modal-box"><h3>Koreksi makanan</h3>
          <div class="form-col">
            <label>Nama<input id="kNama" value="${esc(item.nama)}"></label>
            <label>Porsi (teks)<input id="kPorsi" value="${esc(item.porsi)}" placeholder="mis. setengah piring"></label>
            <label>Perkiraan berat (gram) — nutrisi ikut terskala<input id="kGram" type="number" min="0" step="1" value="${item.estimasiGram || ''}"></label>
          </div>
          <div class="row gap"><button class="btn-ghost block" data-k="0">Batal</button><button class="btn-primary block" data-k="1">Simpan</button></div></div>`;
        m.addEventListener('click', e => {
          const b = e.target.closest('[data-k]');
          if (!b && e.target !== m) return;
          if (b?.dataset.k === '1') {
            const gram = Number(m.querySelector('#kGram').value);
            res({ nama: m.querySelector('#kNama').value.trim() || item.nama, porsi: m.querySelector('#kPorsi').value.trim() || item.porsi, estimasiGram: Number.isFinite(gram) && gram > 0 ? gram : undefined });
          } else res(null);
          m.remove();
        });
        document.body.appendChild(m);
      });
    },
  };

  window.Komponen = Komponen;
})();
