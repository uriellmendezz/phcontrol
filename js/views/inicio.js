import { html, mount, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { quickActions, emptyState } from '../ui/components.js';
import { get, all } from '../data/store.js';
import { settings } from '../data/settings.js';
import { upcoming } from '../domain/agenda.js';
import { periodRange, totals, delta, series, debts, PERIODOS } from '../domain/stats.js';
import { forecast, describe, dayFor } from '../domain/weather.js';
import { computeAlerts } from '../domain/alerts.js';
import { incomeChart } from '../ui/charts.js';
import { greeting, longDate, today, relDay, fullName, money, dayShort, fdatetime, capFirst } from '../util/format.js';
import { isConfigured } from '../data/api.js';

let periodo = 'mes';

export default async function inicio(root, ctx) {
  let chart = null;
  let fc = null;
  let fcError = '';
  const cfg = () => settings();

  async function loadWeather() {
    try { fc = await forecast(cfg().clima.lat, cfg().clima.lng); fcError = ''; }
    catch (e) { fcError = e.message; }
  }

  function render() {
    const t = today();
    const prox = upcoming(Number(cfg().alertas.proximos_dias) || 7);
    const hoy = all('agenda').filter((a) => a.fecha === t && (a.estado === 'pendiente' || a.estado === 'reprogramada'));
    const alerts = computeAlerts(cfg(), fc);
    const hasData = all('clientes').length > 0;

    mount(root, html`
      <section class="hero" aria-label="Resumen del día">
        <div class="hero-inner">
          <p class="hero-kicker">${capFirst(longDate(t))}</p>
          <h1 class="hero-title">${greeting()}${cfg().negocio.titular ? `, ${cfg().negocio.titular.split(' ')[0]}` : ''}</h1>
          <p class="hero-sub">${hoy.length ? `Hoy tenés ${hoy.length} visita${hoy.length > 1 ? 's' : ''}.` : 'Hoy no tenés visitas agendadas.'}</p>
        </div>
      </section>

      ${!isConfigured() ? html`<a class="alert warn" href="#/ajustes" style="margin-top:16px;text-decoration:none;color:inherit">${icon('cloud')}<div><p class="alert-title">Conectá tu Google Sheets</p><p>Tus datos se guardan en el teléfono. Configurá la conexión en Ajustes para tener respaldo.</p></div></a>` : ''}

      <section class="section" aria-labelledby="h-prox">
        <div class="section-head"><h2 class="section-title" id="h-prox">Próximos destinos</h2><a class="section-link" href="#/calendario">Ver agenda</a></div>
        ${prox.length ? html`<div class="dest-scroller">${prox.slice(0, 8).map((a) => destCard(a))}</div>`
          : emptyState({ ic: 'calendar', title: 'Sin visitas próximas', text: hasData ? 'Agendá la próxima visita para verla acá.' : 'Empezá cargando tu primer cliente.', action: hasData ? { label: 'Programar visita', href: '#/agenda/nueva', icon: 'plus' } : { label: 'Nuevo cliente', href: '#/clientes/nuevo', icon: 'plus' } })}
      </section>

      ${alerts.length ? html`<section class="section" aria-labelledby="h-alertas">
        <div class="section-head"><h2 class="section-title" id="h-alertas">Atención</h2></div>
        <div class="stack">${alerts.map((a) => html`<a class="alert ${a.level} alert-link" href="${a.href}">${icon(a.ic)}<div class="grow"><p class="alert-title">${a.title}</p><p>${a.text}</p></div>${icon('chevron', 'li-chevron')}</a>`)}</div>
      </section>` : ''}

      <section class="section" aria-labelledby="h-clima">
        <div class="section-head"><h2 class="section-title" id="h-clima">Clima · ${cfg().clima.ciudad}</h2>
          ${fc?.stale ? html`<span class="badge">Guardado ${fdatetime(new Date(fc.fetchedAt).toISOString())}</span>` : ''}</div>
        ${fc ? weatherStrip(fc) : fcError ? html`<div class="card card-soft small muted">${icon('wifiOff')} ${fcError}</div>` : html`<div class="skeleton" style="height:112px"></div>`}
      </section>

      <section class="section" aria-labelledby="h-ing">
        <div class="section-head"><h2 class="section-title" id="h-ing">Ingresos</h2><a class="section-link" href="#/ventas/nueva">Registrar venta</a></div>
        <div class="segmented" role="group" aria-label="Período">
          ${Object.entries(PERIODOS).map(([k, l]) => html`<button type="button" data-periodo="${k}" aria-pressed="${k === periodo}">${l}</button>`)}
        </div>
        ${incomeBlock()}
      </section>
    `);
    drawChart();
  }

  function destCard(a) {
    const c = get('clientes', a.cliente_id);
    const day = fc && c?.lat === '' ? dayFor(fc, a.fecha) : null;
    return html`<article class="card dest-card">
      <div class="row-between">
        <span class="badge ${a.fecha === today() ? 'info' : ''}">${relDay(a.fecha)} · ${a.hora} h</span>
        <span class="xsmall muted" data-rain="${a.id}">${day && day.prob !== null ? html`${icon('rain')} ${day.prob} %` : ''}</span>
      </div>
      <a class="dest-name" href="#/agenda/${a.id}">${fullName(c)}</a>
      <p class="card-sub ellipsis">${c?.direccion || 'Sin dirección'}${c?.barrio ? ` · ${c.barrio}` : ''}</p>
      ${quickActions(c, { waText: `Hola ${c?.nombre || ''}! Te escribo de ${cfg().negocio.nombre}: voy en camino para el mantenimiento de la pileta.` })}
      <a class="btn btn-sm btn-soft btn-block" style="margin-top:8px" href="#/visitas/nueva?agenda=${a.id}">${icon('check')}Registrar visita</a>
    </article>`;
  }

  function weatherStrip(f) {
    const umbral = Number(cfg().clima.umbral_lluvia) || 60;
    return html`<div class="weather-strip">${f.days.map((d) => {
      const w = describe(d.code);
      const wet = Number(d.prob) >= umbral;
      return html`<div class="wx ${wet ? 'wet' : ''}" title="${w.label}">
        <span class="wx-day">${d.date === today() ? 'Hoy' : dayShort(d.date)}</span>
        ${icon(w.icon, 'wx-ic')}
        <span class="wx-t"><strong>${Math.round(d.max)}°</strong> ${Math.round(d.min)}°</span>
        <span class="wx-p ${wet ? 'wet' : ''}">${icon('drop')}${d.prob ?? '—'} %</span>
      </div>`;
    })}</div>
    ${f.days.slice(0, 2).some((d) => Number(d.prob) >= umbral) ? html`<div class="alert warn" style="margin-top:12px">${icon('rain')}<div><p class="alert-title">Puede llover y afectar el trabajo</p><p>Probabilidad de lluvia ≥ ${umbral} % en las próximas 48 h. Evitá aplicar shock o floculante antes de una lluvia fuerte y avisá a los clientes si reprogramás.</p></div></div>` : ''}`;
  }

  function incomeBlock() {
    const r = periodRange(periodo);
    const cur = totals(r);
    const prev = totals(r.prev);
    const d = delta(cur.total, prev.total);
    const deudas = debts();
    return html`
      <div class="card card-pad-lg" style="margin-top:12px">
        <div class="stat">
          <span class="stat-label">Cobrado ${r.label}</span>
          <span class="stat-value">${money(cur.total)}</span>
          <span class="stat-delta ${d === null ? '' : d >= 0 ? 'up' : 'down'}">${d === null ? 'Sin datos del período anterior' : `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)} % vs. período anterior (${money(prev.total)})`}</span>
        </div>
        <div class="grid-2" style="margin-top:16px">
          <div class="stat"><span class="stat-label"><span class="dot" style="background:var(--chart-1)"></span> Visitas</span><span class="strong mono">${money(cur.visitas)}</span><span class="xsmall muted">${cur.cantidadVisitas} visita${cur.cantidadVisitas === 1 ? '' : 's'}</span></div>
          <div class="stat"><span class="stat-label"><span class="dot" style="background:var(--chart-2)"></span> Químicos</span><span class="strong mono">${money(cur.ventas)}</span></div>
        </div>
        <div class="chart-box" style="margin-top:16px"><canvas id="income-chart" role="img" aria-label="Gráfico de ingresos por visitas y químicos"></canvas></div>
      </div>
      <a class="card tap" href="#/visitas?pago=pendiente" style="margin-top:12px">
        <div class="row-between"><div><p class="stat-label">Deudas pendientes de cobro</p><p class="stat-value" style="font-size:var(--fs-xl);color:${deudas.total ? 'var(--danger)' : 'inherit'}">${money(deudas.total)}</p></div>${icon('chevron', 'li-chevron')}</div>
        ${deudas.porCliente.length ? html`<p class="small muted" style="margin-top:4px">${deudas.porCliente.length} cliente${deudas.porCliente.length > 1 ? 's' : ''} con saldo</p>` : ''}
      </a>`;
  }

  async function drawChart() {
    const canvas = root.querySelector('#income-chart');
    if (!canvas) return;
    chart?.destroy();
    try {
      chart = await incomeChart(canvas, series(periodo, periodRange(periodo)));
    } catch (e) {
      canvas.parentElement.innerHTML = `<p class="small muted">${navigator.onLine ? 'No se pudo cargar el gráfico.' : 'El gráfico se verá cuando haya conexión la primera vez.'}</p>`;
    }
  }

  /** Lluvia en el lugar de cada visita (si el cliente tiene ubicación). */
  async function rainPerVisit() {
    for (const a of upcoming(3).slice(0, 4)) {
      const c = get('clientes', a.cliente_id);
      if (!c || c.lat === '' || c.lng === '') continue;
      try {
        const f = await forecast(c.lat, c.lng);
        const d = dayFor(f, a.fecha);
        const el = root.querySelector(`[data-rain="${CSS.escape(a.id)}"]`);
        if (el && d) el.innerHTML = `${icon('rain')} ${d.prob} %`;
      } catch { /* sin clima puntual */ }
    }
  }

  on(root, 'click', '[data-periodo]', (e, b) => {
    periodo = b.dataset.periodo;
    root.querySelectorAll('[data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const sec = root.querySelector('#h-ing').closest('section');
    sec.querySelector('.segmented').nextElementSibling?.remove();
    sec.querySelector('.segmented').nextElementSibling?.remove();
    sec.querySelector('.segmented').insertAdjacentHTML('afterend', String(incomeBlock()));
    drawChart();
  });

  render();
  await loadWeather();
  if (ctx.isCurrent()) { render(); rainPerVisit(); }
  ctx.onChange(() => render());
  return () => chart?.destroy();
}
