/** Estadísticas de ingresos por período, con comparación contra el período anterior. */
import { all } from '../data/store.js';
import { addDays, addMonths, startOfWeek, startOfMonth, seasonOf, today, parseDate, MESES_CORTOS, DIAS_CORTOS_LIST, diffDays } from '../util/format.js';

export const PERIODOS = { semana: 'Semana', mes: 'Mes', anio: 'Año', temporada: 'Temporada' };

/** Rango [from, to] del período que contiene `ref`, y el anterior. */
export function periodRange(kind, ref = today()) {
  if (kind === 'semana') {
    const from = startOfWeek(ref);
    return { from, to: addDays(from, 6), prev: { from: addDays(from, -7), to: addDays(from, -1) }, label: 'esta semana' };
  }
  if (kind === 'mes') {
    const from = startOfMonth(ref);
    const to = addDays(addMonths(from, 1), -1);
    const pf = addMonths(from, -1);
    return { from, to, prev: { from: pf, to: addDays(from, -1) }, label: 'este mes' };
  }
  if (kind === 'anio') {
    const y = Number(ref.slice(0, 4));
    return { from: `${y}-01-01`, to: `${y}-12-31`, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, label: 'este año' };
  }
  const s = seasonOf(ref);
  const py = Number(s.from.slice(0, 4)) - 1;
  return { from: s.from, to: s.to, prev: { from: `${py}-10-01`, to: `${py + 1}-03-31` }, label: s.label.toLowerCase() };
}

const inRange = (d, r) => d >= r.from && d <= r.to;

export function totals(range) {
  const vis = all('visitas').filter((v) => inRange(v.fecha, range));
  const ven = all('ventas').filter((v) => inRange(v.fecha, range));
  const cobradoVisitas = vis.filter((v) => v.estado_pago === 'pagado').reduce((s, v) => s + (Number(v.monto) || 0), 0);
  const cobradoVentas = ven.filter((v) => v.estado_pago !== 'pendiente').reduce((s, v) => s + (Number(v.monto) || 0), 0);
  return { visitas: cobradoVisitas, ventas: cobradoVentas, total: cobradoVisitas + cobradoVentas, cantidadVisitas: vis.length };
}

export function delta(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Series para el gráfico: buckets diarios (semana/mes) o mensuales (año/temporada). */
export function series(kind, range) {
  const buckets = [];
  if (kind === 'semana' || kind === 'mes') {
    const n = diffDays(range.to, range.from) + 1;
    for (let i = 0; i < n; i++) {
      const d = addDays(range.from, i);
      buckets.push({ key: d, from: d, to: d, label: kind === 'semana' ? DIAS_CORTOS_LIST[i] : String(parseDate(d).getUTCDate()) });
    }
  } else {
    let m = range.from.slice(0, 7) + '-01';
    while (m <= range.to) {
      const to = addDays(addMonths(m, 1), -1);
      buckets.push({ key: m, from: m, to, label: MESES_CORTOS[parseDate(m).getUTCMonth()] });
      m = addMonths(m, 1);
    }
  }
  const vis = all('visitas').filter((v) => v.estado_pago === 'pagado');
  const ven = all('ventas').filter((v) => v.estado_pago !== 'pendiente');
  return buckets.map((b) => ({
    label: b.label,
    visitas: vis.filter((v) => inRange(v.fecha, b)).reduce((s, v) => s + (Number(v.monto) || 0), 0),
    ventas: ven.filter((v) => inRange(v.fecha, b)).reduce((s, v) => s + (Number(v.monto) || 0), 0)
  }));
}

/** Deudas: todo lo pendiente de cobro (sin importar el período). */
export function debts() {
  const items = [
    ...all('visitas').filter((v) => v.estado_pago === 'pendiente' && Number(v.monto) > 0).map((v) => ({ tipo: 'visita', ...v })),
    ...all('ventas').filter((v) => v.estado_pago === 'pendiente' && Number(v.monto) > 0).map((v) => ({ tipo: 'venta', ...v }))
  ];
  const porCliente = new Map();
  for (const it of items) {
    const k = it.cliente_id || '_sin';
    const cur = porCliente.get(k) || { cliente_id: it.cliente_id, total: 0, items: 0, desde: it.fecha };
    cur.total += Number(it.monto) || 0;
    cur.items++;
    if (it.fecha < cur.desde) cur.desde = it.fecha;
    porCliente.set(k, cur);
  }
  return { total: items.reduce((s, i) => s + (Number(i.monto) || 0), 0), porCliente: [...porCliente.values()].sort((a, b) => b.total - a.total) };
}
