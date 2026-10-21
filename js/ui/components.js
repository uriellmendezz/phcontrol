import { html, esc, on, safeUrl } from './dom.js';
import { icon } from './icons.js';
import { clientes, piletasDe } from '../data/store.js';
import { fullName, mapsHref, telHref, waNumber, num } from '../util/format.js';
import { compress, storeLocal, photoUrl } from '../data/photos.js';
import { toast } from './toast.js';

export function pageHead(title, sub = '', action = '') {
  return html`<div class="page-head"><div class="grow"><h1 class="page-title">${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>${action}</div>`;
}

export function skeletonList(n = 4) {
  return html`<div class="stack" aria-busy="true" aria-label="Cargando">${Array.from({ length: n }, () => html`<div class="skeleton sk-card"></div>`)}</div>`;
}

export function skeletonPage() {
  return html`<div aria-busy="true" aria-label="Cargando">
    <div class="skeleton sk-title" style="margin:24px 0 20px"></div>
    ${skeletonList(4)}
  </div>`;
}

export function emptyState({ ic = 'drop', title, text = '', action } = {}) {
  return html`<div class="empty">
    ${icon(ic)}
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action ? html`<a class="btn" href="${safeUrl(action.href)}">${action.icon ? icon(action.icon) : ''}${action.label}</a>` : ''}
  </div>`;
}

export function errorState(message, retryLabel = 'Reintentar') {
  return html`<div class="error-state" role="alert">
    ${icon('alert')}
    <h3>Algo salió mal</h3>
    <p>${message}</p>
    <button class="btn btn-ghost" type="button" data-action="retry">${icon('refresh')}${retryLabel}</button>
  </div>`;
}

