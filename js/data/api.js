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
import { API_URL } from '../config.js';

/**
 * Conexión de este dispositivo: { url, token, usuario }.
 * - Ingreso normal: usuario y contraseña → el servidor devuelve un token de sesión (dura un año).
 * - Modo avanzado (Ajustes): token maestro pegado a mano; queda usuario vacío.
 */
let conn = null;

export async function loadConnection() {
  conn = await idb.kvGet('conexion', { url: '', token: '', usuario: '' });
  if (!conn.url) conn.url = API_URL;
  return conn;
}
export const getConnection = () => conn || { url: API_URL, token: '', usuario: '' };
export const isConfigured = () => !!(conn?.url && conn?.token);

export async function saveConnection({ url, token, usuario = '' }) {
  conn = { url: (url || API_URL).trim(), token: token.trim(), usuario };
  await idb.kvSet('conexion', conn);
}

export class ApiError extends Error {}
/** El servidor rechazó el token: hay que volver a ingresar. */
export const isAuthError = (e) => /Sesión vencida|Token inválido/i.test(e?.message || '');

function deviceName() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
  return `${so} · ${new Date().toLocaleDateString('es-AR')}`;
}

export async function login(usuario, password) {
  const r = await call('login', { usuario, password, dispositivo: deviceName() }, { auth: false, timeout: 45000 });
  await saveConnection({ url: getConnection().url, token: r.token, usuario: r.usuario });
  return r;
}

/** Cierra la sesión en el servidor (si hay señal) y la borra del dispositivo. */
export async function logout() {
  try { if (conn?.usuario) await call('logout', {}, { timeout: 10000 }); } catch { /* sin señal: igual se borra acá */ }
  await saveConnection({ url: getConnection().url, token: '', usuario: '' });
}

export async function call(action, payload = {}, { timeout = 45000, connection, auth = true } = {}) {
  const c = connection || conn || getConnection();
  if (!c?.url || (auth && !c?.token)) throw new ApiError('Iniciá sesión para sincronizar con Google Sheets.');
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
