/**
 * AsaWatch Web Bluetooth Service
 * Wrapper untuk Web Bluetooth API agar mirip interface BleService di Flutter
 *
 * KETERBATASAN:
 * - Hanya Chrome/Edge (desktop & Android)
 * - Perlu HTTPS di produksi
 * - User harus klik tombol connect setiap buka app
 * - Smartwatch harus advertise service UUID
 */

// ===== KONSTANTA PROTOCOL (mirip protokol_jam.dart) =====
const PROTOCOL = {
  // Service UUID - HARUS SAMA dengan firmware smartwatch
  SERVICE_UUID: '0000fff0-0000-1000-8000-00805f9b34fb', // GANTI dengan UUID asli

  // Characteristic UUIDs
  CHAR_TX_UUID: '0000fff1-0000-1000-8000-00805f9b34fb', // App -> Watch (write)
  CHAR_RX_UUID: '0000fff2-0000-1000-8000-00805f9b34fb', // Watch -> App (notify)
  CHAR_STATUS_UUID: '0000fff3-0000-1000-8000-00805f9b34fb', // Status (notify)

  // OpCodes (dari protokol_jam.dart)
  OPCODE: {
    ANCHOR_WAKTU: 0x01,
    SAMBUNG: 0x02,
    PUTUSKAN: 0x03,
    SET_KALIBRASI: 0x04,
    UKUR: 0x05,
    UKUR_SEKARANG: 0x06,
    ARM_SESI: 0x07,
    BATALKAN_SESI: 0x08,
    MULAI_SESI: 0x09,
    ARM_TITIK: 0x0A,
    TANYA_STATUS: 0x0B,
    TANYA_KEMAMPUAN: 0x0C,
  },

  // Status Sesu
  STATUS_SESI: {
    DRAFT: 0,
    ARMED: 1,
    RUNNING: 2,
    SELESAI: 3,
    TIDAK_LENGKAP: 4,
    DIBATALKAN: 5,
  },

  // Status Sampel
  STATUS_SAMPEL: {
    TERISI: 0,
    MENUNGGU: 1,
    TERLEWAT: 2,
    GAGAL: 3,
  },

  // Kemampuan Perangkat (bitmask)
  KEMAMPUAN: {
    GULA_DARAH: 1 << 0,
    DETAK_JANTUNG: 1 << 1,
    TEKANAN_DARAH: 1 << 2,
    SPO2: 1 << 3,
  }
};

// ===== EVENT EMITTER SIMPLE =====
class EventEmitter {
  constructor() {
    this.events = {};
  }
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }
  emit(event, ...args) {
    if (!this.events[event]) return;
    this.events[event].forEach(cb => cb(...args));
  }
}

// ===== MAIN CLASS =====
class AsaWatchBluetooth extends EventEmitter {
  constructor() {
    super();
    this.device = null;
    this.server = null;
    this.service = null;
    this.txChar = null;
    this.rxChar = null;
    this.statusChar = null;
    this.isConnected = false;
    this.pendingRequests = new Map(); // requestId -> {resolve, reject, timeout}
    this.requestId = 0;
    this.buffer = new Uint8Array(0);
    this.expectedResponses = new Map(); // sesiId -> [expected indices]
    this.currentSessionId = null;
    this.capabilities = null;
    this.batteryLevel = null;
    this.batteryCritical = false;
    this.isMeasuring = false;
    this.measureProgress = null;
    this._onDisconnected = this._onDisconnected.bind(this);
  }

  // ===== CONNECTION =====