/** Botones Ir / Llamar / WhatsApp de un cliente. */
export function quickActions(c, { waText = '' } = {}) {
  const maps = mapsHref(c);
  const tel = telHref(c?.telefono);
  const wa = waNumber(c?.telefono);
  return html`<div class="quick">
    ${maps ? html`<a href="${safeUrl(maps)}" target="_blank" rel="noopener">${icon('pin')}Ir</a>` : html`<button type="button" disabled aria-disabled="true">${icon('pin')}Sin ubicación</button>`}
    ${tel ? html`<a href="${safeUrl(tel)}">${icon('phone')}Llamar</a>` : ''}
    ${wa ? html`<a href="${safeUrl(`https://wa.me/${wa}${waText ? `?text=${encodeURIComponent(waText)}` : ''}`)}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>` : ''}
  </div>`;
}

/** Estado de un valor químico frente a su rango: ok / warn (cerca) / danger (lejos). */
export function rangeStatus(v, [min, max]) {
  if (v === '' || v === null || v === undefined || isNaN(v)) return null;
  if (v >= min && v <= max) return 'ok';
  const w = (max - min) || 1;
  return (v < min - w || v > max + w) ? 'danger' : 'warn';
}

export function meter(label, value, range, unit = '') {
  const st = rangeStatus(value, range);
  const [min, max] = range;
  const w = max - min || 1;
  const lo = min - w * 1.5;
  const hi = max + w * 1.5;
  const pct = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  return html`<div class="meter">
    <div class="row-between small"><span class="strong">${label}</span>
      <span class="mono">${value === '' || value == null ? '—' : num(value)} ${unit}
      ${st ? html`<span class="badge ${st}">${st === 'ok' ? 'En rango' : value < min ? 'Bajo' : 'Alto'}</span>` : ''}</span></div>
    <div class="meter-track" aria-hidden="true">
      <div class="meter-band" style="left:${pct(min)}%;width:${pct(max) - pct(min)}%"></div>
      ${st ? html`<div class="meter-mark ${st}" style="left:${pct(value)}%"></div>` : ''}
    </div>
    <div class="row-between xsmall muted"><span>Objetivo ${num(min)}–${num(max)} ${unit}</span></div>
  </div>`;
}

/**
 * Buscador de clientes (combobox accesible). Escribe el id en un input hidden con `name`.
 * onSelect(cliente) se llama al elegir.
 */
export function clientPicker(name, value = '', { required = true, label = 'Cliente' } = {}) {
  const c = clientes().find((x) => x.id === value);
  return html`<div class="field combo" data-combo="${name}">
    <label for="combo-${name}">${label}${required ? ' *' : ''}</label>
    <div class="search">${icon('search')}
      <input class="input" id="combo-${name}" type="search" autocomplete="off" placeholder="Buscar por nombre, barrio o teléfono"
        value="${c ? fullName(c) : ''}" role="combobox" aria-expanded="false" aria-controls="combo-list-${name}" aria-autocomplete="list">
    </div>
    <input type="hidden" name="${name}" value="${value}">
    <div class="combo-list" id="combo-list-${name}" role="listbox" hidden></div>
  </div>`;
}

export function bindClientPicker(root, name, onSelect) {
  const box = root.querySelector(`[data-combo="${CSS.escape(name)}"]`);
  if (!box) return;
  const input = box.querySelector('input[type="search"]');
  const hidden = box.querySelector(`input[name="${CSS.escape(name)}"]`);
  const list = box.querySelector('.combo-list');
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const items = clientes().filter((c) => c.estado !== 'inactivo' || c.id === hidden.value)
      .filter((c) => !q || `${fullName(c)} ${c.barrio} ${c.direccion} ${c.telefono}`.toLowerCase().includes(q)).slice(0, 30);
    list.innerHTML = items.length
      ? items.map((c) => `<button type="button" class="combo-item" role="option" data-id="${esc(c.id)}"><span class="strong">${esc(fullName(c))}</span><br><span class="small muted">${esc([c.direccion, c.barrio].filter(Boolean).join(' · ') || 'Sin dirección')}</span></button>`).join('')
      : `<p class="small muted" style="padding:12px">No hay clientes que coincidan. <a href="#/clientes/nuevo">Crear cliente</a></p>`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('focus', render);
  input.addEventListener('input', () => { hidden.value = ''; render(); });
  input.addEventListener('blur', () => setTimeout(() => {
    list.hidden = true; input.setAttribute('aria-expanded', 'false');
    const c = clientes().find((x) => x.id === hidden.value);
    if (!c) input.value = '';
  }, 180));
  on(list, 'mousedown', '.combo-item', (e) => e.preventDefault());
  on(list, 'click', '.combo-item', (e, b) => {
    const c = clientes().find((x) => x.id === b.dataset.id);
    hidden.value = c.id;
    input.value = fullName(c);
    list.hidden = true;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    onSelect?.(c);
  });
}

export function piletaOptions(clienteId, selected = '') {
  const ps = clienteId ? piletasDe(clienteId) : [];
  return html`<option value="">${ps.length ? 'Elegí una pileta' : 'Sin piletas cargadas'}</option>
    ${ps.map((p) => html`<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.nombre || 'Pileta'}${p.m3 !== '' ? ` · ${num(p.m3)} m³` : ''}</option>`)}`;
}

/** Campo de foto con cámara y vista previa. Guarda la referencia en un hidden `name`. */
export function photoField(name, label, ref = '') {
  return html`<div class="field photo-input" data-photo-field="${name}">
    <span class="label">${label}</span>
    <div class="photo-box">
      ${ref ? html`<img data-photo="${ref}" alt="${label}" class="img-ph">` : html`<div class="photo-placeholder">${icon('camera')}<span>Tocar para sacar foto</span></div>`}
      <input type="file" accept="image/*" capture="environment" aria-label="${label}">
      ${ref ? html`<button type="button" class="icon-btn photo-remove" data-remove-photo aria-label="Quitar foto">${icon('close')}</button>` : ''}
    </div>
    <input type="hidden" name="${name}" value="${ref}">
  </div>`;
}

export function bindPhotoFields(root, onChange) {
  root.querySelectorAll('[data-photo-field]').forEach((box) => {
    const name = box.dataset.photoField;
    const hidden = box.querySelector(`input[name="${CSS.escape(name)}"]`);
    const area = box.querySelector('.photo-box');
    const label = box.querySelector('.label').textContent;
    const paint = async (ref) => {
      area.querySelector('img, .photo-placeholder')?.remove();
      area.querySelector('[data-remove-photo]')?.remove();
      if (ref) {
        const img = document.createElement('img');
        img.alt = label;
        img.src = (await photoUrl(ref)) || '';
        area.prepend(img);
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'icon-btn photo-remove'; rm.dataset.removePhoto = '';
        rm.setAttribute('aria-label', 'Quitar foto');
        rm.innerHTML = String(icon('close'));
        area.append(rm);
      } else {
        const ph = document.createElement('div');
        ph.className = 'photo-placeholder';
        ph.innerHTML = `${icon('camera')}<span>Tocar para sacar foto</span>`;
        area.prepend(ph);
      }
    };
    box.querySelector('input[type="file"]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      area.setAttribute('aria-busy', 'true');
      try {
        const blob = await compress(file);
        const ref = await storeLocal(blob);
        hidden.value = ref;
        await paint(ref);
        onChange?.();
      } catch (err) {
        toast(err.message || 'No se pudo procesar la foto');
      } finally {
        area.removeAttribute('aria-busy');
      }
    });
    on(area, 'click', '[data-remove-photo]', async (e) => {
      e.preventDefault();
      // No se borra el archivo local: si cancelás la edición, el registro guardado lo sigue usando.
      hidden.value = '';
      await paint('');
      onChange?.();
    });
  });
}
