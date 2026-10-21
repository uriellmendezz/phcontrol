import { html, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead } from '../ui/components.js';
import { all } from '../data/store.js';
import { getStatus } from '../data/sync.js';

export default async function mas(root) {
  const bajos = all('stock').filter((p) => p.umbral !== '' && Number(p.cantidad || 0) <= Number(p.umbral)).length;
  const st = getStatus();
  const items = [
    { href: '#/visitas', ic: 'list', title: 'Historial de visitas', sub: 'Registros, filtros y cobros' },
    { href: '#/agenda/nueva', ic: 'clock', title: 'Programar visita', sub: 'Única o recurrente' },
    { href: '#/calculadora', ic: 'calc', title: 'Calculadora de químicos', sub: 'Corrección, agua verde, puesta a punto' },
    { href: '#/stock', ic: 'box', title: 'Stock y ventas', sub: bajos ? `${bajos} producto(s) con stock bajo` : 'Inventario, compras y ventas', badge: bajos ? 'warn' : '' },
    { href: '#/teorico', ic: 'book', title: 'Teórico', sub: 'Problemas, química y rutinas (offline)' },
    { href: '#/ajustes', ic: 'settings', title: 'Ajustes', sub: st.state === 'sin_configurar' ? 'Conectá Google Sheets' : 'Conexión, backup, rangos', badge: st.state === 'sin_configurar' || st.state === 'error' ? 'danger' : '' }
  ];
  mount(root, html`
    ${pageHead('Más')}
    <div class="list">${items.map((it) => html`<a class="list-item" href="${it.href}">
      <span class="avatar">${icon(it.ic)}</span>
      <div class="li-main"><div class="li-title">${it.title}</div><div class="li-sub">${it.sub}</div></div>
      ${it.badge ? html`<span class="dot" style="background:var(--${it.badge})"></span>` : ''}
      ${icon('chevron', 'li-chevron')}</a>`)}</div>`);
}
