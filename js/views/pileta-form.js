import { html, mount, on, debounce, formData, fillForm, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, photoField, bindPhotoFields, errorState } from '../ui/components.js';
import { get, save, remove } from '../data/store.js';
import { getDraft, saveDraft, clearDraft } from '../data/drafts.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { fullName, parseNum } from '../util/format.js';

export const MATERIALES = ['Hormigón / cemento', 'Fibra de vidrio', 'Vinilo / liner', 'Pintura epoxi', 'Venecita', 'Otro'];
export const FORMAS = ['Rectangular', 'Ovalada', 'Redonda', 'Riñón', 'Libre', 'Otra'];
export const CLORACION = ['Cloro manual', 'Pastillas en boya', 'Clorador automático', 'Electrólisis salina', 'Otro'];
const OTRO = '__otro';
const esOtro = (o) => /^Otr[oa]$/.test(o);
/** Formas cuyo volumen se calcula como elipse: π/4 × largo × ancho × profundidad. */
const ELIPTICAS = ['Ovalada', 'Redonda'];

/** Grupo de opciones como botones (radio). Si se elige "Otro", aparece un campo de texto. */
function choices(name, label, options) {
  return html`<fieldset class="field choice-field">
    <legend class="label">${label}</legend>
    <div class="choices" role="radiogroup">
      ${options.map((o) => html`<label class="choice"><input type="radio" name="${name}" value="${esOtro(o) ? OTRO : o}"><span>${o}</span></label>`)}
    </div>
    ${options.some(esOtro) ? html`<input class="input choice-otro" name="${name}_otro" placeholder="¿Cuál?" autocomplete="off" aria-label="${label}: otra opción" hidden>` : ''}
  </fieldset>`;
}

function tiene(name, label) {
  return html`<fieldset class="field choice-field">
    <legend class="label">${label}</legend>
    <div class="choices two" role="radiogroup">
      <label class="choice"><input type="radio" name="${name}" value="si"><span>Tiene</span></label>
      <label class="choice"><input type="radio" name="${name}" value="no"><span>No tiene</span></label>
    </div>
  </fieldset>`;
}

/** Campos de pileta reutilizables (también en el alta de cliente). p = prefijo de los nombres. */
export function piletaFields(p = '') {
  return html`
    <div class="field"><label for="${p}nombre">Nombre</label><input class="input" id="${p}nombre" name="${p}nombre" placeholder="Pileta principal" autocomplete="off"></div>
    ${choices(`${p}forma`, 'Forma', FORMAS)}
    <fieldset class="field choice-field">
      <legend class="label">Medidas (opcional)</legend>
      <div class="grid-3">
        <div class="field"><label class="xsmall muted" for="${p}largo">Largo</label><div class="input-suffix"><input class="input" id="${p}largo" name="${p}largo" inputmode="decimal" placeholder="8" autocomplete="off"><span>m</span></div></div>
        <div class="field"><label class="xsmall muted" for="${p}ancho">Ancho</label><div class="input-suffix"><input class="input" id="${p}ancho" name="${p}ancho" inputmode="decimal" placeholder="4" autocomplete="off"><span>m</span></div></div>
        <div class="field"><label class="xsmall muted" for="${p}profundidad">Prof. prom.</label><div class="input-suffix"><input class="input" id="${p}profundidad" name="${p}profundidad" inputmode="decimal" placeholder="1,4" autocomplete="off"><span>m</span></div></div>
      </div>
    </fieldset>
    <div class="field"><label for="${p}m3">Volumen</label><div class="input-suffix"><input class="input" id="${p}m3" name="${p}m3" inputmode="decimal" placeholder="40" autocomplete="off"><span>m³</span></div>
      <p class="field-hint" data-m3-hint></p></div>
    ${choices(`${p}material`, 'Material', MATERIALES)}
    ${choices(`${p}cloracion`, 'Agua / sistema de cloración', CLORACION)}
    ${tiene(`${p}bomba_tiene`, 'Bomba')}
    <div class="field" data-show="${p}bomba_tiene" hidden><label for="${p}bomba">Modelo de bomba (opcional)</label><input class="input" id="${p}bomba" name="${p}bomba" autocomplete="off"></div>
    ${tiene(`${p}filtro_tiene`, 'Filtro')}
    <div class="form" data-show="${p}filtro_tiene" hidden>
      <div class="field"><label for="${p}filtro">Modelo de filtro (opcional)</label><input class="input" id="${p}filtro" name="${p}filtro" autocomplete="off"></div>
      <div class="field"><label for="${p}filtro_arena">Arena que usa (opcional)</label><input class="input" id="${p}filtro_arena" name="${p}filtro_arena" placeholder="Ej.: sílice, vidrio" autocomplete="off"></div>
    </div>
    <div class="field"><label for="${p}notas">Notas de la pileta</label><textarea class="textarea" id="${p}notas" name="${p}notas"></textarea></div>`;
}

