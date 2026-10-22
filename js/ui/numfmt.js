/**
 * Separador de miles en tiempo real para los campos numéricos (inputmode decimal/numeric).
 * Formato argentino: 12.500,5. El punto tipeado cuenta como decimal; los puntos de miles los pone este módulo.
 * parseNum() ya entiende este formato, así que los formularios no cambian.
 */
const SKIP = /lat|lng/i;

function group(raw) {
  const neg = raw.startsWith('-') ? '-' : '';
  const [int, ...rest] = raw.replace(/-/g, '').split(',');
  const digits = int.replace(/\D/g, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg + grouped + (rest.length ? ',' + rest.join('').replace(/\D/g, '') : '');
}

function onInput(e) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  const mode = el.getAttribute('inputmode');
  if ((mode !== 'decimal' && mode !== 'numeric') || SKIP.test(`${el.name} ${el.id}`)) return;
  if (e.isComposing) return;

  let v = el.value;
  // Un punto recién tipeado es el decimal (teclados sin coma); los demás puntos son miles ya formateados.
  if (e.data === '.' && !v.includes(',')) {
    const caret = el.selectionStart ?? v.length;
    v = v.slice(0, caret - 1).replace(/\./g, '') + ',' + v.slice(caret).replace(/\./g, '');
  }
  v = v.replace(/\./g, '').replace(/[^\d,-]/g, '');
  if (mode === 'numeric') v = v.replace(/,.*/, '');
  const out = group(v);
  if (out === el.value) return;

  // Conserva el cursor contando cuántos caracteres "reales" (no puntos) había antes.
  const caret = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, caret).replace(/\./g, '').length;
  el.value = out;
  let pos = 0; let seen = 0;
  while (pos < out.length && seen < before) { if (out[pos] !== '.') seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch { /* algunos tipos de input no lo permiten */ }
}

document.addEventListener('input', onInput, true);
