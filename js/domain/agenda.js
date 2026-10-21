/**
 * Agenda. Las visitas recurrentes se guardan como filas concretas (una por fecha) que comparten
 * `serie_id`. Así cada ocurrencia tiene su propio estado y se puede reprogramar sola,
 * funciona offline y se ve tal cual en la hoja.
 */
import { all, get, save, saveMany } from '../data/store.js';
import { addDays, addMonths, timeToMin, today, nowTime, uid, fullName } from '../util/format.js';

export const ESTADOS = {
  pendiente: { label: 'Pendiente', color: 'var(--st-pendiente)', badge: 'info' },
  hecha: { label: 'Hecha', color: 'var(--st-hecha)', badge: 'ok' },
  cancelada: { label: 'Cancelada', color: 'var(--st-cancelada)', badge: '' },
  reprogramada: { label: 'Reprogramada', color: 'var(--st-reprogramada)', badge: 'warn' }
};
export const RECURRENCIAS = { unica: 'Única', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };

export const isActive = (a) => a.estado === 'pendiente' || a.estado === 'reprogramada';

/** Fechas de una serie desde `inicio` hasta `hasta` (incluido). */
export function seriesDates(inicio, recurrencia, hasta) {
  if (recurrencia === 'unica' || !hasta) return [inicio];
  const out = [];
  let d = inicio;
  let i = 0;
  while (d <= hasta && i < 120) {
    out.push(d);
    i++;
    d = recurrencia === 'semanal' ? addDays(inicio, 7 * i) : recurrencia === 'quincenal' ? addDays(inicio, 14 * i) : addMonths(inicio, i);
  }
  return out;
}

/** Turnos de agenda que se pisan con [fecha, hora, duracion], excluyendo ids dados. */
export function overlaps(fecha, hora, duracion, excludeIds = []) {
  const s = timeToMin(hora);
  const e = s + (Number(duracion) || 0);
  return all('agenda').filter((a) => a.fecha === fecha && isActive(a) && !excludeIds.includes(a.id)).filter((a) => {
    const as = timeToMin(a.hora);
    const ae = as + (Number(a.duracion) || 0);
    return s < ae && as < e;
  });
}

export async function createSeries(data, hasta) {
  const fechas = seriesDates(data.fecha, data.recurrencia, hasta);
  const serie_id = fechas.length > 1 ? uid('ser_') : '';
  return saveMany('agenda', fechas.map((fecha) => ({ ...data, fecha, serie_id, estado: 'pendiente' })));
}

/** Aplica cambios a esta ocurrencia o a esta y las siguientes de la serie. */
export async function updateOccurrence(item, patch, scope = 'una') {
  if (scope === 'una' || !item.serie_id) return save('agenda', { ...item, ...patch });
  const siguientes = all('agenda').filter((a) => a.serie_id === item.serie_id && a.fecha >= item.fecha && isActive(a));
  const { fecha, ...rest } = patch; // la fecha solo se cambia en la ocurrencia elegida
  const out = [];
  for (const a of siguientes) out.push(await save('agenda', { ...a, ...rest, ...(a.id === item.id && fecha ? { fecha } : {}) }));
  return out;
}

export async function cancelOccurrence(item, scope = 'una') {
  return updateOccurrence(item, { estado: 'cancelada' }, scope);
}

/** Próximas visitas activas desde ahora. */
export function upcoming(days = 7) {
  const t = today();
  const now = nowTime();
  const limit = addDays(t, days);
  return all('agenda')
    .filter((a) => isActive(a) && a.fecha <= limit && (a.fecha > t || (a.fecha === t && (a.hora || '23:59') >= minus(now, 60))))
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}
function minus(t, m) { const x = Math.max(0, timeToMin(t) - m); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; }

/** Turnos vencidos: pendientes con fecha pasada. */
export function overdue() {
  const t = today();
  return all('agenda').filter((a) => isActive(a) && a.fecha < t).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function label(a) {
  const c = get('clientes', a.cliente_id);
  return fullName(c);
}
