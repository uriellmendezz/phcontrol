/**
 * Sincronización con Google Sheets.
 *
 * 1) PUSH: se recorre la cola (IndexedDB). Por cada registro pendiente se suben primero sus
 *    fotos locales a Drive, luego se manda el registro completo (el más reciente).
 * 2) PULL: se piden los cambios del servidor desde el último cursor (`servidor_en`).
 *
 * Conflictos: "el último en escribir gana" según `actualizado_en`. El servidor descarta un
 * registro más viejo que el suyo y devuelve el suyo; acá se aplica. En el pull, un registro
 * remoto no pisa a uno local con cambios todavía en la cola.
 */
import { idb } from './db.js';
import { call, isConfigured } from './api.js';
import { ENTITIES, SHEET_TO_ENTITY, normalize, serialize } from './schema.js';
import { emit, applyRemote, putLocal, getRaw, setWriteHook } from './store.js';
import { upload, isLocalRef } from './photos.js';

const PHOTO_FIELDS = { visitas: ['foto_antes', 'foto_despues'], piletas: ['foto'] };
const BATCH = 80;

const status = { state: 'ok', pending: 0, error: '', lastSync: null, failed: [] };
let running = null;
let timer = null;
let backoff = 0;

export const getStatus = () => ({ ...status });

function setStatus(patch) {
  Object.assign(status, patch);
  emit('sync', getStatus());
}

export async function refreshPending() {
  const n = await idb.count('cola');
  const state = !isConfigured() ? 'sin_configurar'
    : !navigator.onLine ? 'offline'
      : status.state === 'sincronizando' ? 'sincronizando'
        : status.state === 'error' ? 'error'
          : n ? 'pendiente' : 'ok';
  setStatus({ pending: n, state });
  return n;
}

/** Programa una sincronización pronto (agrupa escrituras seguidas). */
export function schedule(delay = 1500) {
  clearTimeout(timer);
  refreshPending();
  timer = setTimeout(() => syncNow().catch(() => {}), delay);
}
setWriteHook(() => schedule());

export function syncNow() {
  if (running) return running;
  running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  if (!isConfigured()) { await refreshPending(); return; }
  if (!navigator.onLine) { await refreshPending(); return; }
  setStatus({ state: 'sincronizando', error: '' });
  try {
    const failed = await push();
    await pull();
    backoff = 0;
    const lastSync = new Date().toISOString();
    await idb.kvSet('lastSync', lastSync);
    setStatus({ state: failed.length ? 'error' : 'ok', lastSync, failed, error: failed.length ? `${failed.length} registro(s) rechazados por la hoja` : '' });
    await refreshPending();
    emit('change', { entity: '*' });
  } catch (e) {
    setStatus({ state: 'error', error: e.message || String(e) });
    await refreshPending();
    backoff = Math.min(backoff ? backoff * 2 : 30000, 5 * 60000);
    clearTimeout(timer);
    timer = setTimeout(() => syncNow().catch(() => {}), backoff);
  }
}

async function push() {
  const queue = await idb.getAll('cola');
  if (!queue.length) return [];
  // Agrupa por registro: se manda una sola vez la versión actual.
  const byKey = new Map();
  for (const q of queue) {
    const k = `${q.entity}|${q.id}`;
    const prev = byKey.get(k);
    byKey.set(k, { entity: q.entity, id: q.id, seqs: [...(prev?.seqs || []), q.seq] });
  }
  const items = [...byKey.values()];
  const failed = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const ops = [];
    const sent = [];
    for (const it of chunk) {
      let rec = getRaw(it.entity, it.id) || await idb.get(it.entity, it.id);
      if (!rec) { await idb.delMany('cola', it.seqs); continue; }
      rec = await uploadPhotosOf(it.entity, rec);
      ops.push({ entity: ENTITIES[it.entity].sheet, record: serialize(it.entity, rec) });
      sent.push(it);
    }
    if (!ops.length) continue;
    const res = await call('push', { ops }, { timeout: 90000 });
    for (let j = 0; j < sent.length; j++) {
      const r = res.results[j];
      const it = sent[j];
      if (r?.ok) {
        await idb.delMany('cola', it.seqs);
        if (r.record) {
          const local = getRaw(it.entity, it.id);
          const remote = normalize(it.entity, r.record);
          // Si el servidor tenía algo más nuevo, gana el servidor.
          if (r.skipped || !local || remote.actualizado_en >= local.actualizado_en) {
            if (!(await hasNewerQueue(it))) await applyRemote(it.entity, { ...local, ...remote });
          }
        }
      } else {
        failed.push({ entity: it.entity, id: it.id, error: r?.error || 'Error desconocido' });
      }
    }
  }
  return failed;
}

async function hasNewerQueue(it) {
  const queue = await idb.getAll('cola');
  return queue.some((q) => q.entity === it.entity && q.id === it.id && !it.seqs.includes(q.seq));
}

async function uploadPhotosOf(entity, rec) {
  const fields = PHOTO_FIELDS[entity];
  if (!fields) return rec;
  let changed = false;
  const next = { ...rec };
  for (const f of fields) {
    if (isLocalRef(next[f])) {
      const fileId = await upload(next[f]);
      next[f] = fileId || '';
      changed = true;
    }
  }
  if (changed) await putLocal(entity, next);
  return next;
}

async function pull() {
  const since = await idb.kvGet('lastPull', '');
  const res = await call('pull', { since }, { timeout: 90000 });
  const queue = await idb.getAll('cola');
  const pendingKeys = new Set(queue.map((q) => `${q.entity}|${q.id}`));
  for (const [sheet, rows] of Object.entries(res.data || {})) {
    const entity = SHEET_TO_ENTITY[sheet];
    if (!entity) continue;
    for (const row of rows) {
      if (!row.id || pendingKeys.has(`${entity}|${row.id}`)) continue;
      const remote = normalize(entity, row);
      const local = getRaw(entity, row.id);
      if (!local || String(remote.actualizado_en) >= String(local.actualizado_en)) {
        await applyRemote(entity, remote);
      }
    }
  }
  await idb.kvSet('lastPull', res.now);
}

/** Descarta de la cola los registros rechazados (para destrabar la sincronización). */
export async function discardFailed() {
  const queue = await idb.getAll('cola');
  const bad = new Set(status.failed.map((f) => `${f.entity}|${f.id}`));
  await idb.delMany('cola', queue.filter((q) => bad.has(`${q.entity}|${q.id}`)).map((q) => q.seq));
  setStatus({ failed: [], state: 'ok', error: '' });
  await refreshPending();
}

/** Vuelve a bajar todo desde cero (útil al instalar en un dispositivo nuevo). */
export async function fullResync() {
  await idb.kvDel('lastPull');
  return syncNow();
}

export async function getQueue() { return idb.getAll('cola'); }

export function initSync() {
  window.addEventListener('online', () => { refreshPending(); schedule(500); });
  window.addEventListener('offline', () => refreshPending());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(800); });
  setInterval(() => { if (status.pending && navigator.onLine && !running) syncNow().catch(() => {}); }, 60000);
  idb.kvGet('lastSync').then((t) => setStatus({ lastSync: t }));
  refreshPending();
  schedule(1200);
}
