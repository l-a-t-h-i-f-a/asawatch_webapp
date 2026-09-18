/**
 * AsaWatch Camera Service
 * Menggunakan getUserMedia untuk deteksi makanan (food logging)
 */

class AsaWatchCamera {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.isActive = false;
  }

  // Inisialisasi kamera
  async init(videoElementId, canvasElementId) {
    this.videoElement = document.getElementById(videoElementId);
    this.canvasElement = document.getElementById(canvasElementId);

    if (!this.videoElement || !this.canvasElement) {
      throw new Error('Video atau canvas element tidak ditemukan');
    }
  }

  // Mulai stream kamera
  async startStream() {
    try {
      // Minta akses kamera belakang (environment) untuk foto makanan
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Kamera belakang
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      this.isActive = true;

      return true;
    } catch (err) {
      console.error('Camera access error:', err);

      if (err.name === 'NotAllowedError') {
        throw new Error('Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('Kamera tidak ditemukan di perangkat ini.');
      } else if (err.name === 'NotReadableError') {
        throw new Error('Kamera sedang digunakan oleh aplikasi lain.');
      } else {
        throw new Error('Tidak dapat mengakses kamera: ' + err.message);
      }
    }
  }

  // Hentikan stream
  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.isActive = false;
  }

  // Ambil foto dari stream
  takePicture() {
    if (!this.isActive) {
      throw new Error('Kamera belum aktif');
    }

    const context = this.canvasElement.getContext('2d');

    // Set ukuran canvas sesuai video
    this.canvasElement.width = this.videoElement.videoWidth;
    this.canvasElement.height = this.videoElement.videoHeight;

    // Gambar frame video ke canvas
    context.drawImage(
      this.videoElement,
      0, 0,
      this.canvasElement.width,
      this.canvasElement.height
    );

    // Konversi ke base64
    const imageData = this.canvasElement.toDataURL('image/jpeg', 0.8);

    return imageData;
  }

  // Ambil foto dan kembalikan sebagai Blob
  async takePictureAsBlob() {
    const dataUrl = this.takePicture();

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    return blob;
  }

  // Ambil foto dari file input (galeri)
  async pickFromGallery(fileInput) {
    return new Promise((resolve, reject) => {
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        reject(new Error('Tidak ada file yang dipilih'));
        return;
      }

      const file = fileInput.files[0];

      // Validasi tipe file
      if (!file.type.startsWith('image/')) {
        reject(new Error('File yang dipilih bukan gambar'));
        return;
      }

      // Validasi ukuran (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error('Ukuran gambar terlalu besar (maksimal 10MB)'));
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        resolve({
          dataUrl: event.target.result,
          file: file,
          name: file.name,
          size: file.size,
          type: file.type
        });
      };

      reader.onerror = () => {
        reject(new Error('Gagal membaca file'));
      };

      reader.readAsDataURL(file);
    });
  }

  // Check apakah kamera tersedia
  static async isAvailable() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('Check camera availability error:', err);
      return false;
    }
  }

  // Check apakah getUserMedia didukung
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Flip kamera (depan/belakang) - untuk mobile
  async flipCamera() {
    if (!this.stream) return;

    const videoTrack = this.stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();

    const newFacingMode = settings.facingMode === 'environment' ? 'user' : 'environment';

    // Stop current stream
    this.stopStream();

    // Start with new facing mode
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      return newFacingMode;
    } catch (err) {
      console.error('Flip camera error:', err);
      throw err;
    }
  }
}

// Export singleton
window.camera = new AsaWatchCamera();