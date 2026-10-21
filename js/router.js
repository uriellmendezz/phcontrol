/**
 * Router por hash (#/ruta). GitHub Pages no reescribe rutas, así que todo vive después del #.
 * Cada vista es un módulo en js/views/ que exporta por defecto: async (root, ctx) => cleanup?
 */
import { mount, html } from './ui/dom.js';
import { skeletonPage, errorState } from './ui/components.js';
import { bus } from './data/store.js';
import { icon } from './ui/icons.js';

const ROUTES = [
  ['/inicio', 'inicio'],
  ['/visitas', 'visitas'],
  ['/visitas/nueva', 'visita-form'],
  ['/visitas/:id', 'visita-detalle'],
  ['/visitas/:id/editar', 'visita-form'],
  ['/agenda/nueva', 'agenda-form'],
  ['/agenda/:id', 'agenda-form'],
  ['/calendario', 'calendario'],
  ['/clientes', 'clientes'],
  ['/clientes/nuevo', 'cliente-form'],
  ['/clientes/:id', 'cliente-detalle'],
  ['/clientes/:id/editar', 'cliente-form'],
  ['/piletas/nueva', 'pileta-form'],
  ['/piletas/:id', 'pileta-form'],
  ['/calculadora', 'calculadora'],
  ['/stock', 'stock'],
  ['/stock/nuevo', 'stock-form'],
  ['/stock/:id', 'stock-form'],
  ['/ventas/nueva', 'venta-form'],
  ['/teorico', 'teorico'],
  ['/teorico/:id', 'teorico-articulo'],
  ['/ajustes', 'ajustes'],
  ['/mas', 'mas']
];
const ROOTS = new Set(['/inicio', '/calendario', '/clientes', '/mas', '/visitas/nueva']);

const TABS = [
  { href: '#/inicio', label: 'Inicio', ic: 'home', match: ['inicio'] },
  { href: '#/calendario', label: 'Agenda', ic: 'calendar', match: ['calendario', 'agenda'] },
  { href: '#/visitas/nueva', label: 'Registrar', ic: 'plus', match: ['visitas/nueva'], main: true },
  { href: '#/clientes', label: 'Clientes', ic: 'users', match: ['clientes', 'piletas'] },
  { href: '#/mas', label: 'Más', ic: 'more', match: ['mas', 'visitas', 'calculadora', 'stock', 'ventas', 'teorico', 'ajustes'] }
];

function match(path) {
  const segs = path.split('/').filter(Boolean);
  for (const [pattern, view] of ROUTES) {
    const ps = pattern.split('/').filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (ps[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { pattern, view, params };
  }
  return null;
}

export function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/inicio';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/inicio', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export const navigate = (hash, { replace = false } = {}) => {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (replace) { history.replaceState(null, '', target); render(); }
  else location.hash = target;
};

let cleanup = [];
let renderId = 0;
const viewEl = () => document.getElementById('view');

function renderTabs(path) {
  const key = path.replace(/^\//, '');
  const active = TABS.find((t) => t.match.some((m) => key === m)) ||
    TABS.find((t) => t.match.some((m) => key.startsWith(m + '/') || key === m)) || TABS[4];
  mount(document.getElementById('tabbar'), TABS.map((t) => html`
    <a class="tab ${t.main ? 'tab-main' : ''}" href="${t.href}" ${t === active ? html`aria-current="page"` : ''}>
      ${t.main ? html`<span class="tab-fab">${icon(t.ic)}</span>` : icon(t.ic)}
      <span ${t.main ? html`class="sr-only"` : ''}>${t.label}</span>
    </a>`));
}

async function render() {
  const id = ++renderId;
  cleanup.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  cleanup = [];
  const { path, query } = parseHash();
  const m = match(path);
  if (!m) { navigate('#/inicio', { replace: true }); return; }

  renderTabs(path);
  const back = document.getElementById('btn-back');
  back.hidden = ROOTS.has(m.pattern);

  const old = viewEl();
  const root = old.cloneNode(false);
  root.classList.add('view-enter');
  old.replaceWith(root);
  window.scrollTo(0, 0);
  mount(root, skeletonPage());

  const ctx = {
    params: m.params,
    query,
    path,
    /** Re-ejecuta fn cuando cambian datos (escrituras locales o sincronización). */
    onChange(fn, entities) {
      const h = (e) => {
        if (id !== renderId) return;
        const ent = e.detail?.entity;
        if (!entities || ent === '*' || entities.includes(ent)) fn(e.detail);
      };
      bus.addEventListener('change', h);
      cleanup.push(() => bus.removeEventListener('change', h));
    },
    addCleanup(fn) { cleanup.push(fn); },
    isCurrent: () => id === renderId
  };

  const run = async () => {
    try {
      const mod = await import(`./views/${m.view}.js`);
      if (id !== renderId) return;
      const c = await mod.default(root, ctx);
      if (typeof c === 'function') cleanup.push(c);
    } catch (err) {
      console.error(err);
      if (id !== renderId) return;
      mount(root, errorState(navigator.onLine ? (err.message || 'Error al abrir la pantalla.') : 'Esta pantalla todavía no está guardada para usar sin conexión.'));
      root.querySelector('[data-action="retry"]')?.addEventListener('click', run);
    }
  };
  await run();
  if (id === renderId) root.focus({ preventScroll: true });
}

/** Pantalla "padre" para el botón volver cuando no hay historial propio (p. ej. abrir la app en una ruta). */
function parentOf(path) {
  const segs = path.split('/').filter(Boolean);
  segs.pop();
  const p = '/' + segs.join('/');
  const alias = { '/agenda': '/calendario', '/piletas': '/clientes', '/ventas': '/stock', '/': '/mas' };
  if (alias[p]) return alias[p];
  return match(p) ? p : '/mas';
}

let depth = 0;
let goingBack = false;

export function goBack() {
  if (depth > 0) { goingBack = true; history.back(); }
  else navigate('#' + parentOf(parseHash().path), { replace: true });
}

export function startRouter() {
  window.addEventListener('hashchange', () => {
    if (goingBack) { depth = Math.max(0, depth - 1); goingBack = false; } else depth++;
    render();
  });
  // Los gráficos leen los colores al dibujarse: al cambiar el tema se redibuja la pantalla
  // (salvo Ajustes, donde se elige el tema y podría haber cambios sin guardar).
  window.addEventListener('themechange', () => { if (parseHash().path !== '/ajustes') render(); });
  document.getElementById('btn-back').innerHTML = String(icon('back'));
  document.getElementById('btn-back').addEventListener('click', goBack);
  if (!location.hash) history.replaceState(null, '', '#/inicio');
  render();
}
