/**
 * Mapa de clientes: un punto por cliente con ubicación (lat/lng).
 * Leaflet + mapas de OpenStreetMap: gratis y sin clave. Los mapas necesitan conexión.
 */
import { html, mount, on, esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, errorState } from '../ui/components.js';
import { clientes, all, saldoCliente } from '../data/store.js';
import { settings } from '../data/settings.js';
import { loadLib } from '../util/libs.js';
import { currentPosition } from '../util/geo.js';
import { toast } from '../ui/toast.js';
import { fullName, mapsHref, money, relDay } from '../util/format.js';

const COLORS = { activo: '#0084B9', borrador: '#E0A33B', inactivo: '#9AA8B4' };
const hasGeo = (c) => c.lat !== '' && c.lng !== '' && c.lat != null && c.lng != null && !isNaN(c.lat) && !isNaN(c.lng);

export default async function mapa(root, ctx) {
  let map = null;
  let layer = null;
  let me = null;
  let filtro = 'activos';

  const conGeo = () => clientes().filter(hasGeo).filter((c) => filtro === 'todos' || c.estado !== 'inactivo');
  const sinGeo = () => clientes().filter((c) => !hasGeo(c) && c.estado !== 'inactivo');

  mount(root, html`
    ${pageHead('Mapa de clientes', '', html`<button class="icon-btn soft" type="button" data-action="me" aria-label="Mostrar mi ubicación">${icon('locate')}</button>`)}
    <div class="chips" role="group" aria-label="Filtro">
      ${[['activos', 'Activos'], ['todos', 'Todos']].map(([k, l]) => html`<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`)}
    </div>
    <div class="map-box" id="map" role="region" aria-label="Mapa con la ubicación de los clientes"><div class="skeleton" style="position:absolute;inset:0"></div></div>
    <div class="legend" style="margin-top:12px">
      <span><i style="background:${COLORS.activo}"></i>Activo</span>
      <span><i style="background:${COLORS.borrador}"></i>Borrador</span>
      <span><i style="background:${COLORS.inactivo}"></i>Inactivo</span>
    </div>
    <div id="sin-geo"></div>`);

  function lastVisits() {
    const m = new Map();
    for (const v of all('visitas')) if (!m.has(v.cliente_id) || v.fecha > m.get(v.cliente_id)) m.set(v.cliente_id, v.fecha);
    return m;
  }

  function popup(c, last) {
    const saldo = saldoCliente(c.id);
    // Leaflet inserta el HTML tal cual: todo dato del cliente va escapado con esc().
    return `<div class="map-pop">
      <strong>${esc(fullName(c))}</strong>
      <span>${esc([c.direccion, c.barrio].filter(Boolean).join(' · ') || 'Sin dirección')}</span>
      <span>${last.has(c.id) ? `Última visita: ${esc(relDay(last.get(c.id)).toLowerCase())}` : 'Sin visitas'}${saldo > 0 ? ` · debe ${esc(money(saldo))}` : ''}</span>
      <div class="map-pop-actions">
        <a href="#/clientes/${encodeURIComponent(c.id)}">Ver ficha</a>
        <a href="${esc(mapsHref(c))}" target="_blank" rel="noopener">Ir</a>
      </div>
    </div>`;
  }

  function draw(fit) {
    const L = window.L;
    layer.clearLayers();
    const last = lastVisits();
    const pts = conGeo();
    for (const c of pts) {
      L.circleMarker([Number(c.lat), Number(c.lng)], {
        radius: 9, weight: 3, color: '#FFFFFF', fillColor: COLORS[c.estado] || COLORS.activo, fillOpacity: 1
      }).bindPopup(popup(c, last), { closeButton: false, minWidth: 200 }).addTo(layer);
    }
    if (fit) {
      if (pts.length) map.fitBounds(L.latLngBounds(pts.map((c) => [Number(c.lat), Number(c.lng)])).pad(0.2), { maxZoom: 15 });
      else map.setView([settings().clima.lat, settings().clima.lng], 12);
    }
    const faltan = sinGeo();
    mount(root.querySelector('#sin-geo'), faltan.length ? html`
      <section class="section">
        <div class="section-head"><h2 class="section-title">Sin ubicación (${faltan.length})</h2></div>
        <p class="small muted" style="margin-bottom:8px">Entrá a cada cliente → Editar → "Usar mi ubicación actual" o pegá su enlace de Google Maps.</p>
        <div class="list">${faltan.map((c) => html`<a class="list-item" href="#/clientes/${c.id}/editar">
          <span class="avatar">${icon('pin')}</span>
          <div class="li-main"><div class="li-title">${fullName(c)}</div><div class="li-sub">${c.direccion || 'Sin dirección'}</div></div>
          ${icon('chevron', 'li-chevron')}</a>`)}</div>
      </section>` : (pts.length ? '' : html`<p class="small muted" style="margin-top:12px">Todavía no hay clientes cargados.</p>`));
  }

  async function init() {
    let L;
    try { L = await loadLib('leaflet'); } catch (e) {
      if (!ctx.isCurrent()) return;
      mount(root.querySelector('#map'), errorState(navigator.onLine ? e.message : 'El mapa necesita conexión.'));
      root.querySelector('[data-action="retry"]')?.addEventListener('click', init);
      return;
    }
    if (!ctx.isCurrent()) return;
    const box = root.querySelector('#map');
    box.innerHTML = '';
    map = L.map(box, { zoomControl: true, attributionControl: true, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    draw(true);
    // Leaflet calcula mal el tamaño si el contenedor todavía está animándose.
    setTimeout(() => map?.invalidateSize(), 300);
  }

  on(root, 'click', '[data-f]', (e, b) => {
    filtro = b.dataset.f;
    root.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (map) draw(true);
  });
  on(root, 'click', '[data-action="me"]', async (e, b) => {
    if (!map) return;
    b.classList.add('is-loading');
    try {
      const p = await currentPosition();
      me?.remove();
      me = window.L.circleMarker([p.lat, p.lng], { radius: 8, weight: 3, color: '#FFFFFF', fillColor: '#192F41', fillOpacity: 1 }).bindPopup('Estás acá').addTo(map);
      map.setView([p.lat, p.lng], 14);
    } catch (err) { toast(err.message); } finally { b.classList.remove('is-loading'); }
  });

  await init();
  ctx.onChange(() => { if (map) draw(false); }, ['clientes', 'visitas', '*']);
  return () => { map?.remove(); map = null; };
}
