/** Gráficos con Chart.js, usando los colores de los tokens CSS (claro/oscuro). */
import { loadLib } from '../util/libs.js';
import { money } from '../util/format.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function baseOptions(Chart) {
  Chart.defaults.font.family = css('--font');
  Chart.defaults.color = css('--text-3');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduced() ? false : { duration: 700, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--brand-navy'), titleColor: '#fff', bodyColor: '#fff',
        padding: 10, cornerRadius: 10, displayColors: true, boxPadding: 4
      }
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { grid: { color: css('--chart-grid') }, border: { display: false }, beginAtZero: true, ticks: { maxTicksLimit: 4 } }
    }
  };
}

/** Barras apiladas: visitas + químicos. */
export async function incomeChart(canvas, data) {
  const Chart = await loadLib('chart');
  const opts = baseOptions(Chart);
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  opts.scales.y.ticks.precision = 0;
  opts.scales.y.suggestedMax = 1000;
  opts.scales.y.ticks.callback = (v) => (v >= 1000 ? `$ ${Math.round(v / 1000)}k` : `$ ${Math.round(v)}`);
  opts.plugins.tooltip.callbacks = { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.label),
      datasets: [
        { label: 'Visitas', data: data.map((d) => d.visitas), backgroundColor: css('--chart-1'), borderRadius: 6, maxBarThickness: 28 },
        { label: 'Químicos', data: data.map((d) => d.ventas), backgroundColor: css('--chart-2'), borderRadius: 6, maxBarThickness: 28 }
      ]
    },
    options: opts
  });
}

/** Evolución de un parámetro químico con banda de rango objetivo. */
export async function chemChart(canvas, points, range, label) {
  const Chart = await loadLib('chart');
  const opts = baseOptions(Chart);
  opts.scales.y.beginAtZero = false;
  const [min, max] = range;
  const vals = points.map((p) => p.y);
  opts.scales.y.suggestedMin = Math.min(min, ...vals) - (max - min) * 0.5;
  opts.scales.y.suggestedMax = Math.max(max, ...vals) + (max - min) * 0.5;
  const band = {
    id: 'band',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const top = scales.y.getPixelForValue(max);
      const bottom = scales.y.getPixelForValue(min);
      ctx.save();
      ctx.fillStyle = css('--ok-soft');
      ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
      ctx.restore();
    }
  };
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map((p) => p.x),
      datasets: [{
        label, data: vals, borderColor: css('--accent-strong'), backgroundColor: css('--accent-strong'),
        tension: 0.3, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5
      }]
    },
    options: opts,
    plugins: [band]
  });
}
