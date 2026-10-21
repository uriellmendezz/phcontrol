/**
 * Calculadora de químicos.
 *
 * Regla: no se inventan datos técnicos. Los únicos valores por defecto son los rangos
 * objetivo (pH 7,2–7,6 · cloro libre 1–3 ppm · alcalinidad 80–120 ppm · estabilizante 30–50 ppm).
 * Las concentraciones y dosis de cada producto las cargás vos desde la etiqueta.
 *
 * Modelos de dosificación (campo `modo` del producto):
 *  - concentracion: el producto aporta X de principio activo (cloro o ácido cianúrico).
 *      1 ppm = 1 g por m³  →  gramos activos = Δppm × m³  →  producto = activos ÷ concentración.
 *  - efecto: según la etiqueta, `dosis_cant` (unidad del producto) cada `dosis_m3` m³
 *      cambia el parámetro en `dosis_efecto` (unidades de pH o ppm).
 *      producto = (|Δ| ÷ efecto) × dosis_cant × (m³ ÷ dosis_m3).
 *  - fija: dosis de etiqueta de mantenimiento (`dosis_cant`) o de choque (`dosis_choque`) cada `dosis_m3` m³.
 *  - pastilla: 1 pastilla cada `dosis_m3` m³ (pastillas para boya).
 */
import { num } from '../util/format.js';

export const PARAMS = {
  ph: { label: 'pH', unit: '', short: 'pH' },
  cloro: { label: 'Cloro libre', unit: 'ppm', short: 'Cl' },
  alcalinidad: { label: 'Alcalinidad total', unit: 'ppm', short: 'AT' },
  estabilizante: { label: 'Estabilizante (ácido cianúrico)', unit: 'ppm', short: 'CYA' }
};

/** Tipos de producto. Ninguno trae concentraciones ni dosis: se completan desde la etiqueta. */
export const TIPOS = {
  cloro_liquido: { label: 'Cloro líquido concentrado (hipoclorito de sodio)', modo: 'concentracion', parametro: 'cloro', sentido: 'sube', unidad: 'L', conc_unidad: 'g/L', sugerido: 'Cloro líquido concentrado (bidón 20 L)' },
  cloro_granulado_rapido: { label: 'Cloro granulado de disolución rápida', modo: 'concentracion', parametro: 'cloro', sentido: 'sube', unidad: 'kg', conc_unidad: '%', sugerido: 'Cloro granulado disolución rápida' },
  cloro_granulado_lento: { label: 'Cloro granulado de disolución lenta', modo: 'concentracion', parametro: 'cloro', sentido: 'sube', unidad: 'kg', conc_unidad: '%', sugerido: 'Cloro granulado disolución lenta' },
  pastilla_triple: { label: 'Pastillas triple acción 200 g (boya)', modo: 'pastilla', parametro: 'cloro', sentido: 'sube', unidad: 'unidad', sugerido: 'Pastillas triple acción 200 g' },
  ph_mas: { label: 'Regulador de pH+ (elevador)', modo: 'efecto', parametro: 'ph', sentido: 'sube', unidad: 'kg', sugerido: 'Regulador de pH+' },
  ph_menos: { label: 'Regulador de pH− (reductor)', modo: 'efecto', parametro: 'ph', sentido: 'baja', unidad: 'kg', sugerido: 'Regulador de pH−' },
  acido_muriatico: { label: 'Ácido muriático', modo: 'efecto', parametro: 'ph', sentido: 'baja', unidad: 'L', sugerido: 'Ácido muriático' },
  clarificante: { label: 'Clarificante', modo: 'fija', parametro: '', sentido: '', unidad: 'L', sugerido: 'Clarificante' },
  floculante: { label: 'Floculante', modo: 'fija', parametro: '', sentido: '', unidad: 'L', sugerido: 'Floculante' },
  alguicida: { label: 'Alguicida', modo: 'fija', parametro: '', sentido: '', unidad: 'L', sugerido: 'Alguicida' },
  estabilizante: { label: 'Estabilizante (ácido cianúrico)', modo: 'concentracion', parametro: 'estabilizante', sentido: 'sube', unidad: 'kg', conc_unidad: '%' },
  alcalinidad_mas: { label: 'Elevador de alcalinidad', modo: 'efecto', parametro: 'alcalinidad', sentido: 'sube', unidad: 'kg' },
  otro: { label: 'Otro producto', modo: 'fija', parametro: '', sentido: '', unidad: 'unidad' }
};
export const TIPOS_SUGERIDOS = ['cloro_liquido', 'cloro_granulado_rapido', 'cloro_granulado_lento', 'pastilla_triple', 'ph_mas', 'ph_menos', 'acido_muriatico', 'clarificante', 'floculante', 'alguicida'];

