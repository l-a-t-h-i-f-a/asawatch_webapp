/**
 * AsaWatch Notifications Service
 * Menggunakan Web Notifications API untuk reminder dan alert
 */

class AsaWatchNotifications {
  constructor() {
    this.permission = Notification.permission;
    this.scheduledReminders = new Map();
  }

  // Minta izin notifikasi
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('Browser tidak mendukung notifikasi');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    }

    return false;
  }

  // Kirim notifikasi
  send(title, options = {}) {
    if (this.permission !== 'granted') {
      console.warn('Izin notifikasi belum diberikan');
      return null;
    }

    const defaultOptions = {
      icon: '/assets/logo/logo2.jpeg',
      badge: '/assets/logo/logo2.jpeg',
      vibrate: [200, 100, 200],
      tag: 'asawatch-notification',
      renotify: true,
      ...options
    };

    try {
      const notification = new Notification(title, defaultOptions);

      notification.onclick = () => {
        window.focus();
        notification.close();

        if (options.onClick) {
          options.onClick();
        }
      };

      // Auto close setelah 10 detik
      setTimeout(() => {
        notification.close();
      }, 10000);

      return notification;
    } catch (err) {
      console.error('Send notification error:', err);
      return null;
    }
  }

  // Jadwalkan reminder untuk sesi makan
  scheduleSessionReminder(sesiId, waktuReminder, message) {
    const now = new Date().getTime();
    const reminderTime = new Date(waktuReminder).getTime();
    const delay = reminderTime - now;

    if (delay <= 0) {
      console.warn('Waktu reminder sudah lewat');
      return false;
    }

    const reminderId = setTimeout(() => {
      this.send('Pengingat Sesi Makan', {
        body: message,
        tag: `session-reminder-${sesiId}`,
        data: { sesiId, type: 'session_reminder' }
      });

      this.scheduledReminders.delete(sesiId);
    }, delay);

    this.scheduledReminders.set(sesiId, {
      timeoutId: reminderId,
      waktu: waktuReminder,
      message
    });

    return true;
  }

  // Batalkan reminder
  cancelReminder(sesiId) {
    const reminder = this.scheduledReminders.get(sesiId);
    if (reminder) {
      clearTimeout(reminder.timeoutId);
      this.scheduledReminders.delete(sesiId);
      return true;
    }
    return false;
  }

  // Kirim notifikasi pengukuran selesai
  sendMeasurementComplete(metricName, value, unit) {
    this.send('Pengukuran Selesai', {
      body: `${metricName}: ${value} ${unit}`,
      tag: 'measurement-complete',
      data: { type: 'measurement', metric: metricName, value, unit }
    });
  }

  // Kirim notifikasi baterai rendah
  sendBatteryLow(level) {
    this.send('Baterai Jam Rendah', {
      body: `Baterai AsaWatch tersisa ${level}%. Segera isi daya.`,
      tag: 'battery-low',
      requireInteraction: true,
      data: { type: 'battery', level }
    });
  }

  // Kirim notifikasi sesi selesai
  sendSessionComplete(sesiId, status) {
    const statusText = status === 'selesai' ? 'berhasil' : 'tidak lengkap';

    this.send('Sesi Selesai', {
      body: `Sesi makan ${statusText}. Ketuk untuk melihat analisis.`,
      tag: `session-complete-${sesiId}`,
      data: { sesiId, type: 'session_complete', status }
    });
  }

  // Kirim notifikasi sinkronisasi
  sendSyncComplete(itemCount) {
    this.send('Sinkronisasi Selesai', {
      body: `${itemCount} data berhasil disinkronkan ke server.`,
      tag: 'sync-complete',
      data: { type: 'sync', count: itemCount }
    });
  }

  // Kirim peringatan kesehatan
  sendHealthAlert(metric, value, threshold, condition) {
    let message;
    if (condition === 'high') {
      message = `${metric} Anda tinggi: ${value}. Batas normal: ${threshold}`;
    } else {
      message = `${metric} Anda rendah: ${value}. Batas normal: ${threshold}`;
    }

    this.send('Peringatan Kesehatan', {
      body: message,
      tag: `health-alert-${metric.toLowerCase()}`,
      requireInteraction: true,
      data: { type: 'health_alert', metric, value, threshold, condition }
    });
  }

  // Get semua reminder yang dijadwalkan
  getScheduledReminders() {
    const reminders = [];
    this.scheduledReminders.forEach((value, key) => {
      reminders.push({
        sesiId: key,
        waktu: value.waktu,
        message: value.message
      });
    });
    return reminders;
  }

  // Clear semua reminders
  clearAllReminders() {
    this.scheduledReminders.forEach((value, key) => {
      clearTimeout(value.timeoutId);
    });
    this.scheduledReminders.clear();
  }

  // Check support
  static isSupported() {
    return 'Notification' in window;
  }
}

// Export singleton
window.notifications = new AsaWatchNotifications();