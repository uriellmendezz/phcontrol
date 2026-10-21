/**
 * Repositorio local: caché en memoria + IndexedDB + cola de sincronización.
 * Toda escritura queda primero en el dispositivo; la sincronización con Sheets es posterior.
 */
import { idb } from './db.js';
import { ENTITIES, normalize } from './schema.js';
import { uid } from '../util/format.js';

export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

const cache = {};
let loaded = false;
let onWrite = () => {};

/** sync.js registra acá su "programar sincronización" para evitar dependencias circulares. */
export function setWriteHook(fn) { onWrite = fn; }

export async function loadAll() {
  await Promise.all(Object.keys(ENTITIES).map(async (e) => {
    const rows = await idb.getAll(e);
    cache[e] = new Map(rows.map((r) => [r.id, normalize(e, r)])); // corrige datos viejos (p. ej. horas 1899-12-30)
  }));
  loaded = true;
}
export const isLoaded = () => loaded;

/** Registros activos (no eliminados). */
export function all(entity) {
  return [...(cache[entity]?.values() || [])].filter((r) => !r.eliminado);
}
export function get(entity, id) {
  const r = cache[entity]?.get(id);
  return r && !r.eliminado ? r : null;
}
export function getRaw(entity, id) { return cache[entity]?.get(id) || null; }

const PREFIX = { clientes: 'cli_', piletas: 'pil_', visitas: 'vis_', agenda: 'age_', stock: 'stk_', ventas: 'ven_', compras: 'com_', config: '' };

/** Crea o actualiza. Devuelve el registro guardado. */
export async function save(entity, data) {
  if (!ENTITIES[entity]) throw new Error(`Entidad desconocida: ${entity}`);
  const now = new Date().toISOString();
  const prev = data.id ? cache[entity].get(data.id) : null;
  const rec = normalize(entity, {
    ...(prev || {}),
    ...data,
    id: data.id || uid(PREFIX[entity]),
    creado_en: prev?.creado_en || now,
    actualizado_en: now,
    eliminado: false
  });
  await idb.putWithQueue(entity, rec, { entity, id: rec.id, t: now });
  cache[entity].set(rec.id, rec);
  emit('change', { entity, id: rec.id });
  onWrite();
  return rec;
}

/** Varias escrituras seguidas (una sola notificación). */
export async function saveMany(entity, list) {
  const out = [];
  for (const d of list) out.push(await save(entity, d));
  return out;
}

/** Borrado lógico (eliminado = TRUE) para que el borrado viaje a la hoja y a otros dispositivos. */
export async function remove(entity, id) {
  const prev = cache[entity].get(id);
  if (!prev) return;
  const now = new Date().toISOString();
  const rec = { ...prev, eliminado: true, actualizado_en: now };
  await idb.putWithQueue(entity, rec, { entity, id, t: now });
  cache[entity].set(id, rec);
  emit('change', { entity, id });
  onWrite();
}

/** Aplica un registro llegado del servidor (sin encolar). */
export async function applyRemote(entity, rec) {
  await idb.put(entity, rec);
  cache[entity].set(rec.id, rec);
}

/** Actualiza localmente sin encolar (p. ej. reemplazar referencia de foto ya subida). */
export async function putLocal(entity, rec) {
  await idb.put(entity, rec);
  cache[entity].set(rec.id, rec);
}

/* ---------- Consultas de dominio frecuentes ---------- */

export const clientes = () => all('clientes').sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'));
export const piletasDe = (clienteId) => all('piletas').filter((p) => p.cliente_id === clienteId);
export const visitasDe = (clienteId) => all('visitas').filter((v) => v.cliente_id === clienteId).sort(byDateDesc);
export function byDateDesc(a, b) { return `${b.fecha} ${b.hora || ''}`.localeCompare(`${a.fecha} ${a.hora || ''}`); }
export function byDateAsc(a, b) { return `${a.fecha} ${a.hora || ''}`.localeCompare(`${b.fecha} ${b.hora || ''}`); }

/** Saldo pendiente de un cliente: visitas y ventas impagas. */
export function saldoCliente(clienteId) {
  const v = all('visitas').filter((x) => x.cliente_id === clienteId && x.estado_pago === 'pendiente').reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const ve = all('ventas').filter((x) => x.cliente_id === clienteId && x.estado_pago === 'pendiente').reduce((s, x) => s + (Number(x.monto) || 0), 0);
  return v + ve;
}

/**
 * Convierte la referencia "nuevo:<nombre>" del buscador en un cliente borrador real y devuelve su id.
 * Si ya es un id, lo devuelve tal cual.
 */
export async function ensureCliente(ref, origen = '') {
  if (typeof ref !== 'string' || !ref.startsWith('nuevo:')) return ref;
  const [nombre, ...resto] = ref.slice(6).trim().split(/\s+/);
  const c = await save('clientes', {
    nombre, apellido: resto.join(' '), estado: 'borrador', tarifa_tipo: '',
    notas: origen ? `Creado desde ${origen}. Completá los datos del cliente.` : ''
  });
  return c.id;
}

/** Ajusta el stock de un producto en delta (negativo = consumo). */
export async function ajustarStock(productoId, delta) {
  const p = get('stock', productoId);
  if (!p || !delta) return;
  const cantidad = Math.round(((Number(p.cantidad) || 0) + delta) * 1000) / 1000;
  await save('stock', { ...p, cantidad });
}
