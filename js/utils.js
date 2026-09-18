/**
 * AsaWatch Utility Functions
 * Helper functions yang digunakan di seluruh aplikasi
 */

window.AsaWatchUtils = {

  // ===== FORMAT FUNCTIONS =====

  /**
   * Format waktu dari detik ke string yang readable
   * @param {number} detik - Waktu dalam detik
   * @returns {string} Formatted time string
   */
  formatWaktu(detik) {
    if (detik === 0) return 'Baseline';

    const jam = Math.floor(detik / 3600);
    const menit = Math.floor((detik % 3600) / 60);
    const detikSisa = detik % 60;

    if (jam > 0) {
      return `${jam}j ${menit}m`;
    } else if (menit > 0) {
      return `${menit}m ${detikSisa}s`;
    } else {
      return `${detikSisa}s`;
    }
  },

  /**
   * Format tanggal ke bahasa Indonesia
   * @param {string|Date} tanggal - ISO date string atau Date object
   * @returns {string} Formatted date
   */
  formatTanggal(tanggal) {
    const date = new Date(tanggal);
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };

    return date.toLocaleDateString('id-ID', options);
  },

  /**
   * Format tanggal tanpa waktu
   */
  formatTanggalSaja(tanggal) {
    const date = new Date(tanggal);
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    return date.toLocaleDateString('id-ID', options);
  },

  /**
   * Format nilai kesehatan dengan unit
   * @param {number|null} value - Nilai
   * @param {string} unit - Unit satuan
   * @returns {string} Formatted value
   */
  formatNilai(value, unit = '') {
    if (value === null || value === undefined) return '-';

    const formatted = typeof value === 'number' ? value.toFixed(1) : value;
    return unit ? `${formatted} ${unit}` : formatted;
  },

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Generate UUID v4
   * @returns {string} UUID
   */
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // ===== VALIDATION FUNCTIONS =====

  /**
   * Validasi email
   */
  isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  /**
   * Validasi password (min 8 karakter)
   */
  isValidPassword(password) {
    return password && password.length >= 8;
  },

  /**
   * Validasi ID sesi (harus UUID valid)
   */
  isValidSessionId(sesiId) {
    if (!sesiId) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(sesiId);
  },

  // ===== HEALTH METRIC HELPERS =====

  /**
   * Dapatkan status kesehatan berdasarkan nilai dan rentang normal
   * @param {string} metric - Nama metrik
   * @param {number} value - Nilai
   * @returns {object} { status, color, message }
   */
  getHealthStatus(metric, value) {
    if (value === null || value === undefined) {
      return { status: 'unknown', color: '#95a5a6', message: 'Tidak terukur' };
    }

    const ranges = {
      gulaDarah: { low: 70, high: 140, unit: 'mg/dL' },
      detakJantung: { low: 60, high: 100, unit: 'bpm' },
      sistolik: { low: 90, high: 140, unit: 'mmHg' },
      diastolik: { low: 60, high: 90, unit: 'mmHg' },
      spo2: { low: 95, high: 100, unit: '%' }
    };

    const range = ranges[metric];
    if (!range) {
      return { status: 'unknown', color: '#95a5a6', message: '-' };
    }

    if (value < range.low) {
      return {
        status: 'low',
        color: '#3498db',
        message: `${this.capitalize(metric)} rendah`
      };
    } else if (value > range.high) {
      return {
        status: 'high',
        color: '#e74c3c',
        message: `${this.capitalize(metric)} tinggi`
      };
    } else {
      return {
        status: 'normal',
        color: '#2ecc71',
        message: 'Normal'
      };
    }
  },

  /**
   * Hitung BMI
   */
  calculateBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm) return null;

    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);

    let category;
    if (bmi < 18.5) category = 'Kurus';
    else if (bmi < 25) category = 'Normal';
    else if (bmi < 30) category = 'Gemuk';
    else category = 'Obesitas';

    return {
      value: bmi.toFixed(1),
      category: category
    };
  },

  // ===== DATA CONVERSION =====

  /**
   * Convert data URL to Blob
   */
  dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const b64 = atob(parts[1]);
    const u8 = new Uint8Array(b64.length);

    for (let i = 0; i < b64.length; i++) {
      u8[i] = b64.charCodeAt(i);
    }

    return new Blob([u8], { type: mime });
  },

  /**
   * Compress image untuk upload
   * @param {string} dataUrl - Image data URL
   * @param {number} maxWidth - Max width dalam pixels
   * @param {number} quality - Quality 0-1
   * @returns {Promise<string>} Compressed data URL
   */
  async compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  },

  // ===== UI HELPERS =====

  /**
   * Tampilkan loading spinner
   */
  showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span>Memuat...</span>
        </div>
      `;
    }
  },

  /**
   * Sembunyikan loading
   */
  hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      const spinner = element.querySelector('.loading-spinner');
      if (spinner) spinner.remove();
    }
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function
   */
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // ===== STORAGE HELPERS =====

  /**
   * Save to localStorage dengan error handling
   */
  saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Save to storage error:', err);
      return false;
    }
  },

  /**
   * Load dari localStorage
   */
  loadFromStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      console.error('Load from storage error:', err);
      return defaultValue;
    }
  },

  /**
   * Hapus dari localStorage
   */
  removeFromStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error('Remove from storage error:', err);
      return false;
    }
  }
};