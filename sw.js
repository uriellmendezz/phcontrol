/**
 * Service Worker de phcontrol.
 * - Precache del "shell" (HTML, CSS, JS, íconos, teórico) → la app abre sin conexión.
 * - Librerías de CDN (Chart.js, html-to-image): se intentan precachear; si no, se cachean al primer uso.
 * - Open-Meteo: red primero, caché si no hay señal.
 * - Apps Script: nunca se cachea (los datos viven en IndexedDB).
 * Al publicar cambios, subí VERSION para que los iPhones reciban la actualización.
 */
const VERSION = 'v1.2.0';
const SHELL = `phcontrol-shell-${VERSION}`;
const RUNTIME = 'phcontrol-runtime';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  './js/router.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/toast.js',
  './js/ui/theme.js',
  './js/ui/modal.js',
  './js/ui/components.js',
  './js/ui/charts.js',
  './js/ui/share-card.js',
  './js/util/format.js',
  './js/util/geo.js',
  './js/util/libs.js',
  './js/util/csv.js',
  './js/util/markdown.js',
  './js/data/db.js',
  './js/data/schema.js',
  './js/data/store.js',
  './js/data/api.js',
  './js/data/sync.js',
  './js/data/photos.js',
  './js/data/settings.js',
  './js/data/drafts.js',
  './js/domain/chem.js',
  './js/domain/agenda.js',
  './js/domain/stats.js',
  './js/domain/weather.js',
  './js/domain/alerts.js',
  './js/views/inicio.js',
  './js/views/visitas.js',
  './js/views/visita-form.js',
  './js/views/visita-detalle.js',
  './js/views/agenda-form.js',
  './js/views/calendario.js',
  './js/views/clientes.js',
  './js/views/cliente-form.js',
  './js/views/cliente-detalle.js',
  './js/views/pileta-form.js',
  './js/views/calculadora.js',
  './js/views/stock.js',
  './js/views/stock-form.js',
  './js/views/venta-form.js',
  './js/views/teorico.js',
  './js/views/teorico-articulo.js',
  './js/views/ajustes.js',
  './js/views/mas.js',
  './js/views/mapa.js',
  './data/teorico.json',
  './assets/logo/logo-white.png',
  './assets/logo/logo-navy.png',
  './assets/logo/logo-white.svg',
  './assets/logo/main-logo.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon-32.png',
  './assets/img/ondas.svg'
];

// Fuentes y librerías: opcionales (si faltan, no rompen la instalación).
const OPTIONAL = [
  './assets/fonts/HurmeGeometricSans4-Regular.woff2',
  './assets/fonts/HurmeGeometricSans4-SemiBold.woff2',
  './assets/fonts/HurmeGeometricSans4-Bold.woff2',
  './assets/fonts/Outfit-Variable.woff2',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(ASSETS);
    await Promise.all(OPTIONAL.map(async (url) => {
      try {
        const res = await fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' });
        if (res.ok) await cache.put(url, res);
      } catch { /* se reintenta en tiempo de ejecución */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('phcontrol-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos de Google: siempre red (no cachear jamás).
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Clima: red primero, caché como respaldo.
  if (url.hostname === 'api.open-meteo.com') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Navegación: el index del shell desde caché (abre al instante aun con mala señal).
  // Las actualizaciones llegan cambiando VERSION.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetch(req); } catch { return Response.error(); }
    })());
    return;
  }

  // Shell y CDN: caché primero, y si no está, red + guardar.
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
      const cache = await caches.open(RUNTIME);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}
