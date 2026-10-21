/** Arranque de phcontrol. */
import { openDB, requestPersistence } from './data/db.js';
import { loadAll, bus } from './data/store.js';
import { loadConnection } from './data/api.js';
import { initSync, getStatus, syncNow } from './data/sync.js';
import { startRouter, navigate } from './router.js';
import { toast } from './ui/toast.js';
import { initTheme } from './ui/theme.js';

const LABELS = {
  ok: 'Sincronizado',
  pendiente: (n) => `Pendiente (${n})`,
  sincronizando: 'Sincronizando…',
  offline: 'Sin conexión',
  error: 'Error',
  sin_configurar: 'Sin conectar'
};

function paintSync(st) {
  const pill = document.getElementById('sync-pill');
  const label = typeof LABELS[st.state] === 'function' ? LABELS[st.state](st.pending) : LABELS[st.state];
  const text = st.state === 'offline' && st.pending ? `Sin conexión · ${st.pending}` : label;
  pill.dataset.state = st.state;
  pill.querySelector('.sync-text').textContent = text;
  pill.setAttribute('aria-label', `Estado de sincronización: ${text}${st.error ? '. ' + st.error : ''}`);
}

function setupSyncPill() {
  bus.addEventListener('sync', (e) => paintSync(e.detail));
  paintSync(getStatus());
  document.getElementById('sync-pill').addEventListener('click', async () => {
    const st = getStatus();
    if (st.state === 'sin_configurar') { navigate('#/ajustes'); return; }
    if (st.state === 'offline') { toast(st.pending ? `${st.pending} cambio(s) guardados en el teléfono. Se suben al volver la señal.` : 'Sin conexión. Podés seguir trabajando.'); return; }
    if (st.state === 'error') toast(st.error || 'Error de sincronización', { action: 'Ver', onAction: () => navigate('#/ajustes') });
    await syncNow();
  });
}

/** iOS: con el teclado abierto, visualViewport se achica. Escondemos la tabbar y llevamos el campo a la vista. */
function setupKeyboard() {
  const vv = window.visualViewport;
  if (vv) {
    const check = () => document.body.classList.toggle('kb-open', vv.height < window.innerHeight * 0.78);
    vv.addEventListener('resize', check);
  }
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches?.('input, textarea, select')) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  });
}

function setupHeader() {
  const header = document.getElementById('app-header');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { header.classList.toggle('scrolled', window.scrollY > 4); ticking = false; });
  }, { passive: true });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // En desarrollo local el SW cachearía el código viejo: se activa solo con ?sw=1.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw=1')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ask = (worker) => toast('Hay una versión nueva de phcontrol.', {
      action: 'Actualizar', duration: 15000,
      onAction: () => worker.postMessage({ type: 'SKIP_WAITING' })
    });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60000);
  }).catch((e) => console.warn('SW no registrado', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

function hideSplash() {
  const s = document.getElementById('splash');
  s.classList.add('hide');
  setTimeout(() => s.remove(), 450);
}

/** Aviso cuando se intenta cerrar con cambios sin subir (iOS puede borrar datos de PWAs poco usadas). */
function setupUnloadWarning() {
  window.addEventListener('beforeunload', (e) => {
    if (getStatus().pending > 0) { e.preventDefault(); e.returnValue = ''; }
  });
}

async function boot() {
  registerSW();
  initTheme();
  setupHeader();
  setupKeyboard();
  try {
    await openDB();
    await Promise.all([loadAll(), loadConnection()]);
  } catch (e) {
    hideSplash();
    document.getElementById('view').innerHTML =
      '<div class="error-state" role="alert"><h3>No se pudo abrir la base local</h3><p>Cerrá otras pestañas de phcontrol y volvé a abrir. Si usás modo privado de Safari, salí de ese modo.</p></div>';
    return;
  }
  requestPersistence();
  setupSyncPill();
  initSync();
  setupUnloadWarning();
  startRouter();
  setTimeout(hideSplash, 250);
}

boot();
