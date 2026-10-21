/** Carga diferida de librerías de CDN (versión fija). El Service Worker las deja disponibles offline. */
const LIBS = {
  chart: { url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js', global: 'Chart' },
  htmlToImage: { url: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js', global: 'htmlToImage' }
};
const loading = {};

export function loadLib(name) {
  const lib = LIBS[name];
  if (window[lib.global]) return Promise.resolve(window[lib.global]);
  loading[name] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = lib.url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window[lib.global] ? resolve(window[lib.global]) : reject(new Error(`No se pudo iniciar ${name}`)));
    s.onerror = () => { delete loading[name]; reject(new Error('No se pudo cargar la librería (¿sin conexión la primera vez?).')); };
    document.head.appendChild(s);
  });
  return loading[name];
}
