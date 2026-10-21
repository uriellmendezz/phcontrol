import { html, mount, on, debounce, initials } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, emptyState } from '../ui/components.js';
import { clientes, all, saldoCliente } from '../data/store.js';
import { settings } from '../data/settings.js';
import { fullName, money, today, diffDays, relDay } from '../util/format.js';

export default async function clientesView(root, ctx) {
  let q = '';
  let filtro = ctx.query.filtro || 'activos';

  function lastVisits() {
    const m = new Map();
    for (const v of all('visitas')) if (!m.has(v.cliente_id) || v.fecha > m.get(v.cliente_id)) m.set(v.cliente_id, v.fecha);
    return m;
  }

  function renderList() {
    const N = Number(settings().alertas.dias_sin_visita) || 8;
    const last = lastVisits();
    const t = today();
    const items = clientes()
      .filter((c) => filtro === 'todos' || (filtro === 'inactivos' ? c.estado === 'inactivo' : c.estado !== 'inactivo'))
      .filter((c) => filtro !== 'deuda' || saldoCliente(c.id) > 0)
      .filter((c) => filtro !== 'sin_visita' || (last.has(c.id) && diffDays(t, last.get(c.id)) > N && c.estado !== 'inactivo'))
      .filter((c) => !q || `${fullName(c)} ${c.direccion} ${c.barrio} ${c.telefono}`.toLowerCase().includes(q));
    const box = root.querySelector('#cli-list');
    if (!clientes().length) {
      mount(box, emptyState({ ic: 'users', title: 'Todavía no hay clientes', text: 'Cargá tu primer cliente con su pileta.', action: { label: 'Nuevo cliente', href: '#/clientes/nuevo', icon: 'plus' } }));
      return;
    }
    if (!items.length) { mount(box, emptyState({ ic: 'search', title: 'Sin resultados', text: 'Probá con otra búsqueda o filtro.' })); return; }
    mount(box, html`<div class="list">${items.map((c) => {
      const saldo = saldoCliente(c.id);
      const lv = last.get(c.id);
      return html`<a class="list-item" href="#/clientes/${c.id}">
        <span class="avatar">${initials(fullName(c))}</span>
        <div class="li-main">
          <div class="li-title">${fullName(c)}</div>
          <div class="li-sub">${[c.barrio || c.direccion, lv ? `Última: ${relDay(lv).toLowerCase()}` : 'Sin visitas'].filter(Boolean).join(' · ')}</div>
        </div>
        ${saldo > 0 ? html`<span class="badge danger">${money(saldo)}</span>` : c.estado === 'inactivo' ? html`<span class="badge">Inactivo</span>` : ''}
        ${icon('chevron', 'li-chevron')}
      </a>`;
    })}</div>`);
  }

  mount(root, html`
    ${pageHead('Clientes', `${clientes().filter((c) => c.estado !== 'inactivo').length} activos`, html`<a class="btn btn-sm" href="#/clientes/nuevo">${icon('plus')}Nuevo</a>`)}
    <div class="search">${icon('search')}<input class="input" type="search" id="cli-q" placeholder="Buscar por nombre, barrio o teléfono" aria-label="Buscar clientes" autocomplete="off"></div>
    <div class="chips" style="margin-top:12px" role="group" aria-label="Filtro">
      ${[['activos', 'Activos'], ['deuda', 'Con saldo'], ['sin_visita', 'Sin visitar'], ['inactivos', 'Inactivos'], ['todos', 'Todos']].map(([k, l]) => html`<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`)}
    </div>
    <div id="cli-list" style="margin-top:16px"></div>`);

  root.querySelector('#cli-q').addEventListener('input', debounce((e) => { q = e.target.value.trim().toLowerCase(); renderList(); }, 120));
  on(root, 'click', '[data-f]', (e, b) => {
    filtro = b.dataset.f;
    root.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
  renderList();
  ctx.onChange(renderList, ['clientes', 'visitas', 'ventas', '*']);
}
