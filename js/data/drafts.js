/** Borradores de formularios: se guardan mientras escribís y se recuperan si se cierra la app. */
import { idb } from './db.js';

const key = (k) => `draft:${k}`;

export const getDraft = (k) => idb.kvGet(key(k));
export const saveDraft = (k, data) => idb.kvSet(key(k), { data, t: Date.now() });
export const clearDraft = (k) => idb.kvDel(key(k));
