/** Pronóstico con Open-Meteo (gratis, sin API key). Se cachea para verlo sin conexión. */
import { idb } from '../data/db.js';
import { TZ } from '../util/format.js';

const TTL = 60 * 60 * 1000; // 1 h

const WMO = [
  [[0], 'Despejado', 'sun'],
  [[1, 2], 'Parcialmente nublado', 'partly'],
  [[3], 'Nublado', 'cloud'],
  [[45, 48], 'Niebla', 'cloud'],
  [[51, 53, 55, 56, 57], 'Llovizna', 'rain'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Lluvia', 'rain'],
  [[71, 73, 75, 77, 85, 86], 'Nieve', 'cloud'],
  [[95, 96, 99], 'Tormenta', 'storm']
];
export function describe(code) {
  const hit = WMO.find(([codes]) => codes.includes(Number(code)));
  return hit ? { label: hit[1], icon: hit[2] } : { label: '—', icon: 'cloud' };
}

/** Devuelve { days: [{date, max, min, prob, code}], fetchedAt, stale } o lanza si no hay nada. */
export async function forecast(lat, lng, { force = false } = {}) {
  const la = Number(lat).toFixed(2);
  const lo = Number(lng).toFixed(2);
  const key = `clima:${la},${lo}`;
  const cached = await idb.kvGet(key);
  if (cached && !force && Date.now() - cached.fetchedAt < TTL) return { ...cached, stale: false };
  if (!navigator.onLine && cached) return { ...cached, stale: true };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=7`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j.daily) throw new Error('Respuesta sin datos');
    const d = j.daily;
    const days = d.time.map((date, i) => ({
      date,
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      prob: d.precipitation_probability_max[i],
      code: d.weather_code[i]
    }));
    const data = { days, fetchedAt: Date.now() };
    await idb.kvSet(key, data);
    return { ...data, stale: false };
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw new Error('No se pudo obtener el pronóstico (sin conexión).');
  }
}

export function dayFor(fc, date) { return fc?.days?.find((d) => d.date === date) || null; }
