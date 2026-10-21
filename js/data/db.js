/** Envoltorio mínimo de IndexedDB con promesas. */
import { ENTITIES } from './schema.js';

const DB_NAME = 'phcontrol';
const DB_VERSION = 1;
let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.keys(ENTITIES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base local está bloqueada por otra pestaña abierta.'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transacción abortada'));
  });
}

export const idb = {
  get: (store, key) => tx([store], 'readonly', (t) => wrap(t.objectStore(store).get(key))),
  getAll: (store) => tx([store], 'readonly', (t) => wrap(t.objectStore(store).getAll())),
  put: (store, value) => tx([store], 'readwrite', (t) => wrap(t.objectStore(store).put(value))),
  putMany: (store, values) => tx([store], 'readwrite', (t) => { const s = t.objectStore(store); values.forEach((v) => s.put(v)); }),
  del: (store, key) => tx([store], 'readwrite', (t) => wrap(t.objectStore(store).delete(key))),
  delMany: (store, keys) => tx([store], 'readwrite', (t) => { const s = t.objectStore(store); keys.forEach((k) => s.delete(k)); }),
  clear: (store) => tx([store], 'readwrite', (t) => wrap(t.objectStore(store).clear())),
  count: (store) => tx([store], 'readonly', (t) => wrap(t.objectStore(store).count())),
  /** Escribe un registro y su entrada de cola en UNA transacción: nunca queda uno sin el otro. */
  putWithQueue: (store, value, queueEntry) => tx([store, 'cola'], 'readwrite', (t) => {
    t.objectStore(store).put(value);
    t.objectStore('cola').add(queueEntry);
  }),
  kvGet: async (k, def = null) => { const r = await idb.get('kv', k); return r ? r.v : def; },
  kvSet: (k, v) => idb.put('kv', { k, v }),
  kvDel: (k) => idb.del('kv', k)
};

/** Pide almacenamiento persistente (en iOS reduce el riesgo de que se borre). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* opcional */ }
}