  async requestDevice() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API tidak didukung browser ini. Gunakan Chrome/Edge.');
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [PROTOCOL.SERVICE_UUID] },
          // Fallback: filter by name prefix if UUID not in advertisement
          // { namePrefix: 'AsaWatch' }
        ],
        optionalServices: [PROTOCOL.SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', this._onDisconnected);
      this.emit('deviceSelected', this.device);
      return this.device;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        throw new Error('Tidak menemukan AsaWatch. Pastikan jam menyala dan dalam jangkauan.');
      }
      throw err;
    }
  }

  async connect() {
    if (!this.device) await this.requestDevice();

    try {
      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService(PROTOCOL.SERVICE_UUID);

      // Get characteristics
      this.txChar = await this.service.getCharacteristic(PROTOCOL.CHAR_TX_UUID);
      this.rxChar = await this.service.getCharacteristic(PROTOCOL.CHAR_RX_UUID);
      this.statusChar = await this.service.getCharacteristic(PROTOCOL.CHAR_STATUS_UUID);

      // Start notifications
      await this.rxChar.startNotifications();
      this.rxChar.addEventListener('characteristicvaluechanged', this._onRxValue.bind(this));

      await this.statusChar.startNotifications();
      this.statusChar.addEventListener('characteristicvaluechanged', this._onStatusValue.bind(this));

      this.isConnected = true;
      this.emit('connected');

      // Handshake bersifat best-effort. Sebagian firmware tidak mengirim ACK,
      // dan itu tidak boleh menggagalkan koneksi GATT yang sudah terbentuk.
      this.requestCapabilities().catch(err => this.emit('handshakeWarning', err));
      this.sendAnchorWaktu().catch(err => this.emit('handshakeWarning', err));

      return true;
    } catch (err) {
      this.isConnected = false;
      this.emit('error', err);
      throw err;
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this._cleanup();
  }

  _onDisconnected() {
    this.isConnected = false;
    this._cleanup();
    this.emit('disconnected');
  }

  _cleanup() {
    if (this.rxChar) {
      this.rxChar.removeEventListener('characteristicvaluechanged', this._onRxValue.bind(this));
    }
    if (this.statusChar) {
      this.statusChar.removeEventListener('characteristicvaluechanged', this._onStatusValue.bind(this));
    }
    this.server = null;
    this.service = null;
    this.txChar = null;
    this.rxChar = null;
    this.statusChar = null;
    this.buffer = new Uint8Array(0);
  }

  // ===== DATA HANDLING =====

  _onRxValue(event) {
    const value = new Uint8Array(event.target.value.buffer);
    this._processIncomingData(value);
  }

  _processIncomingData(data) {
    // Append to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    // Process complete packets
    while (this.buffer.length >= 3) {
      const length = this.buffer[1] | (this.buffer[2] << 8);
      const totalLength = 3 + length + 1; // header(3) + payload + checksum(1)

      if (this.buffer.length >= totalLength) {
        const packet = this.buffer.slice(0, totalLength);
        this.buffer = this.buffer.slice(totalLength);
        this._handlePacket(packet);
      } else {
        break; // Wait for more data
      }
    }
  }

  _handlePacket(packet) {
    // Verify checksum
    let checksum = 0;
    for (let i = 0; i < packet.length - 1; i++) {
      checksum ^= packet[i];
    }
    if (checksum !== packet[packet.length - 1]) {
      console.warn('Checksum mismatch', packet);
      return;
    }

    const opcode = packet[0];
    const payload = packet.slice(3, packet.length - 1);

    // Handle response to pending request
    if (opcode === PROTOCOL.OPCODE.SAMBUNG || opcode === 0x80) { // Response opcode
      const requestId = payload[0];
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        if (payload[1] === 0) {
          pending.resolve(payload.slice(2));
        } else {
          pending.reject(new Error(`Device error: ${payload[1]}`));
        }
      }
      return;
    }

    // Handle unsolicited notifications
    switch (opcode) {
      case 0x10: // Sampel data
        this._handleSampel(payload);
        break;
      case 0x11: // Status sesi
        this._handleStatusSesi(payload);
        break;
      case 0x12: // Kemampuan
        this._handleKemampuan(payload);
        break;
      case 0x13: // Status baterai
        this._handleBattery(payload);
        break;
      case 0x14: // Progress ukur
        this._handleMeasureProgress(payload);
        break;
      case 0x15: // T0 confirmed
        this._handleT0Confirmed(payload);
        break;
      default:
        console.log('Unknown opcode:', opcode.toString(16), payload);
    }
  }

  _handleSampel(payload) {
    // Parse: sesiId(16) + index(2) + detikRelatifT0(4) + metrics...
    // Format sesuai protokol_jam.dart
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let offset = 0;

    const sesiIdBytes = payload.slice(0, 16);
    const sesiId = this._bytesToUuid(sesiIdBytes);
    const index = view.getUint16(16, true);
    const detikRelatifT0 = view.getInt32(18, true);

    // Parse metrics (each 2 bytes, int16, scale 0.01)
    const metrics = {};
    const metricNames = ['gulaDarah', 'detakJantung', 'sistolik', 'diastolik', 'spo2'];
    let metricOffset = 22;

    metricNames.forEach((name, i) => {
      if (metricOffset + 2 <= payload.length) {
        const raw = view.getInt16(metricOffset, true);
        metrics[name] = raw === -1 ? null : raw / 100;
        metricOffset += 2;
      }
    });

    const sampel = {
      sesiId,
      index,
      detikRelatifT0,
      ...metrics,
      status: PROTOCOL.STATUS_SAMPEL.TERISI,
      receivedAt: Date.now()
    };

    this.emit('sampel', sampel);

    // Check if this completes expected responses
    this._checkExpectedResponse(sesiId, index);
  }

  _handleStatusSesi(payload) {
    const status = payload[0];
    const sesiId = this._bytesToUuid(payload.slice(1, 17));
    this.emit('statusSesi', { sesiId, status });
  }

  _handleKemampuan(payload) {
    const caps = payload[0] | (payload[1] << 8);
    this.capabilities = {
      gulaDarah: !!(caps & PROTOCOL.KEMAMPUAN.GULA_DARAH),
      detakJantung: !!(caps & PROTOCOL.KEMAMPUAN.DETAK_JANTUNG),
      tekananDarah: !!(caps & PROTOCOL.KEMAMPUAN.TEKANAN_DARAH),
      spo2: !!(caps & PROTOCOL.KEMAMPUAN.SPO2),
    };
    this.emit('kemampuan', this.capabilities);
  }

  _handleBattery(payload) {
    this.batteryLevel = payload[0];
    this.batteryCritical = !!(payload[1] & 0x04); // bit 2
    this.emit('battery', { level: this.batteryLevel, critical: this.batteryCritical });
  }

  _handleMeasureProgress(payload) {
    // payload: persen(1) + sisaDetik(2) + status(1)
    this.measureProgress = {
      persen: payload[0],
      sisaDetik: payload[1] | (payload[2] << 8),
      status: payload[3] // 0=measuring, 1=done, 2=failed
    };
    this.isMeasuring = this.measureProgress.status === 0;
    this.emit('measureProgress', this.measureProgress);
  }

  _handleT0Confirmed(payload) {
    const sesiId = this._bytesToUuid(payload.slice(0, 16));
    const t0Uptime = payload[16] | (payload[17] << 8) | (payload[18] << 16) | (payload[19] << 24);
    const bootId = payload[20] | (payload[21] << 8) | (payload[22] << 16) | (payload[23] << 24);
    this.emit('t0Confirmed', { sesiId, t0Uptime, bootId });
  }

  _checkExpectedResponse(sesiId, index) {
    const expected = this.expectedResponses.get(sesiId);
    if (expected) {
      const idx = expected.indexOf(index);
      if (idx >= 0) {
        expected.splice(idx, 1);
        if (expected.length === 0) {
          this.expectedResponses.delete(sesiId);
          this.emit('sessionComplete', sesiId);
        }
      }
    }
  }

  // ===== COMMAND SENDING =====

  _sendCommand(opcode, payload = new Uint8Array(0)) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.txChar) {
        reject(new Error('Tidak terhubung ke jam'));
        return;
      }

      const requestId = ++this.requestId;
      const length = payload.length;
      const packet = new Uint8Array(3 + length + 1);

      packet[0] = opcode;
      packet[1] = length & 0xFF;
      packet[2] = (length >> 8) & 0xFF;
      packet.set(payload, 3);

      // Checksum
      let checksum = 0;
      for (let i = 0; i < packet.length - 1; i++) {
        checksum ^= packet[i];
      }
      packet[packet.length - 1] = checksum;

      // Timeout 10 detik
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timeout menunggu respons jam'));
      }, 10000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      this.txChar.writeValueWithResponse(packet).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(err);
      });
    });
  }

  // ===== HIGH-LEVEL COMMANDS =====

  async sendAnchorWaktu() {
    const now = Date.now();
    const anchor = new Uint8Array(8);
    const view = new DataView(anchor.buffer);
    view.setBigUint64(0, BigInt(now), true); // little endian
    return this._sendCommand(PROTOCOL.OPCODE.ANCHOR_WAKTU, anchor);
  }

  async requestCapabilities() {
    return this._sendCommand(PROTOCOL.OPCODE.TANYA_KEMAMPUAN);
  }

  async armSession(sesiId, jadwal) {
    // sesiId: 16 bytes UUID
    // jadwal: array of 4 uint32 (detik dari t0)
    const payload = new Uint8Array(16 + 4 * 4);
    payload.set(this._uuidToBytes(sesiId), 0);
    const view = new DataView(payload.buffer, 16);
    jadwal.forEach((detik, i) => view.setUint32(i * 4, detik, true));
    return this._sendCommand(PROTOCOL.OPCODE.ARM_SESI, payload);
  }

  async startSession(sesiId) {
    const payload = this._uuidToBytes(sesiId);
    return this._sendCommand(PROTOCOL.OPCODE.MULAI_SESI, payload);
  }

  async armTitik(sesiId, index, targetDetik, toleranceDetik) {
    const payload = new Uint8Array(16 + 1 + 4 + 2);
    payload.set(this._uuidToBytes(sesiId), 0);
    payload[16] = index;
    const view = new DataView(payload.buffer, 17);
    view.setUint32(0, targetDetik, true);
    view.setUint16(4, toleranceDetik, true);
    return this._sendCommand(PROTOCOL.OPCODE.ARM_TITIK, payload);
  }

  async cancelSession(sesiId) {
    const payload = this._uuidToBytes(sesiId);
    return this._sendCommand(PROTOCOL.OPCODE.BATALKAN_SESI, payload);
  }

  async measureNow() {
    return this._sendCommand(PROTOCOL.OPCODE.UKUR_SEKARANG);
  }

  async setCalibration(sistolikOffset, diastolikOffset, sisi) {
    const payload = new Uint8Array(2 + 2 + 1);
    const view = new DataView(payload.buffer);
    view.setInt16(0, Math.round(sistolikOffset * 100), true);
    view.setInt16(2, Math.round(diastolikOffset * 100), true);
    payload[4] = sisi; // 0=kiri, 1=kanan
    return this._sendCommand(PROTOCOL.OPCODE.SET_KALIBRASI, payload);
  }

  async requestStatus() {
    return this._sendCommand(PROTOCOL.OPCODE.TANYA_STATUS);
  }

  // Helper: expect specific samples for a session
  expectSamples(sesiId, indices) {
    this.expectedResponses.set(sesiId, [...indices]);
    this.currentSessionId = sesiId;
  }

  // ===== UTILITIES =====

  _uuidToBytes(uuid) {
    // Convert UUID string to 16 bytes
    const hex = uuid.replace(/-/g, '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  _bytesToUuid(bytes) {
    let hex = '';
    for (let i = 0; i < 16; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
  }
}

// ===== FAKE SERVICE UNTUK TESTING (tanpa hardware) =====
class FakeBleService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.percepatan = options.percepatan || 1;
    this.connected = false;
    this.currentSession = null;
    this.schedule = [];
  }

  async connect() {
    this.connected = true;
    // Simulate capabilities
    setTimeout(() => {
      this.emit('kemampuan', {
        gulaDarah: true,
        detakJantung: true,
        tekananDarah: true,
        spo2: true
      });
      this.emit('battery', { level: 85, critical: false });
    }, 100);
    return true;
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
  }

  async armSession(sesiId, jadwal) {
    this.currentSession = { sesiId, jadwal, status: 'armed' };
    this.schedule = jadwal;
    // Simulate auto-complete for testing
    if (this.percepatan > 1) {
      this._simulateSession();
    }
  }

  async startSession(sesiId) {
    if (this.currentSession) {
      this.currentSession.status = 'running';
      this.emit('t0Confirmed', { sesiId, t0Uptime: 1000, bootId: 1 });
    }
  }

  _simulateSession() {
    const indices = [0, 1, 2, 3];
    indices.forEach((idx, i) => {
      setTimeout(() => {
        const sampel = {
          sesiId: this.currentSession.sesiId,
          index: idx,
          detikRelatifT0: this.schedule[idx],
          gulaDarah: 90 + Math.random() * 30,
          detakJantung: 70 + Math.random() * 20,
          sistolik: 110 + Math.random() * 20,
          diastolik: 70 + Math.random() * 15,
          spo2: 96 + Math.random() * 3,
          status: 0
        };
        this.emit('sampel', sampel);

        if (idx === 3) {
          this.emit('statusSesi', { sesiId: this.currentSession.sesiId, status: 3 });
          this.emit('sessionComplete', this.currentSession.sesiId);
        }
      }, (this.schedule[idx] * 1000) / this.percepatan);
    });
  }

  async measureNow() {
    return { gulaDarah: 95, detakJantung: 72, sistolik: 118, diastolik: 76, spo2: 98 };
  }
}

// Export
window.AsaWatchBluetooth = AsaWatchBluetooth;
window.FakeBleService = FakeBleService;
window.PROTOCOL = PROTOCOL;