/**
 * AsaWatch Charts Service
 * Menggunakan Chart.js untuk visualisasi data kesehatan
 */

class AsaWatchCharts {
  constructor() {
    this.chartInstances = {};
    this.defaultColors = {
      gulaDarah: { border: '#2fa360', background: 'rgba(47, 163, 96, 0.14)' },
      detakJantung: { border: '#e5484d', background: 'rgba(229, 72, 77, 0.12)' },
      sistolik: { border: '#3d82f6', background: 'rgba(61, 130, 246, 0.12)' },
      diastolik: { border: '#f0a132', background: 'rgba(240, 161, 50, 0.12)' },
      spo2: { border: '#8b6cf0', background: 'rgba(139, 108, 240, 0.12)' }
    };
  }

  // Render grafik multi-line untuk satu sesi
  renderSessionChart(canvasId, samples, metrics = ['gulaDarah', 'detakJantung']) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error('Canvas not found:', canvasId);
      return;
    }

    // Destroy existing chart if any
    if (this.chartInstances[canvasId]) {
      this.chartInstances[canvasId].destroy();
    }

    // Prepare data
    const labels = samples.map(s => this.formatTime(s.detikRelatifT0));
    const datasets = [];

    metrics.forEach(metric => {
      const data = samples.map(s => s[metric] || null);
      const colors = this.defaultColors[metric] || { border: '#333', background: 'rgba(51,51,51,0.2)' };
      const name = this.getMetricName(metric);

      datasets.push({
        label: name,
        data: data,
        borderColor: colors.border,
        backgroundColor: colors.background,
        borderWidth: 2,
        tension: 0.4,
        fill: true
      });
    });

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            position: 'left',
          },
          x: {
            title: {
              display: true,
              text: 'Waktu'
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        }
      }
    });
  }

  // Render grafik ringkasan untuk multiple sesi
  renderSummaryChart(canvasId, sessions) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this.chartInstances[canvasId]) {
      this.chartInstances[canvasId].destroy();
    }

    // Group by date and calculate averages
    const dailyData = this.aggregateByDate(sessions);
    const labels = Object.keys(dailyData).sort();

    const datasets = [
      {
        label: 'Rata-rata Gula Darah',
        data: labels.map(date => dailyData[date].avgGula || null),
        borderColor: this.defaultColors.gulaDarah.border,
        backgroundColor: this.defaultColors.gulaDarah.background,
        yAxisID: 'gula'
      },
      {
        label: 'Rata-rata Detak Jantung',
        data: labels.map(date => dailyData[date].avgDetak || null),
        borderColor: this.defaultColors.detakJantung.border,
        backgroundColor: this.defaultColors.detakJantung.background,
        yAxisID: 'detak'
      }
    ];

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        scales: {
          gula: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Gula Darah (mg/dL)' }
          },
          detak: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Detak Jantung (bpm)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  // Render grafik pie untuk distribusi status sesi
  renderStatusDistribution(canvasId, sessions) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this.chartInstances[canvasId]) {
      this.chartInstances[canvasId].destroy();
    }

    const statusCount = {
      selesai: 0,
      tidak_lengkap: 0,
      dibatalkan: 0,
      draft: 0
    };

    sessions.forEach(session => {
      if (statusCount.hasOwnProperty(session.status)) {
        statusCount[session.status]++;
      }
    });

    const statusLabels = {
      selesai: 'Selesai',
      tidak_lengkap: 'Tidak Lengkap',
      dibatalkan: 'Dibatalkan',
      draft: 'Draft'
    };

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.values(statusLabels),
        datasets: [{
          data: Object.values(statusCount),
          backgroundColor: [
            '#2ecc71', // selesai - green
            '#f39c12', // tidak_lengkap - yellow
            '#e74c3c', // dibatalkan - red
            '#95a5a6'  // draft - gray
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top'
          }
        }
      }
    });
  }

  // Helper: format waktu dari detik
  formatTime(detik) {
    if (detik === 0) return 'Baseline';

    const jam = Math.floor(detik / 3600);
    const menit = Math.floor((detik % 3600) / 60);

    if (jam === 0) return `${menit}m`;
    return `${jam}h ${menit}m`;
  }

  // Helper: dapatkan nama metrik dalam bahasa Indonesia
  getMetricName(metric) {
    const names = {
      gulaDarah: 'Gula Darah (mg/dL)',
      detakJantung: 'Detak Jantung (bpm)',
      sistolik: 'Sistolik (mmHg)',
      diastolik: 'Diastolik (mmHg)',
      spo2: 'SpO2 (%)'
    };
    return names[metric] || metric;
  }

  // Helper: aggregate data by date
  aggregateByDate(sessions) {
    const result = {};

    sessions.forEach(session => {
      if (!session.createdAt) return;

      const date = session.createdAt.split('T')[0]; // YYYY-MM-DD
      if (!result[date]) {
        result[date] = {
          totalGula: 0,
          countGula: 0,
          totalDetak: 0,
          countDetak: 0
        };
      }

      // We need samples to calculate averages, but we don't have them here
      // This is a placeholder - you'll need to pass samples or pre-aggregate
    });

    // Calculate averages
    Object.keys(result).forEach(date => {
      result[date].avgGula = result[date].countGula > 0
        ? Math.round(result[date].totalGula / result[date].countGula)
        : null;
      result[date].avgDetak = result[date].countDetak > 0
        ? Math.round(result[date].totalDetak / result[date].countDetak)
        : null;
    });

    return result;
  }

  // Destroy all charts (cleanup)
  destroyAll() {
    Object.values(this.chartInstances).forEach(chart => {
      if (chart && chart.destroy) {
        chart.destroy();
      }
    });
    this.chartInstances = {};
  }
}

// Export singleton
window.charts = new AsaWatchCharts();