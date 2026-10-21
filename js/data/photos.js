/**
 * Fotos: se comprimen en el dispositivo (máx. 1280 px, JPEG 0.7), se guardan en IndexedDB
 * con referencia "loc:<id>" y al sincronizar se suben a Drive (la hoja guarda solo el fileId).
 * Las fotos de Drive se descargan a través del Apps Script (la carpeta sigue privada) y se cachean.
 */
import { idb } from './db.js';
import { call, isConfigured } from './api.js';
import { uid } from '../util/format.js';

const MAX = 1280;
const QUALITY = 0.7;
const urlCache = new Map();

export const isLocalRef = (ref) => typeof ref === 'string' && ref.startsWith('loc:');

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen. Probá con otra foto.')); };
    img.src = url;
  });
}

/** Comprime un File de la cámara. Safari ya aplica la orientación EXIF al dibujar. */
export async function compress(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  canvas.width = canvas.height = 0; // libera memoria en iOS
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  return blob;
}

/** Guarda una foto nueva y devuelve su referencia local. */
export async function storeLocal(blob) {
  const id = 'loc:' + uid();
  await idb.put('fotos', { id, blob, creado: Date.now() });
  return id;
}

export async function deleteLocal(ref) {
  if (isLocalRef(ref)) await idb.del('fotos', ref);
}

/** URL para mostrar en <img>. null si no hay forma de obtenerla ahora (sin conexión). */
export async function photoUrl(ref) {
  if (!ref) return null;
  if (urlCache.has(ref)) return urlCache.get(ref);
  let entry = await idb.get('fotos', ref);
  if (!entry && !isLocalRef(ref) && isConfigured() && navigator.onLine) {
    try {
      const r = await call('getPhoto', { fileId: ref }, { timeout: 60000 });
      const blob = base64ToBlob(r.data, r.mime);
      entry = { id: ref, blob, creado: Date.now() };
      await idb.put('fotos', entry);
    } catch { return null; }
  }
  if (!entry) return null;
  const url = URL.createObjectURL(entry.blob);
  urlCache.set(ref, url);
  return url;
}

export async function photoBlob(ref) {
  await photoUrl(ref);
  const e = await idb.get('fotos', ref);
  return e?.blob || null;
}

/** Sube una foto local a Drive y devuelve el fileId (y cachea el blob con esa clave). */
export async function upload(ref) {
  const entry = await idb.get('fotos', ref);
  if (!entry) return null; // la foto local se perdió: se deja la referencia vacía
  const data = await blobToBase64(entry.blob);
  const r = await call('uploadPhoto', { name: ref.replace('loc:', 'ph_') + '.jpg', mime: 'image/jpeg', data }, { timeout: 90000 });
  await idb.put('fotos', { id: r.fileId, blob: entry.blob, creado: Date.now() });
  await idb.del('fotos', ref);
  if (urlCache.has(ref)) urlCache.set(r.fileId, urlCache.get(ref));
  return r.fileId;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, mime = 'image/jpeg') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Rellena todas las <img data-photo="ref"> dentro de root (lazy, al entrar en pantalla). */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    fill(e.target);
  }
}, { rootMargin: '200px' }) : null;

async function fill(img) {
  const url = await photoUrl(img.dataset.photo);
  if (url) { img.src = url; img.classList.remove('img-ph'); }
  else img.alt = 'Foto no disponible sin conexión';
}

export function hydratePhotos(root) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach((img) => (io ? io.observe(img) : fill(img)));
}
