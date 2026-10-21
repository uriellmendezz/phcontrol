/** Formatos argentinos: dd/mm/aaaa, 24 h, ARS. Zona horaria America/Argentina/Buenos_Aires. */
export const TZ = 'America/Argentina/Buenos_Aires';

const moneyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** $ 12.500 (con espacio, como pide el negocio) */
export const money = (n) => moneyFmt.format(Number(n) || 0).replace(/^\$\s?/, '$ ').replace(/^-\$\s?/, '-$ ');
export const num = (n, digits = 2) => (n === '' || n === null || n === undefined || isNaN(n)) ? '—'
  : new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(Number(n));
export const num1 = (n) => numFmt.format(n);

/** Partes de la fecha/hora actual en Buenos Aires (independiente del huso del dispositivo). */
export function nowParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
export const today = () => nowParts().date;
export const nowTime = () => nowParts().time;

/** Las fechas de negocio se guardan como 'AAAA-MM-DD'. Se manejan como fechas "civiles" en UTC para evitar saltos. */
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
export function isoDate(d) { return d.toISOString().slice(0, 10); }
export function addDays(iso, n) { const d = parseDate(iso); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); }
export function addMonths(iso, n) {
  const d = parseDate(iso); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return isoDate(d);
}
export function diffDays(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
/** Lunes de la semana */
export function startOfWeek(iso) { const d = parseDate(iso); const wd = (d.getUTCDay() + 6) % 7; return addDays(iso, -wd); }
export function startOfMonth(iso) { return iso.slice(0, 8) + '01'; }
export function weekday(iso) { return (parseDate(iso).getUTCDay() + 6) % 7; } // 0 = lunes

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 21/10/2026 */
export function fdate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export const dayName = (iso) => DIAS[weekday(iso)];
export const dayShort = (iso) => DIAS_CORTOS[weekday(iso)];
export const DIAS_CORTOS_LIST = DIAS_CORTOS;
/** "martes 21 de octubre" */
export function longDate(iso) {
  const d = parseDate(iso);
  return `${DIAS[weekday(iso)]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
export function monthTitle(iso) { const d = parseDate(iso); return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
/** "Hoy", "Mañana", "Ayer" o fecha corta */
export function relDay(iso) {
  const t = today(); const diff = diffDays(iso, t);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1 && diff < 7) return DIAS[weekday(iso)][0].toUpperCase() + DIAS[weekday(iso)].slice(1);
  return fdate(iso);
}
/** ISO timestamp → "21/10/2026 14:05" en hora argentina */
export function fdatetime(ts) {
  if (!ts) return '—';
  const p = nowParts(new Date(ts));
  return `${fdate(p.date)} ${p.time}`;
}
export function timeToMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); }
export function minToTime(min) { const h = Math.floor(min / 60) % 24; const m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

/** Saludo según la hora */
export function greeting() {
  const h = Number(nowTime().slice(0, 2));
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Temporada alta: 1/10 → 31/3. Devuelve {from, to, label} de la temporada que contiene iso. */
export function seasonOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  const startYear = m >= 10 ? y : (m <= 3 ? y - 1 : y);
  return { from: `${startYear}-10-01`, to: `${startYear + 1}-03-31`, label: `Temporada ${startYear}/${String(startYear + 1).slice(2)}` };
}

/** Acepta "7,4" o "7.4". Devuelve number o '' si vacío, NaN si inválido. */
export function parseNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  let s = String(v).trim().replace(/\s|\$/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // "12.500,5" → 12500.5
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "15.000" → 15000 (miles con punto); "0.759" queda decimal
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

export function uid(prefix = '') {
  const r = crypto.getRandomValues(new Uint8Array(8));
  return prefix + Date.now().toString(36) + Array.from(r, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function fullName(c) { return c ? [c.nombre, c.apellido].filter(Boolean).join(' ') : 'Cliente eliminado'; }

/** Normaliza teléfono argentino a formato internacional para wa.me (54 9 + área + número). */
export function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Quita el "15" de celulares: área de 2 a 4 dígitos seguida de 15 (ej. 351 15 1234567 → 351 1234567)
  for (const areaLen of [2, 3, 4]) {
    if (d.length === 12 && d.slice(areaLen, areaLen + 2) === '15') { d = d.slice(0, areaLen) + d.slice(areaLen + 2); break; }
  }
  return '549' + d;
}
export function telHref(tel) { const d = String(tel || '').replace(/[^\d+]/g, ''); return d ? `tel:${d}` : ''; }
export function mapsHref(c) {
  if (!c) return '';
  if (c.lat !== '' && c.lng !== '' && c.lat != null && c.lng != null && !isNaN(c.lat) && !isNaN(c.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${Number(c.lat)},${Number(c.lng)}`;
  }
  const q = [c.direccion, c.barrio, 'Córdoba, Argentina'].filter(Boolean).join(', ');
  return c.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}
export const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