export const UNIDADES = ['L', 'mL', 'kg', 'g', 'unidad'];
const isVol = (u) => u === 'L' || u === 'mL';
const isMass = (u) => u === 'kg' || u === 'g';

export const SEGURIDAD = [
  'Nunca mezcles productos químicos entre sí (en especial cloro con ácido): pueden liberar gases tóxicos.',
  'Agregá siempre el producto al agua, nunca agua sobre el producto. Diluí en un balde con agua de la pileta cuando la etiqueta lo indique.',
  'Dosificá en etapas: aplicá una parte, dejá filtrar y volvé a medir antes de completar.',
  'Usá guantes y antiparras. Guardá los productos separados, cerrados y lejos del sol y de los chicos.',
  'Respetá los tiempos de espera de la etiqueta antes de que alguien se bañe.'
];
export const DISCLAIMER = 'Es una guía de cálculo con los datos que cargaste. Validala siempre con una nueva medición y con la etiqueta del producto.';

export function midpoint([a, b]) { return Math.round(((a + b) / 2) * 100) / 100; }

/** Qué campos faltan para poder calcular con este producto. */
export function missingFields(p, { choque = false } = {}) {
  const miss = [];
  const empty = (v) => v === '' || v === null || v === undefined || isNaN(v) || Number(v) <= 0;
  if (p.modo === 'concentracion') { if (empty(p.conc_valor)) miss.push('concentración'); if (!p.conc_unidad) miss.push('unidad de concentración'); }
  if (p.modo === 'efecto') { if (empty(p.dosis_cant)) miss.push('dosis'); if (empty(p.dosis_m3)) miss.push('m³ de referencia'); if (empty(p.dosis_efecto)) miss.push('efecto de la dosis'); }
  if (p.modo === 'fija') { if (empty(choque ? p.dosis_choque : p.dosis_cant)) miss.push(choque ? 'dosis de choque' : 'dosis de mantenimiento'); if (empty(p.dosis_m3)) miss.push('m³ de referencia'); }
  if (p.modo === 'pastilla') { if (empty(p.dosis_m3)) miss.push('m³ por pastilla'); }
  if (!p.unidad) miss.push('unidad');
  return miss;
}

function fromGrams(g, unit) { return unit === 'kg' ? g / 1000 : g; }
function fromLiters(l, unit) { return unit === 'mL' ? l * 1000 : l; }
const r = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Cantidad de producto para subir `delta` ppm en `m3` m³ con modelo "concentracion".
 * Devuelve { cantidad, unidad, formula } o { error }.
 */
export function doseConcentration(p, delta, m3) {
  const activos = delta * m3; // g (1 ppm = 1 g/m³)
  const c = Number(p.conc_valor);
  const u = p.unidad;
  const lines = [`Activo necesario = ${num(delta)} ppm × ${num(m3)} m³ = ${num(activos)} g (1 ppm = 1 g/m³)`];
  let cantidad;
  if (p.conc_unidad === 'g/L') {
    if (!isVol(u)) return { error: 'Con concentración en g/L, la unidad del producto tiene que ser L o mL.' };
    const litros = activos / c;
    cantidad = fromLiters(litros, u);
    lines.push(`Producto = ${num(activos)} g ÷ ${num(c)} g/L = ${num(litros)} L`);
  } else if (p.conc_unidad === '%') {
    if (isMass(u)) {
      const gramos = activos / (c / 100);
      cantidad = fromGrams(gramos, u);
      lines.push(`Producto = ${num(activos)} g ÷ ${num(c)} % = ${num(gramos)} g`);
    } else if (isVol(u)) {
      const litros = activos / (c * 10); // % p/v = g cada 100 mL = c×10 g/L
      cantidad = fromLiters(litros, u);
      lines.push(`Producto = ${num(activos)} g ÷ (${num(c)} % p/v = ${num(c * 10)} g/L) = ${num(litros)} L`);
    } else return { error: 'La unidad del producto no es compatible con una concentración en %.' };
  } else return { error: 'Falta la unidad de concentración.' };
  return { cantidad: r(cantidad), unidad: u, formula: lines };
}

