import { html, mount, on, debounce, formData, fillForm, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, photoField, bindPhotoFields, errorState } from '../ui/components.js';
import { get, save, remove } from '../data/store.js';
import { getDraft, saveDraft, clearDraft } from '../data/drafts.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { fullName, parseNum } from '../util/format.js';

export const MATERIALES = ['Hormigón / cemento', 'Fibra de vidrio', 'Vinilo / liner', 'Pintura epoxi', 'Venecita / revestimiento', 'Otro'];
export const FORMAS = ['Rectangular', 'Ovalada', 'Redonda', 'Riñón', 'Libre / irregular', 'Otra'];
export const CLORACION = ['Cloro manual (líquido/granulado)', 'Pastillas en boya', 'Clorador automático', 'Electrólisis salina', 'Otro'];

/** Campos de pileta reutilizables (también en el alta de cliente). */
export function piletaFields(p = '') {
  const dl = (id, list) => html`<datalist id="${id}">${list.map((x) => html`<option value="${x}">`)}</datalist>`;
  return html`
    <div class="field"><label for="${p}nombre">Nombre</label><input class="input" id="${p}nombre" name="${p}nombre" placeholder="Pileta principal" autocomplete="off"></div>
    <div class="grid-2">
      <div class="field"><label for="${p}m3">Volumen</label><div class="input-suffix"><input class="input" id="${p}m3" name="${p}m3" inputmode="decimal" placeholder="40" autocomplete="off"><span>m³</span></div></div>
      <div class="field"><label for="${p}forma">Forma</label><input class="input" id="${p}forma" name="${p}forma" list="${p}dl-forma" autocomplete="off">${dl(`${p}dl-forma`, FORMAS)}</div>
    </div>
    <div class="field"><label for="${p}material">Material</label><input class="input" id="${p}material" name="${p}material" list="${p}dl-mat" autocomplete="off">${dl(`${p}dl-mat`, MATERIALES)}</div>
    <div class="grid-2">
      <div class="field"><label for="${p}bomba">Bomba (modelo)</label><input class="input" id="${p}bomba" name="${p}bomba" autocomplete="off"></div>
      <div class="field"><label for="${p}filtro">Filtro (tipo)</label><input class="input" id="${p}filtro" name="${p}filtro" placeholder="Arena, cartucho…" autocomplete="off"></div>
    </div>
    <div class="field"><label for="${p}cloracion">Agua / sistema de cloración</label><input class="input" id="${p}cloracion" name="${p}cloracion" list="${p}dl-clo" autocomplete="off">${dl(`${p}dl-clo`, CLORACION)}</div>
    <div class="field"><label for="${p}notas">Notas de la pileta</label><textarea class="textarea" id="${p}notas" name="${p}notas"></textarea></div>`;
}

export function readPileta(d, p = '') {
  return {
    nombre: d[`${p}nombre`] || '', m3: parseNum(d[`${p}m3`]), forma: d[`${p}forma`] || '', material: d[`${p}material`] || '',
    bomba: d[`${p}bomba`] || '', filtro: d[`${p}filtro`] || '', cloracion: d[`${p}cloracion`] || '', notas: d[`${p}notas`] || ''
  };
}

export function validatePileta(pl, p = '') {
  const e = {};
  if (Number.isNaN(pl.m3)) e[`${p}m3`] = 'Ingresá un número (podés usar coma).';
  else if (pl.m3 !== '' && (pl.m3 <= 0 || pl.m3 > 10000)) e[`${p}m3`] = 'Volumen fuera de rango.';
  return e;
}

export default async function piletaForm(root, ctx) {
  const id = ctx.params.id;
  const existing = id ? get('piletas', id) : null;
  if (id && !existing) { mount(root, errorState('No encontramos esa pileta.')); return; }
  const clienteId = existing?.cliente_id || ctx.query.cliente;
  const c = get('clientes', clienteId);
  if (!c) { mount(root, errorState('Elegí primero un cliente.')); return; }
  const draftKey = `pileta:${id || `nueva:${clienteId}`}`;
  const draft = await getDraft(draftKey);
  const init = draft && (!existing || draft.t > Date.parse(existing.actualizado_en)) ? { ...(existing || {}), ...draft.data } : { ...(existing || {}) };

  mount(root, html`
    ${pageHead(existing ? 'Editar pileta' : 'Nueva pileta', fullName(c))}
    <form class="form" id="pf" novalidate>
      ${photoField('foto', 'Foto de la pileta', init.foto || '')}
      ${piletaFields()}
      <div class="form-actions">
        ${existing ? html`<button class="btn btn-ghost" type="button" data-action="delete" aria-label="Eliminar pileta">${icon('trash')}</button>` : html`<a class="btn btn-ghost" href="#/clientes/${clienteId}">Cancelar</a>`}
        <button class="btn" type="submit">${icon('check')}Guardar</button>
      </div>
    </form>`);
  const form = root.querySelector('#pf');
  fillForm(form, { ...init, m3: init.m3 === '' || init.m3 === undefined ? '' : String(init.m3).replace('.', ',') });
  const persist = debounce(() => saveDraft(draftKey, formData(form)), 400);
  form.addEventListener('input', persist);
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
