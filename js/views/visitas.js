import { html, mount, on, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, emptyState, rangeStatus } from '../ui/components.js';
import { all, get, clientes, byDateDesc } from '../data/store.js';
import { settings } from '../data/settings.js';
import { fdate, fullName, money, num, monthTitle } from '../util/format.js';

const PAGO = { pagado: ['Pagado', 'ok'], pendiente: ['Pendiente', 'danger'], sin_cargo: ['Sin cargo', ''] };

export default async function visitas(root, ctx) {
  const f = { cliente: ctx.query.cliente || '', desde: ctx.query.desde || '', hasta: ctx.query.hasta || '', pago: ctx.query.pago || '' };

  function list() {
    return all('visitas')
      .filter((v) => !f.cliente || v.cliente_id === f.cliente)
      .filter((v) => !f.desde || v.fecha >= f.desde)
      .filter((v) => !f.hasta || v.fecha <= f.hasta)
      .filter((v) => !f.pago || v.estado_pago === f.pago)
      .sort(byDateDesc);
  }

  function renderList() {
    const items = list();
    const rangos = settings().rangos;
    const box = root.querySelector('#vis-list');
    if (!items.length) {
      mount(box, emptyState({ ic: 'tube', title: 'No hay visitas', text: Object.values(f).some(Boolean) ? 'Probá cambiando los filtros.' : 'Registrá tu primera visita.', action: { label: 'Registrar visita', href: '#/visitas/nueva', icon: 'plus' } }));
      return;
    }
    const total = items.reduce((s, v) => s + (Number(v.monto) || 0), 0);
    let lastMonth = '';
    mount(box, html`
      <p class="small muted" style="margin-bottom:8px">${items.length} visita${items.length > 1 ? 's' : ''} · ${money(total)}</p>
      <div class="list">${items.map((v) => {
        const m = v.fecha.slice(0, 7);
        const head = m !== lastMonth ? html`<h3 class="list-month">${monthTitle(v.fecha)}</h3>` : '';
        lastMonth = m;
        const c = get('clientes', v.cliente_id);
        const ph = rangeStatus(v.ph, rangos.ph);
        const cl = rangeStatus(v.cloro, rangos.cloro);
        const [pl, pc] = PAGO[v.estado_pago] || ['—', ''];
        return html`${head}<a class="list-item" href="#/visitas/${v.id}">
          <div class="li-main">
            <div class="li-title">${fullName(c)}</div>
            <div class="li-sub">${fdate(v.fecha)}${v.hora ? ` · ${v.hora}` : ''}</div>
            <div class="row" style="gap:6px;margin-top:6px">
              ${v.ph !== '' ? html`<span class="badge ${ph}">pH ${num(v.ph)}</span>` : ''}
              ${v.cloro !== '' ? html`<span class="badge ${cl}">Cl ${num(v.cloro)}</span>` : ''}
            </div>
          </div>
          <div class="right"><div class="strong mono">${v.monto !== '' ? money(v.monto) : ''}</div><span class="badge ${pc}">${pl}</span></div>
        </a>`;
      })}</div>`);
  }

  mount(root, html`
    ${pageHead('Visitas', 'Historial de registros', html`<a class="btn btn-sm" href="#/visitas/nueva">${icon('plus')}Nueva</a>`)}
    <form class="card stack" id="vis-filters" onsubmit="return false">
      <div class="field"><label for="f-cli">Cliente</label>
        <select class="select" id="f-cli" name="cliente"><option value="">Todos</option>${clientes().map((c) => html`<option value="${c.id}" ${c.id === f.cliente ? 'selected' : ''}>${fullName(c)}</option>`)}</select></div>
      <div class="grid-2">
        <div class="field"><label for="f-desde">Desde</label><input class="input" type="date" id="f-desde" name="desde" value="${f.desde}"></div>
        <div class="field"><label for="f-hasta">Hasta</label><input class="input" type="date" id="f-hasta" name="hasta" value="${f.hasta}"></div>
      </div>
      <div class="chips" role="group" aria-label="Estado de pago">
        ${[['', 'Todas'], ['pendiente', 'Pendientes de cobro'], ['pagado', 'Pagadas']].map(([k, l]) => html`<button type="button" class="chip" data-pago="${k}" aria-pressed="${f.pago === k}">${l}</button>`)}
      </div>
    </form>
    <div id="vis-list" style="margin-top:16px"></div>`);

  const update = debounce(() => {
    const form = root.querySelector('#vis-filters');
    f.cliente = form.cliente.value; f.desde = form.desde.value; f.hasta = form.hasta.value;
    renderList();
  }, 120);
  root.querySelector('#vis-filters').addEventListener('input', update);
  on(root, 'click', '[data-pago]', (e, b) => {
    f.pago = b.dataset.pago;
    root.querySelectorAll('[data-pago]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
  renderList();
  ctx.onChange(renderList, ['visitas', 'clientes', '*']);
}
