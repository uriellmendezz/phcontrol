import { html, mount, on, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, emptyState, errorState } from '../ui/components.js';

let cache = null;
/** Carga el contenido (archivo JSON editable; el Service Worker lo deja disponible offline). */
export async function loadTeorico() {
  if (cache) return cache;
  const res = await fetch('data/teorico.json');
  if (!res.ok) throw new Error('No se pudo cargar el Teórico.');
  cache = await res.json();
  return cache;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ICONS = { problemas: 'alert', quimica: 'flask', limpieza: 'wave', equipos: 'settings', faq: 'info', seguridad: 'alert' };

export default async function teorico(root, ctx) {
  let data;
  try { data = await loadTeorico(); } catch (e) {
    mount(root, errorState(e.message));
    root.querySelector('[data-action="retry"]').addEventListener('click', () => teorico(root, ctx));
    return;
  }
  let cat = ctx.query.cat || '';
  let q = '';

  function renderList() {
    const nq = norm(q);
    const items = data.articulos
      .filter((a) => !cat || a.categoria === cat)
      .filter((a) => !nq || norm([a.titulo, a.resumen, ...(a.tags || []), ...(a.sintomas || []), ...(a.causas || []), a.contenido].join(' ')).includes(nq));
    const box = root.querySelector('#teo-list');
    if (!items.length) { mount(box, emptyState({ ic: 'search', title: 'Sin resultados', text: 'Probá con otra palabra: "verde", "turbia", "pH"…' })); return; }
    mount(box, html`<div class="list">${items.map((a) => html`<a class="list-item" href="#/teorico/${a.id}">
      <span class="avatar">${icon(ICONS[a.categoria] || 'book')}</span>
      <div class="li-main"><div class="li-title">${a.titulo}</div><div class="li-sub">${a.resumen || data.categorias[a.categoria] || ''}</div></div>
      ${icon('chevron', 'li-chevron')}</a>`)}</div>`);
  }

  mount(root, html`
    ${pageHead('Teórico', 'Funciona sin conexión')}
    <div class="search">${icon('search')}<input class="input" type="search" id="teo-q" placeholder="Buscar: agua verde, espuma, filtro…" aria-label="Buscar en el teórico" autocomplete="off"></div>
    <div class="chips" style="margin-top:12px" role="group" aria-label="Categorías">
      <button type="button" class="chip" data-cat="" aria-pressed="${!cat}">Todo</button>
      ${Object.entries(data.categorias).map(([k, l]) => html`<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === cat}">${l}</button>`)}
    </div>
    <div id="teo-list" style="margin-top:16px"></div>`);
  root.querySelector('#teo-q').addEventListener('input', debounce((e) => { q = e.target.value; renderList(); }, 120));
  on(root, 'click', '[data-cat]', (e, b) => {
    cat = b.dataset.cat;
    root.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
  renderList();
}
