# AsaWatch Web App (PWA)

Progressive Web App untuk AsaWatch Health Tracker. Menggunakan Web Bluetooth API untuk komunikasi dengan smartwatch.

## Fitur

- **Dashboard Real-time**: Monitor kesehatan secara langsung dari smartwatch
- **Sesi Makan**: Lacak gula darah sebelum dan sesudah makan
- **Riwayat**: Simpan dan lihat riwayat sesi
- **Analisis**: Grafik dan statistik kesehatan
- **Profil**: Kelola data pengguna
- **Offline Support**: Service Worker untuk caching
- **Deteksi Makanan**: Ambil foto makanan (coming soon)

## Teknologi

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Bluetooth**: Web Bluetooth API (Chrome/Edge only)
- **Database**: IndexedDB untuk penyimpanan lokal
- **Charts**: Chart.js untuk visualisasi data
- **Camera**: getUserMedia API
- **PWA**: Service Worker, Web App Manifest

## Browser Support

- ✅ Chrome 56+ (Desktop & Android)
- ✅ Edge 79+
- ❌ Firefox (Web Bluetooth not supported)
- ❌ Safari (Web Bluetooth not supported)
- ❌ iOS browsers (Web Bluetooth not supported)

**Note**: Web Bluetooth memerlukan HTTPS di produksi.

## Struktur Folder

```
asawatch_webapp/
├── index.html          # Landing page publik (tombol "Mulai" -> ui/login.html)
├── legacy-spa.html     # Versi SPA lama (arsip, boleh dihapus)
├── manifest.json       # PWA manifest (start_url: ui/)
├── firestore.rules     # Aturan akses Firestore
├── sw.js               # Service Worker
├── css/
│   ├── tokens.css      # Token warna & font, dipakai landing + aplikasi
│   ├── landing.css     # Gaya landing page
│   └── main.css        # Gaya aplikasi (dashboard)
├── ui/                 # Aplikasi, satu berkas HTML per halaman
│   ├── login.html  register.html
│   ├── dashboard.html
│   ├── detak-jantung.html  gula-darah.html  tensi.html
│   ├── deteksi-makanan.html  riwayat.html
│   ├── profil.html  pengaturan-perangkat.html
│   ├── tujuan-kesehatan.html  bantuan.html
│   ├── FIREBASE.md     # Panduan menyalakan Auth + Firestore
│   ├── css/ui.css
│   └── js/firebase-config.js  firebase.js  shell.js  store.js  pages.js
├── js/
│   ├── bluetooth.js   # Web Bluetooth wrapper
│   ├── database.js    # IndexedDB service
│   ├── api.js         # Laravel API client
│   ├── charts.js      # Chart.js wrapper
│   ├── camera.js      # getUserMedia wrapper
│   ├── notifications.js # Web Notifications
│   ├── utils.js       # Utility functions
│   └── app.js         # Logika SPA lama (dipakai legacy-spa.html)
└── assets/
    └── logo/
        └── logo2.jpeg
```

## Instalasi

1. Clone repository
2. Buka folder `asawatch_webapp` di browser (Chrome/Edge)
3. Untuk development lokal, gunakan local server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx serve
   
   # VS Code Live Server extension
   ```
4. Akses `http://localhost:8000`

## Konfigurasi Backend

Edit `js/api.js` dan sesuaikan `API_BASE_URL` dengan URL Laravel backend Anda:

```javascript
const API_BASE_URL = 'http://localhost:8000/api/v1';
```

## Pengembangan

### Menambah Halaman Baru

1. Tambah section di `index.html`:
   ```html
   <section id="page-nama" class="page hidden">
     <!-- Content -->
   </section>
   ```

2. Tambah navigasi di bottom nav:
   ```html
   <div class="nav-item" id="navNama">
     <span class="icon">📊</span>
     <span class="label">Nama</span>
   </div>
   ```

3. Tambah event listener di `app.js`

### Menggunakan Bluetooth

```javascript
// Inisialisasi
const bluetooth = new AsaWatchBluetooth();

// Connect
await bluetooth.connect();

// Listen for samples
bluetooth.on('sampel', (sampel) => {
  console.log('Received:', sampel);
});

// Start session
await bluetooth.startSession(sesiId);
```

### Menggunakan Database

```javascript
// Initialize
await db.init();

// Create session
await db.createSession(sessionId, {
  status: 'armed',
  fotoPath: '/path/to/photo.jpg'
});

// Save sample
await db.saveSample(sessionId, 1, {
  gulaDarah: 120,
  detakJantung: 75
});

// Get all sessions
const sessions = await db.getAllSessions();
```

## Deployment

### GitHub Pages

1. Push ke GitHub
2. Enable GitHub Pages di Settings
3. Pilih branch `main` atau `gh-pages`
4. Akses di `https://username.github.io/asawatch_webapp/`

### Netlify/Vercel

1. Connect repository
2. Set build command: (kosong)
3. Set publish directory: `asawatch_webapp`
4. Deploy

### Self-hosted

1. Copy semua file ke web server
2. Pastikan HTTPS aktif (wajib untuk Web Bluetooth)
3. Configure CORS di Laravel backend jika berbeda domain

## Troubleshooting

### Web Bluetooth tidak berfungsi

- Gunakan Chrome atau Edge
- Pastikan HTTPS aktif (atau localhost)
- Cek apakah smartwatch mengiklankan service UUID yang benar
- Cek console browser untuk error

### Data tidak tersimpan

- Cek apakah IndexedDB didukung dan tidak dalam mode private browsing
- Cek storage quota di browser settings

### Notifikasi tidak muncul

- Minta izin notifikasi terlebih dahulu
- Cek apakah browser mendukung Notification API

## Referensi

- [Web Bluetooth API](https://web.dev/bluetooth/)
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Chart.js Documentation](https://www.chartjs.org/docs/)

## License

Proprietary - AsaWatch Health Tracker# asawatch_webapp
# asawatch_webapp