export function doseEffect(p, delta, m3) {
  const veces = Math.abs(delta) / Number(p.dosis_efecto);
  const cantidad = veces * Number(p.dosis_cant) * (m3 / Number(p.dosis_m3));
  return {
    cantidad: r(cantidad), unidad: p.unidad,
    formula: [
      `Etiqueta: ${num(p.dosis_cant)} ${p.unidad} cada ${num(p.dosis_m3)} m³ cambia ${num(p.dosis_efecto)} ${p.parametro === 'ph' ? 'de pH' : 'ppm'}`,
      `Producto = (${num(Math.abs(delta))} ÷ ${num(p.dosis_efecto)}) × ${num(p.dosis_cant)} ${p.unidad} × (${num(m3)} m³ ÷ ${num(p.dosis_m3)} m³) = ${num(cantidad)} ${p.unidad}`
    ]
  };
}

export function doseFixed(p, m3, { choque = false } = {}) {
  const base = Number(choque ? p.dosis_choque : p.dosis_cant);
  const cantidad = base * (m3 / Number(p.dosis_m3));
  return {
    cantidad: r(cantidad), unidad: p.unidad,
    formula: [`Producto = ${num(base)} ${p.unidad} × (${num(m3)} m³ ÷ ${num(p.dosis_m3)} m³) = ${num(cantidad)} ${p.unidad} (dosis ${choque ? 'de choque' : 'de mantenimiento'} de la etiqueta)`]
  };
}

export function doseTablet(p, m3) {
  const exact = m3 / Number(p.dosis_m3);
  const cantidad = Math.max(1, Math.ceil(exact));
  return { cantidad, unidad: 'unidad', formula: [`Pastillas = ${num(m3)} m³ ÷ ${num(p.dosis_m3)} m³ por pastilla = ${num(exact)} → ${cantidad}`] };
}

/** Dosis de un producto para un cambio de parámetro. */
export function doseFor(p, delta, m3) {
  const miss = missingFields(p);
  if (miss.length) return { missing: miss };
  if (p.modo === 'concentracion') return doseConcentration(p, delta, m3);
  if (p.modo === 'efecto') return doseEffect(p, delta, m3);
  if (p.modo === 'pastilla') return doseTablet(p, m3);
  return doseFixed(p, m3);
}

/**
 * Recomendaciones para todos los parámetros medidos.
 * medidos: {ph, cloro, alcalinidad, estabilizante} (números o '')
 * objetivos: {param: número} (si falta, el punto medio del rango)
 */
export function recommend({ m3, medidos, rangos, objetivos = {}, productos }) {
  const order = ['alcalinidad', 'ph', 'cloro', 'estabilizante'];
  const out = [];
  for (const param of order) {
    const v = medidos[param];
    if (v === '' || v === null || v === undefined || isNaN(v)) continue;
    const [min, max] = rangos[param];
    const item = { param, value: v, range: [min, max], label: PARAMS[param].label, unit: PARAMS[param].unit };
    if (v >= min && v <= max) { out.push({ ...item, status: 'ok' }); continue; }
    const target = objetivos[param] !== undefined && objetivos[param] !== '' && !isNaN(objetivos[param]) ? Number(objetivos[param]) : midpoint([min, max]);
    const delta = Math.round((target - v) * 1000) / 1000;
    const sentido = delta > 0 ? 'sube' : 'baja';
    const candidates = productos.filter((p) => p.parametro === param && p.sentido === sentido && p.modo !== 'pastilla');
    const opciones = candidates.map((p) => ({ producto: p, ...doseFor(p, delta, m3) }));
    let nota = '';
    if (!candidates.length) {
      if (param === 'cloro' && sentido === 'baja') nota = 'El cloro está alto: no agregues cloro. Dejá filtrar y volvé a medir antes de habilitar el baño.';
      else if (param === 'estabilizante' && sentido === 'baja') nota = 'El estabilizante no se neutraliza con productos: se baja renovando parte del agua.';
      else nota = `No tenés productos cargados en Stock que ${sentido === 'sube' ? 'suban' : 'bajen'} ${PARAMS[param].label.toLowerCase()}. Agregalo en Stock con su dosis de etiqueta.`;
    }
    out.push({ ...item, status: v < min ? 'bajo' : 'alto', target, delta, sentido, opciones, nota });
  }
  return out;
}

export function fmtQty(cantidad, unidad) {
  if (cantidad === undefined || cantidad === null || isNaN(cantidad)) return '—';
  if (unidad === 'unidad') return `${num(cantidad, 0)} ${cantidad === 1 ? 'unidad' : 'unidades'}`;
  if (unidad === 'L' && cantidad < 1) return `${num(cantidad * 1000, 0)} mL`;
  if (unidad === 'kg' && cantidad < 1) return `${num(cantidad * 1000, 0)} g`;
  return `${num(cantidad, 2)} ${unidad}`;
}
