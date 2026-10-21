/** Ubicación: GPS del teléfono o coordenadas extraídas de un enlace de Google Maps. */

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Este dispositivo no permite obtener la ubicación.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lng: round(p.coords.longitude), acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Permiso de ubicación denegado. Activalo en Ajustes > Privacidad > Localización.' : 'No se pudo obtener la ubicación. Probá al aire libre.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

const round = (n) => Math.round(n * 1e6) / 1e6;
const valid = (lat, lng) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Extrae lat/lng de enlaces como:
 *  https://www.google.com/maps/place/.../@-31.36,-64.25,17z
 *  https://www.google.com/maps/...!3d-31.36!4d-64.25
 *  https://maps.google.com/?q=-31.36,-64.25   ·   "-31.36, -64.25"
 * Los enlaces cortos (maps.app.goo.gl) no se pueden resolver desde el navegador: abrilos y copiá el enlace largo.
 */
export function parseMapsLink(text) {
  const s = decodeURIComponent(String(text || '').trim());
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]); const lng = Number(m[2]);
      if (valid(lat, lng)) return { lat: round(lat), lng: round(lng) };
    }
  }
  if (/goo\.gl|maps\.app/.test(s)) throw new Error('Es un enlace corto. Abrilo en el navegador, copiá la dirección larga de Google Maps y pegala acá.');
  throw new Error('No encontré coordenadas en ese enlace.');
}
