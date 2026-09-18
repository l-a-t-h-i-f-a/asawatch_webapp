/**
 * AsaWatch API Client
 * Menghubungkan dengan Laravel backend untuk auth dan sinkronisasi data
 */

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : '/api/v1'; // Relatif di produksi

class AsaWatchAPI {
  constructor() {
    this.token = localStorage.getItem('asawatch_token');
    this.user = JSON.parse(localStorage.getItem('asawatch_user') || 'null');
  }

  // ===== AUTH ENDPOINTS =====

  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/masuk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, kata_sandi: password })
      });

      const data = await response.json();

      if (response.ok && data.status === 'sukses') {
        this.token = data.data.token;
        this.user = data.data.profil;

        localStorage.setItem('asawatch_token', this.token);
        localStorage.setItem('asawatch_user', JSON.stringify(this.user));

        return { success: true, user: this.user };
      } else {
        throw new Error(data.galat?.pesan || 'Login gagal');
      }
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  }

  async register(nama, email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/daftar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, email, kata_sandi: password })
      });

      const data = await response.json();

      if (response.ok && data.status === 'sukses') {
        // Auto-login setelah register
        return await this.login(email, password);
      } else {
        throw new Error(data.galat?.pesan || 'Registrasi gagal');
      }
    } catch (err) {
      console.error('Register error:', err);
      throw err;
    }
  }

  async logout() {
    try {
      if (this.token) {
        await fetch(`${API_BASE_URL}/auth/keluar`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      this.token = null;
      this.user = null;
      localStorage.removeItem('asawatch_token');
      localStorage.removeItem('asawatch_user');
    }
  }

  async getProfile() {
    return await this._get('/auth/profil');
  }

  async updateProfile(profileData) {
    return await this._put('/auth/profil', profileData);
  }

  // ===== SESSION ENDPOINTS =====

  async createServerSession(sessionData) {
    return await this._post('/sesi', sessionData);
  }

  async syncSession(sesiId, localData) {
    return await this._post(`/sesi/${sesiId}/sinkron`, localData);
  }

  async getSessionFromServer(sesiId) {
    return await this._get(`/sesi/${sesiId}`);
  }

  async getAllSessionsFromServer() {
    return await this._get('/sesi');
  }

  async uploadPhoto(sesiId, photoFile) {
    const formData = new FormData();
    formData.append('foto', photoFile);

    try {
      const response = await fetch(`${API_BASE_URL}/sesi/${sesiId}/foto`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Upload photo error:', err);
      throw err;
    }
  }

  // ===== ANALYSIS ENDPOINTS =====

  async getAnalysis(sesiId) {
    return await this._get(`/sesi/${sesiId}/analisis`);
  }

  async getHealthSummary(days = 7) {
    return await this._get(`/kesehatan/ringkasan?hari=${days}`);
  }

  // ===== PRIVATE HELPERS =====

  async _get(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      return await this._handleResponse(response);
    } catch (err) {
      console.error(`GET ${endpoint} error:`, err);
      throw err;
    }
  }

  async _post(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(data)
      });

      return await this._handleResponse(response);
    } catch (err) {
      console.error(`POST ${endpoint} error:`, err);
      throw err;
    }
  }

  async _put(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(data)
      });

      return await this._handleResponse(response);
    } catch (err) {
      console.error(`PUT ${endpoint} error:`, err);
      throw err;
    }
  }

  async _handleResponse(response) {
    const data = await response.json();

    if (response.ok) {
      return data;
    } else if (response.status === 401) {
      // Token expired atau invalid
      this.token = null;
      localStorage.removeItem('asawatch_token');
      throw new Error('Sesi berakhir, silakan login kembali');
    } else {
      throw new Error(data.galat?.pesan || data.message || 'Terjadi kesalahan');
    }
  }

  // ===== OFFLINE SYNC =====

  async syncPendingData() {
    const pendingItems = await window.db.getPendingSyncItems();

    for (const item of pendingItems) {
      try {
        let result;
        switch (item.type) {
          case 'session':
            result = await this.syncSession(item.data.sesiId, item.data);
            break;
          case 'photo':
            result = await this.uploadPhoto(item.data.sesiId, item.data.photo);
            break;
          default:
            console.warn('Unknown sync type:', item.type);
        }

        if (result) {
          await window.db.markAsSynced(item.id);
        }
      } catch (err) {
        console.error('Sync failed for item:', item.id, err);
      }
    }

    // Hapus item yang sudah synced
    await window.db.clearSyncedItems();
  }
}

// Export singleton
window.api = new AsaWatchAPI();