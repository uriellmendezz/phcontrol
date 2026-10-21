/**
 * Tema claro / oscuro. La preferencia es por dispositivo (localStorage):
 * "auto" sigue al iPhone, "light" fuerza el modo claro (blanco + Navy), "dark" el oscuro.
 * El script en <head> de index.html aplica el tema antes del primer pintado; esto lo mantiene al día.
 */
const KEY = 'phc-tema';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export const TEMAS = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

function apply() {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('meta-theme')?.setAttribute('content', dark ? '#192F41' : '#FFFFFF');
  window.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }));
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* modo privado: solo para esta sesión */ }
  apply();
}

export function initTheme() {
  apply();
  mq.addEventListener('change', () => { if (getThemePref() === 'auto') apply(); });
}