const fmtNum = (v) => (v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','));
const choiceValue = (v, options) => (!v ? '' : options.includes(v) && !esOtro(v) ? v : OTRO);

/** Convierte un registro de pileta en los valores del formulario (incluye "Otro" y "Tiene"). */
export function piletaToForm(rec = {}, p = '') {
  const out = {};
  for (const k of ['nombre', 'bomba', 'filtro', 'filtro_arena', 'notas']) out[`${p}${k}`] = rec[k] ?? '';
  for (const k of ['m3', 'largo', 'ancho', 'profundidad']) out[`${p}${k}`] = fmtNum(rec[k]);
  for (const [k, list] of [['forma', FORMAS], ['material', MATERIALES], ['cloracion', CLORACION]]) {
    out[`${p}${k}`] = choiceValue(rec[k], list);
    out[`${p}${k}_otro`] = out[`${p}${k}`] === OTRO ? rec[k] : '';
  }
  // Piletas cargadas antes de este cambio: si había modelo, se asume que tiene.
  out[`${p}bomba_tiene`] = rec.bomba_tiene || (rec.bomba ? 'si' : '');
  out[`${p}filtro_tiene`] = rec.filtro_tiene || (rec.filtro ? 'si' : '');
  return out;
}

/** Volumen calculado con las medidas, o null si falta alguna. */
export function volumen(largo, ancho, prof, forma) {
  if ([largo, ancho, prof].some((x) => x === '' || Number.isNaN(x) || x <= 0)) return null;
  const k = ELIPTICAS.includes(forma) ? Math.PI / 4 : 1;
  return Math.round(largo * ancho * prof * k * 10) / 10;
}

