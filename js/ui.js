/* ============================================================
   ui.js — interaksi khusus tampilan (tidak menyentuh data)
   ============================================================ */
(function () {
  'use strict';

  document.addEventListener('click', function (e) {
    // --- lihat/sembunyikan password ---
    const eye = e.target.closest('.eye');
    if (eye) {
      const input = document.getElementById(eye.dataset.eye);
      if (input) {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        eye.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      }
      return;
    }

    // --- saklar pengaturan ---
    const tgl = e.target.closest('.tgl');
    if (tgl) {
      tgl.classList.toggle('on');
      return;
    }

    // --- halaman turunan Profil tetap menyorot menu induknya ---
    const nav = e.target.closest('[data-nav]');
    if (nav && ['tujuan', 'bantuan'].includes(nav.dataset.nav)) {
      setTimeout(() => {
        document.querySelectorAll('.side-nav a, .bottom-nav a')
          .forEach(a => a.classList.toggle('active', a.dataset.nav === 'profil'));
      }, 0);
    }
  });
})();
