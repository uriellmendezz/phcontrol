/**
 * Cliente del Apps Script Web App.
 *
 * CORS: Apps Script no contesta OPTIONS, así que evitamos el preflight mandando
 * POST con Content-Type "text/plain" (una "simple request"). El cuerpo igual es JSON.
 * Apps Script responde con un 302 a script.googleusercontent.com; fetch lo sigue solo
 * (redirect: 'follow') y esa respuesta final trae Access-Control-Allow-Origin: *.
 * No mandamos cookies (credentials: 'omit') para que el CORS con "*" sea válido.
 */
import { idb } from './db.js';

let conn = null;

export async function loadConnection() {
  conn = await idb.kvGet('conexion', { url: '', token: '' });
  return conn;
}
export const getConnection = () => conn || { url: '', token: '' };
export const isConfigured = () => !!(conn?.url && conn?.token);

export async function saveConnection({ url, token }) {
  conn = { url: url.trim(), token: token.trim() };
  await idb.kvSet('conexion', conn);
}

export class ApiError extends Error {}

export async function call(action, payload = {}, { timeout = 45000, connection } = {}) {
  const c = connection || conn;
  if (!c?.url || !c?.token) throw new ApiError('Falta configurar la conexión con Google Sheets (Ajustes).');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(c.url)) throw new ApiError('La URL debe ser la del Web App de Apps Script (https://script.google.com/macros/s/…/exec).');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: c.token, action, ...payload }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'La conexión tardó demasiado.' : 'No se pudo conectar con Google. Revisá la señal o la URL.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError(`Google respondió con error HTTP ${res.status}.`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new ApiError('Respuesta inesperada. ¿El Web App está desplegado con acceso "Cualquier persona"?');
  }
  if (!data.ok) throw new ApiError(data.error || 'Error desconocido del servidor.');
  return data;
}
