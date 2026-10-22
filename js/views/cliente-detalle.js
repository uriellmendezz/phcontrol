import { html, mount, on, initials } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { quickActions, errorState, rangeStatus, emptyState } from '../ui/components.js';
import { get, piletasDe, visitasDe, saldoCliente, all, save, remove, byDateAsc } from '../data/store.js';
import { settings } from '../data/settings.js';
import { hydratePhotos } from '../data/photos.js';
import { chemChart } from '../ui/charts.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { fullName, money, fdate, num, relDay, today } from '../util/format.js';
import { ESTADOS, isActive } from '../domain/agenda.js';

export default async function clienteDetalle(root, ctx) {
  const charts = [];
  let param = 'ph';

  function render() {
    const c = get('clientes', ctx.params.id);
    if (!c) { mount(root, errorState('No encontramos ese cliente. Puede que se haya borrado.')); return; }
    const ps = piletasDe(c.id);
    const vs = visitasDe(c.id);
    const saldo = saldoCliente(c.id);
    const prox = all('agenda').filter((a) => a.cliente_id === c.id && isActive(a) && a.fecha >= today()).sort(byDateAsc)[0];
    const rangos = settings().rangos;
    const pendientes = [...all('visitas').filter((v) => v.cliente_id === c.id && v.estado_pago === 'pendiente'), ...all('ventas').filter((v) => v.cliente_id === c.id && v.estado_pago === 'pendiente')];

    mount(root, html`
      <div class="client-head">
        <span class="avatar avatar-lg">${initials(fullName(c))}</span>
        <div class="grow">
          <h1 class="page-title">${fullName(c)}</h1>
          <p class="page-sub">${[c.direccion, c.barrio].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
          <p style="margin-top:6px">${c.estado === 'inactivo' ? html`<span class="badge">Inactivo</span>` : c.estado === 'borrador' ? html`<span class="badge warn">Borrador</span>` : html`<span class="badge ok">Activo</span>`}
            ${c.tarifa_monto !== '' ? html`<span class="badge">${c.tarifa_tipo === 'abono' ? 'Abono' : 'Por visita'} ${money(c.tarifa_monto)}</span>` : ''}</p>
        </div>
      </div>
      ${quickActions(c)}
      ${c.estado === 'borrador' ? html`<a class="alert warn alert-link" href="#/clientes/${c.id}/editar" style="margin-top:12px">${icon('edit')}<div class="grow"><p class="alert-title">Cliente en borrador</p><p>Faltan sus datos (teléfono, dirección, pileta). Tocá para completarlos.</p></div>${icon('chevron', 'li-chevron')}</a>` : ''}

      <div class="grid-2" style="margin-top:16px">
        <div class="card"><p class="stat-label">Saldo pendiente</p><p class="stat-value" style="font-size:var(--fs-xl);color:${saldo ? 'var(--danger)' : 'inherit'}">${money(saldo)}</p>
          ${saldo ? html`<button class="btn btn-sm btn-accent" type="button" data-action="pay-all" style="margin-top:8px">Saldar todo</button>` : ''}</div>
        <a class="card tap" href="${prox ? `#/agenda/${prox.id}` : `#/agenda/nueva?cliente=${c.id}`}"><p class="stat-label">Próxima visita</p>
          <p class="strong" style="margin-top:4px">${prox ? `${relDay(prox.fecha)} · ${prox.hora} h` : 'Sin agendar'}</p>
          <p class="small" style="color:var(--accent-strong);margin-top:4px">${prox ? 'Ver' : 'Agendar'} →</p></a>
      </div>

      <div class="btn-row" style="margin-top:12px">
        <a class="btn" href="#/visitas/nueva?cliente=${c.id}">${icon('plus')}Registrar visita</a>
        <a class="btn btn-ghost" href="#/agenda/nueva?cliente=${c.id}">${icon('calendar')}Agendar</a>
      </div>

      <section class="section">
        <div class="section-head"><h2 class="section-title">Piletas</h2><a class="section-link" href="#/piletas/nueva?cliente=${c.id}">+ Agregar</a></div>
        ${ps.length ? html`<div class="stack">${ps.map((p) => html`<a class="card tap pool-card" href="#/piletas/${p.id}">
          ${p.foto ? html`<img class="pool-img img-ph" data-photo="${p.foto}" alt="Foto de ${p.nombre || 'la pileta'}" loading="lazy">` : html`<div class="pool-img pool-img-empty">${icon('pool')}</div>`}
          <div class="grow">
            <p class="card-title">${p.nombre || 'Pileta'}</p>
            <dl class="kv" style="margin-top:8px">
              ${p.m3 !== '' ? html`<dt>Volumen</dt><dd>${num(p.m3)} m³</dd>` : ''}
              ${p.material ? html`<dt>Material</dt><dd>${p.material}</dd>` : ''}
              ${p.forma ? html`<dt>Forma</dt><dd>${p.forma}</dd>` : ''}
              ${p.largo !== '' && p.ancho !== '' && p.profundidad !== '' && p.largo !== undefined ? html`<dt>Medidas</dt><dd>${num(p.largo)} × ${num(p.ancho)} × ${num(p.profundidad)} m</dd>` : ''}
              ${p.bomba_tiene === 'no' ? html`<dt>Bomba</dt><dd>No tiene</dd>` : p.bomba_tiene === 'si' || p.bomba ? html`<dt>Bomba</dt><dd>${p.bomba || 'Tiene'}</dd>` : ''}
              ${p.filtro_tiene === 'no' ? html`<dt>Filtro</dt><dd>No tiene</dd>` : p.filtro_tiene === 'si' || p.filtro ? html`<dt>Filtro</dt><dd>${[p.filtro || 'Tiene', p.filtro_arena].filter(Boolean).join(' · ')}</dd>` : ''}
              ${p.cloracion ? html`<dt>Cloración</dt><dd>${p.cloracion}</dd>` : ''}
            </dl>
            ${p.notas ? html`<p class="small muted" style="margin-top:8px">${p.notas}</p>` : ''}
          </div></a>`)}</div>` : html`<p class="muted small">Sin piletas cargadas.</p>`}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">Evolución</h2></div>
        ${vs.some((v) => v.ph !== '' || v.cloro !== '') ? html`
          <div class="segmented" role="group" aria-label="Parámetro">
            ${[['ph', 'pH'], ['cloro', 'Cloro libre'], ['alcalinidad', 'Alcalinidad']].map(([k, l]) => html`<button type="button" data-param="${k}" aria-pressed="${k === param}">${l}</button>`)}
          </div>
          <div class="card" style="margin-top:12px"><div class="chart-box"><canvas id="chem-chart" role="img" aria-label="Evolución del parámetro"></canvas></div>
          <p class="xsmall muted" style="margin-top:8px">La franja verde es el rango objetivo.</p></div>` : html`<p class="muted small">Registrá mediciones para ver la evolución de pH y cloro.</p>`}
      </section>

      ${pendientes.length ? html`<section class="section"><div class="section-head"><h2 class="section-title">Pendiente de cobro</h2></div>
        <div class="list">${pendientes.sort(byDateAsc).map((x) => html`<a class="list-item" href="${x.id.startsWith('vis_') ? `#/visitas/${x.id}` : '#/stock?tab=ventas'}">
          <div class="li-main"><div class="li-title">${x.producto ? `Venta: ${x.producto}` : 'Visita'}</div><div class="li-sub">${fdate(x.fecha)}</div></div>
          <span class="strong mono">${money(x.monto)}</span></a>`)}</div></section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">Historial de visitas</h2>${vs.length ? html`<a class="section-link" href="#/visitas?cliente=${c.id}">Ver todo</a>` : ''}</div>
        ${vs.length ? html`<div class="list">${vs.slice(0, 10).map((v) => {
          const ph = rangeStatus(v.ph, rangos.ph); const cl = rangeStatus(v.cloro, rangos.cloro);
          return html`<a class="list-item" href="#/visitas/${v.id}">
            <div class="li-main"><div class="li-title">${fdate(v.fecha)}${v.hora ? ` · ${v.hora}` : ''}</div>
              <div class="row" style="gap:6px;margin-top:4px">${v.ph !== '' ? html`<span class="badge ${ph}">pH ${num(v.ph)}</span>` : ''}${v.cloro !== '' ? html`<span class="badge ${cl}">Cl ${num(v.cloro)}</span>` : ''}</div></div>
            ${v.monto !== '' ? html`<span class="mono small">${money(v.monto)}</span>` : ''}${icon('chevron', 'li-chevron')}</a>`;
        })}</div>` : emptyState({ ic: 'tube', title: 'Sin visitas todavía', action: { label: 'Registrar visita', href: `#/visitas/nueva?cliente=${c.id}` } })}
      </section>

      ${c.notas ? html`<section class="section"><h2 class="section-title" style="margin-bottom:12px">Notas</h2><div class="card"><p style="white-space:pre-wrap">${c.notas}</p></div></section>` : ''}

      <section class="section"><h2 class="section-title" style="margin-bottom:12px">Agenda</h2>
        ${(() => {
          const ag = all('agenda').filter((a) => a.cliente_id === c.id && a.fecha >= today()).sort(byDateAsc).slice(0, 6);
          return ag.length ? html`<div class="list">${ag.map((a) => html`<a class="list-item" href="#/agenda/${a.id}"><span class="dot" style="background:${ESTADOS[a.estado].color}"></span><div class="li-main"><div class="li-title">${relDay(a.fecha)} · ${a.hora} h</div><div class="li-sub">${ESTADOS[a.estado].label}</div></div></a>`)}</div>` : html`<p class="muted small">Sin visitas futuras agendadas.</p>`;
        })()}
      </section>

      <div class="btn-row" style="margin-top:32px">
        <a class="btn btn-ghost" href="#/clientes/${c.id}/editar">${icon('edit')}Editar</a>
        <button class="btn btn-danger" type="button" data-action="delete">${icon('trash')}Eliminar</button>
      </div>`);
    hydratePhotos(root);
    drawChart();
  }

  async function drawChart() {
    charts.forEach((ch) => ch.destroy());
    charts.length = 0;
    const canvas = root.querySelector('#chem-chart');
    if (!canvas) return;
    const pts = visitasDe(ctx.params.id).filter((v) => v[param] !== '').slice(0, 20).reverse().map((v) => ({ x: fdate(v.fecha).slice(0, 5), y: Number(v[param]) }));
    if (!pts.length) { canvas.parentElement.innerHTML = '<p class="small muted">Sin datos de este parámetro.</p>'; return; }
    try { charts.push(await chemChart(canvas, pts, settings().rangos[param], param)); }
    catch { canvas.parentElement.innerHTML = '<p class="small muted">El gráfico necesita conexión la primera vez.</p>'; }
  }

  on(root, 'click', '[data-param]', (e, b) => {
    param = b.dataset.param;
    root.querySelectorAll('[data-param]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawChart();
  });
  on(root, 'click', '[data-action="pay-all"]', async () => {
    const id = ctx.params.id;
    const ok = await confirmDialog({ title: 'Saldar deuda', message: `Se marcan como pagadas todas las visitas y ventas pendientes (${money(saldoCliente(id))}).`, confirm: 'Saldar' });
    if (!ok) return;
    for (const v of all('visitas').filter((x) => x.cliente_id === id && x.estado_pago === 'pendiente')) await save('visitas', { ...v, estado_pago: 'pagado' });
    for (const v of all('ventas').filter((x) => x.cliente_id === id && x.estado_pago === 'pendiente')) await save('ventas', { ...v, estado_pago: 'pagado' });
    toast('Saldo cancelado');
  });
  on(root, 'click', '[data-action="delete"]', async () => {
    const c = get('clientes', ctx.params.id);
    const nVis = visitasDe(c.id).length;
    const ok = await confirmDialog({
      title: 'Eliminar cliente',
      message: nVis ? `Tiene ${nVis} visita(s) registradas que quedarán sin cliente. Si dejó de ser cliente, mejor marcalo como inactivo.` : 'Se elimina el cliente, sus piletas y sus turnos futuros.',
      confirm: 'Eliminar', danger: true
    });
    if (!ok) return;
    for (const p of piletasDe(c.id)) await remove('piletas', p.id);
    for (const a of all('agenda').filter((x) => x.cliente_id === c.id && isActive(x))) await remove('agenda', a.id);
    await remove('clientes', c.id);
    toast('Cliente eliminado');
    navigate('#/clientes', { replace: true });
  });

  render();
  ctx.onChange(render, ['clientes', 'piletas', 'visitas', 'ventas', 'agenda', '*']);
  return () => charts.forEach((ch) => ch.destroy());
}