/** Conecta el cálculo de m³, las opciones "Otro" y los campos que dependen de "Tiene". */
export function bindPiletaFields(form, p = '', onChange) {
  const field = (n) => form.querySelector(`[name="${p}${n}"]`);
  const checked = (n) => form.querySelector(`[name="${p}${n}"]:checked`)?.value || '';
  const hint = form.querySelector('[data-m3-hint]');
  const m3 = field('m3');
  const sync = () => {
    const forma = checked('forma');
    const v = volumen(parseNum(field('largo').value), parseNum(field('ancho').value), parseNum(field('profundidad').value), forma);
    if (v !== null) {
      m3.value = fmtNum(v);
      m3.readOnly = true;
      hint.textContent = ELIPTICAS.includes(forma) ? 'Calculado: π/4 × largo × ancho × profundidad promedio.' : 'Calculado: largo × ancho × profundidad promedio.';
    } else {
      if (m3.readOnly) m3.value = '';
      m3.readOnly = false;
      hint.textContent = 'Completá las tres medidas y se calcula solo, o cargá los m³ a mano.';
    }
    form.querySelectorAll('.choice-otro').forEach((inp) => {
      const group = inp.name.replace(/_otro$/, '');
      inp.hidden = form.querySelector(`[name="${group}"]:checked`)?.value !== OTRO;
    });
    form.querySelectorAll('[data-show]').forEach((el) => { el.hidden = form.querySelector(`[name="${el.dataset.show}"]:checked`)?.value !== 'si'; });
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', () => { sync(); onChange?.(); });
  sync();
}

export function readPileta(d, p = '') {
  const pick = (k) => (d[`${p}${k}`] === OTRO ? (d[`${p}${k}_otro`] || '') : (d[`${p}${k}`] || ''));
  const bombaTiene = d[`${p}bomba_tiene`] || '';
  const filtroTiene = d[`${p}filtro_tiene`] || '';
  return {
    nombre: d[`${p}nombre`] || '', m3: parseNum(d[`${p}m3`]),
    largo: parseNum(d[`${p}largo`]), ancho: parseNum(d[`${p}ancho`]), profundidad: parseNum(d[`${p}profundidad`]),
    forma: pick('forma'), material: pick('material'), cloracion: pick('cloracion'),
    bomba_tiene: bombaTiene, bomba: bombaTiene === 'si' ? (d[`${p}bomba`] || '') : '',
    filtro_tiene: filtroTiene, filtro: filtroTiene === 'si' ? (d[`${p}filtro`] || '') : '',
    filtro_arena: filtroTiene === 'si' ? (d[`${p}filtro_arena`] || '') : '',
    notas: d[`${p}notas`] || ''
  };
}

export function validatePileta(pl, p = '') {
  const e = {};
  for (const [k, max] of [['largo', 200], ['ancho', 200], ['profundidad', 20]]) {
    if (Number.isNaN(pl[k])) e[`${p}${k}`] = 'Número inválido.';
    else if (pl[k] !== '' && (pl[k] <= 0 || pl[k] > max)) e[`${p}${k}`] = 'Fuera de rango.';
  }
  if (Number.isNaN(pl.m3)) e[`${p}m3`] = 'Ingresá un número (podés usar coma).';
  else if (pl.m3 !== '' && (pl.m3 <= 0 || pl.m3 > 10000)) e[`${p}m3`] = 'Volumen fuera de rango.';
  return e;
}

/** ¿Se cargó algún dato de la pileta? (en el alta de cliente la pileta es opcional) */
export const piletaTieneDatos = (pl) => !!(pl.m3 !== '' || pl.largo !== '' || pl.forma || pl.material || pl.cloracion || pl.bomba_tiene || pl.filtro_tiene || pl.notas);

export default async function piletaForm(root, ctx) {
  const id = ctx.params.id;
  const existing = id ? get('piletas', id) : null;
  if (id && !existing) { mount(root, errorState('No encontramos esa pileta.')); return; }
  const clienteId = existing?.cliente_id || ctx.query.cliente;
  const c = get('clientes', clienteId);
  if (!c) { mount(root, errorState('Elegí primero un cliente.')); return; }
  const draftKey = `pileta:${id || `nueva:${clienteId}`}`;
  const draft = await getDraft(draftKey);
  const useDraft = draft && (!existing || draft.t > Date.parse(existing.actualizado_en));
  const init = { ...(existing || {}) };

  mount(root, html`
    ${pageHead(existing ? 'Editar pileta' : 'Nueva pileta', fullName(c))}
    <form class="form" id="pf" novalidate>
      ${photoField('foto', 'Foto de la pileta', (useDraft ? draft.data.foto : init.foto) || '')}
      ${piletaFields()}
      <div class="form-actions">
        ${existing ? html`<button class="btn btn-ghost" type="button" data-action="delete" aria-label="Eliminar pileta">${icon('trash')}</button>` : html`<a class="btn btn-ghost" href="#/clientes/${clienteId}">Cancelar</a>`}
        <button class="btn" type="submit">${icon('check')}Guardar</button>
      </div>
    </form>`);
  const form = root.querySelector('#pf');
  // El borrador guarda los valores tal cual el formulario; un registro se convierte con piletaToForm.
  fillForm(form, useDraft ? { ...piletaToForm(init), ...draft.data } : piletaToForm(init));
  const persist = debounce(() => saveDraft(draftKey, formData(form)), 400);
  form.addEventListener('input', persist);
  bindPiletaFields(form, '', persist);
  bindPhotoFields(form, persist);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const pl = readPileta(d);
    const errors = validatePileta(pl);
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    await save('piletas', { ...(existing || {}), ...pl, foto: d.foto, cliente_id: clienteId });
    persist.cancel(); await clearDraft(draftKey);
    toast('Pileta guardada');
    navigate(`#/clientes/${clienteId}`, { replace: true });
  });
  on(root, 'click', '[data-action="delete"]', async () => {
    const ok = await confirmDialog({ title: 'Eliminar pileta', message: 'Las visitas registradas se conservan.', confirm: 'Eliminar', danger: true });
    if (!ok) return;
    await remove('piletas', existing.id);
    toast('Pileta eliminada');
    navigate(`#/clientes/${clienteId}`, { replace: true });
  });
}
