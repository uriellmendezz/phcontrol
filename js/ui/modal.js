/** Hojas inferiores (bottom sheets) y confirmaciones, con bloqueo de scroll del body (iOS). */
import { html, mount, on } from './dom.js';
import { icon } from './icons.js';

let openCount = 0;

// El body no scrollea: alcanza con frenar el contenedor de scroll mientras hay una hoja abierta.
function lockBody() {
  if (openCount++ === 0) document.body.classList.add('modal-open');
}
function unlockBody() {
  if (--openCount === 0) document.body.classList.remove('modal-open');
}

/**
 * Abre una hoja. content puede ser SafeHTML o función (body) => void para montar a mano.
 * Devuelve { el, body, close }.
 */
export function sheet({ title = '', content, footer, onClose, label } = {}) {
  const host = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label || title || 'Diálogo');
  mount(el, html`
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="sheet-title">${title}</h2>
      <button class="icon-btn soft" type="button" data-close aria-label="Cerrar">${icon('close')}</button>
    </div>
    <div class="sheet-body"></div>
    ${footer ? html`<div class="sheet-foot">${footer}</div>` : ''}
  `);
  const body = el.querySelector('.sheet-body');
  if (typeof content === 'function') content(body, el);
  else if (content) mount(body, content);
  host.append(backdrop, el);
  lockBody();
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => el.querySelector('[autofocus]')?.focus() || el.querySelector('[data-close]').focus());

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    el.classList.add('closing');
    backdrop.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHash);
    setTimeout(() => { el.remove(); backdrop.remove(); unlockBody(); prevFocus?.focus?.({ preventScroll: true }); }, 150);
    onClose?.(result);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onHash = () => close();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);
  backdrop.addEventListener('click', () => close());
  on(el, 'click', '[data-close]', () => close());

  // Deslizar hacia abajo desde el "grip" o el encabezado para cerrar.
  let startY = null;
  const head = el.querySelector('.sheet-head');
  [head, el.querySelector('.sheet-grip')].forEach((h) => {
    h.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    h.addEventListener('touchmove', (e) => {
      if (startY === null) return;
      const dy = Math.max(0, e.touches[0].clientY - startY);
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
    }, { passive: true });
    h.addEventListener('touchend', (e) => {
      const dy = (e.changedTouches[0].clientY - startY) || 0;
      startY = null;
      el.style.transform = '';
      if (dy > 90) close();
    });
  });

  return { el, body, close };
}

/** Confirmación. Resuelve true/false. */
export function confirmDialog({ title = '¿Seguro?', message = '', confirm = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet({
      title,
      content: html`<p class="muted">${message}</p>`,
      footer: html`
        <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-ok autofocus>${confirm}</button>`,
      onClose: () => { if (!answered) resolve(false); }
    });
    s.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); s.close(); });
  });
}
