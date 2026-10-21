/**
 * Plantillas HTML seguras.
 * `html\`...\`` escapa TODO valor interpolado, salvo que sea otro resultado de `html`
 * o esté envuelto en `raw()` (solo para SVG/íconos propios, nunca para datos de la hoja).
 */
class SafeHTML {
  constructor(str) { this.str = str; }
  toString() { return this.str; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

function toHTML(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHTML) return v.str;
  if (Array.isArray(v)) return v.map(toHTML).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHTML(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

export const raw = (s) => new SafeHTML(String(s));

/** Permite solo URLs http(s), tel:, mailto:, blob: y data:image para atributos href/src. */
export function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (/^(https?:|tel:|mailto:|blob:|data:image\/|#|\.\/)/i.test(u)) return u;
  return '#';
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, content) {
  el.innerHTML = toHTML(content);
  return el;
}

/** Delegación de eventos: on(root, 'click', '[data-action="x"]', fn) */
export function on(root, type, selector, fn, opts) {
  const handler = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) fn(e, target);
  };
  root.addEventListener(type, handler, opts);
  return () => root.removeEventListener(type, handler, opts);
}

/** Debounce con .cancel() (para que un autoguardado pendiente no reviva un borrador ya descartado). */
export function debounce(fn, ms = 300) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Lee todos los campos con name de un form como objeto plano (strings). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function fillForm(form, data) {
  for (const el of form.elements) {
    if (!el.name || !(el.name in data) || el.type === 'file') continue;
    if (el.type === 'checkbox') el.checked = !!data[el.name];
    else if (el.type === 'radio') el.checked = el.value === String(data[el.name]);
    else el.value = data[el.name] ?? '';
  }
}

/** Muestra errores en línea. errors = { campo: 'mensaje' } */
export function showErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.id = `err-${name}`;
    p.textContent = msg;
    input.setAttribute('aria-describedby', p.id);
    (input.closest('.field') || input.parentElement).appendChild(p);
    first ??= input;
  }
  if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  return !first;
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?';
}
