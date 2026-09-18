/**
 * AsaWatch IndexedDB Database Service
 * Menggantikan SQLite/Drift untuk web app
 */

const DB_NAME = 'asawatch_db';
const DB_VERSION = 1;
const STORES = {
  SESSIONS: 'sesi_makan',
  SAMPLES: 'sampel',
  USER_PROFILE: 'profil',
  PENDING_SYNC: 'pending_sync',
  ANCHORS: 'anchor_waktu',
};

class DatabaseService {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store untuk sesi makan
        if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
          const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'sesiId' });
          sessionStore.createIndex('status', 'status', { unique: false });
          sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Store untuk sampel kesehatan
        if (!db.objectStoreNames.contains(STORES.SAMPLES)) {
          const sampleStore = db.createObjectStore(STORES.SAMPLES, { keyPath: ['sesiId', 'index'] });
          sampleStore.createIndex('sesiId', 'sesiId', { unique: false });
        }

        // Store untuk profil pengguna
        if (!db.objectStoreNames.contains(STORES.USER_PROFILE)) {
          db.createObjectStore(STORES.USER_PROFILE, { keyPath: 'userId' });
        }

        // Store untuk data yang belum sinkron ke server
        if (!db.objectStoreNames.contains(STORES.PENDING_SYNC)) {
          db.createObjectStore(STORES.PENDING_SYNC, { keyPath: 'id', autoIncrement: true });
        }

        // Store untuk anchor waktu
        if (!db.objectStoreNames.contains(STORES.ANCHORS)) {
          db.createObjectStore(STORES.ANCHORS, { keyPath: 'bootId' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // ===== SESSION METHODS =====

  async createSession(sesiId, data = {}) {
    const session = {
      sesiId,
      status: 'draft', // draft, armed, running, selesai, tidak_lengkap, dibatalkan
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      t0: null, // waktu tombol ditekan
      fotoPath: null,
      fotoMakan: null, // base64 atau URL foto makanan
      // Metadata dari server (jika ada)
      serverSynced: false,
      ...data
    };

    await this._put(STORES.SESSIONS, session);
    return session;
  }

  async getSession(sesiId) {
    return await this._get(STORES.SESSIONS, sesiId);
  }

  async getAllSessions() {
    return await this._getAll(STORES.SESSIONS);
  }

  async getSessionsByStatus(status) {
    return await this._getByIndex(STORES.SESSIONS, 'status', status);
  }

  async updateSession(sesiId, updates) {
    const session = await this.getSession(sesiId);
    if (!session) throw new Error(`Session ${sesiId} not found`);

    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
    await this._put(STORES.SESSIONS, session);
    return session;
  }

  async deleteSession(sesiId) {
    // Hapus semua sampel yang terkait
    const samples = await this.getSamplesBySession(sesiId);
    for (const sample of samples) {
      await this._delete(STORES.SAMPLES, [sesiId, sample.index]);
    }

    // Hapus sesi
    await this._delete(STORES.SESSIONS, sesiId);
  }

  // ===== SAMPLE METHODS =====

  async saveSample(sesiId, index, data) {
    const sample = {
      sesiId,
      index,
      gulaDarah: data.gulaDarah || null,
      detakJantung: data.detakJantung || null,
      sistolik: data.sistolik || null,
      diastolik: data.diastolik || null,
      spo2: data.spo2 || null,
      detikRelatifT0: data.detikRelatifT0 || 0,
      dariBuffer: data.dariBuffer || false,
      status: data.status || 'terisi', // terisi, menunggu, terlewat, gagal
      receivedAt: new Date().toISOString()
    };

    await this._put(STORES.SAMPLES, sample);
    return sample;
  }

  async getSample(sesiId, index) {
    return await this._get(STORES.SAMPLES, [sesiId, index]);
  }

  async getSamplesBySession(sesiId) {
    return await this._getByIndex(STORES.SAMPLES, 'sesiId', sesiId);
  }

  async deleteSample(sesiId, index) {
    await this._delete(STORES.SAMPLES, [sesiId, index]);
  }

  // ===== USER PROFILE METHODS =====

  async saveProfile(userId, profileData) {
    const profile = {
      userId,
      nama: profileData.nama,
      email: profileData.email,
      tanggalLahir: profileData.tanggalLahir,
      tinggiBadan: profileData.tinggiBadan,
      beratBadan: profileData.beratBadan,
      updatedAt: new Date().toISOString()
    };

    await this._put(STORES.USER_PROFILE, profile);
    return profile;
  }

  async getProfile(userId) {
    return await this._get(STORES.USER_PROFILE, userId);
  }

  // ===== ANCHOR METHODS =====

  async saveAnchor(bootId, uptimeS, epoch) {
    const anchor = {
      bootId,
      uptimeS,
      epoch,
      savedAt: new Date().toISOString()
    };

    await this._put(STORES.ANCHORS, anchor);
    return anchor;
  }

  async getLatestAnchor(bootId) {
    return await this._get(STORES.ANCHORS, bootId);
  }

  // ===== PENDING SYNC METHODS =====

  async addToPendingSync(type, data) {
    const pendingItem = {
      type,
      data,
      createdAt: new Date().toISOString(),
      synced: false
    };

    return await this._add(STORES.PENDING_SYNC, pendingItem);
  }

  async getPendingSyncItems() {
    return await this._getAll(STORES.PENDING_SYNC);
  }

  async markAsSynced(id) {
    await this._put(STORES.PENDING_SYNC, { id, synced: true });
  }

  async clearSyncedItems() {
    const items = await this.getPendingSyncItems();
    const synced = items.filter(item => item.synced);
    for (const item of synced) {
      await this._delete(STORES.PENDING_SYNC, item.id);
    }
  }

  // ===== GENERIC HELPERS =====

  async _put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async _add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Utility: generate UUID
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
window.db = new DatabaseService();