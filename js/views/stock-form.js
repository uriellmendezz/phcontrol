import { html, mount, on, formData, fillForm, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, errorState } from '../ui/components.js';
import { get, save, remove } from '../data/store.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { parseNum } from '../util/format.js';
import { TIPOS, UNIDADES, PARAMS, missingFields } from '../domain/chem.js';

const NUMS = ['cantidad', 'umbral', 'costo', 'precio', 'conc_valor', 'dosis_cant', 'dosis_m3', 'dosis_efecto', 'dosis_choque'];

export default async function stockForm(root, ctx) {
  const id = ctx.params.id;
  const existing = id ? get('stock', id) : null;
  if (id && !existing) { mount(root, errorState('No encontramos ese producto.')); return; }
  const t0 = ctx.query.tipo && TIPOS[ctx.query.tipo] ? ctx.query.tipo : 'otro';
  const init = existing ? { ...existing } : { tipo: t0, producto: TIPOS[t0].sugerido || '', unidad: TIPOS[t0].unidad, modo: TIPOS[t0].modo, parametro: TIPOS[t0].parametro, sentido: TIPOS[t0].sentido, conc_unidad: TIPOS[t0].conc_unidad || '', cantidad: 0 };

  mount(root, html`
    ${pageHead(existing ? 'Editar producto' : 'Nuevo producto')}
    <form class="form" id="sf" novalidate>
      <div class="field"><label for="tipo">Tipo</label><select class="select" id="tipo" name="tipo">${Object.entries(TIPOS).map(([k, t]) => html`<option value="${k}">${t.label}</option>`)}</select></div>
      <div class="field"><label for="producto">Nombre / marca *</label><input class="input" id="producto" name="producto" autocomplete="off"></div>
      <div class="grid-2">
        <div class="field"><label for="unidad">Unidad</label><select class="select" id="unidad" name="unidad">${UNIDADES.map((u) => html`<option value="${u}">${u}</option>`)}</select></div>
        <div class="field"><label for="cantidad">Cantidad actual</label><input class="input" id="cantidad" name="cantidad" inputmode="decimal"></div>
      </div>
      <div class="field"><label for="umbral">Umbral mínimo (alerta de stock bajo)</label><input class="input" id="umbral" name="umbral" inputmode="decimal"></div>
      <div class="grid-2">
        <div class="field"><label for="costo">Precio de costo (por unidad)</label><div class="input-suffix"><input class="input" id="costo" name="costo" inputmode="decimal"><span>$</span></div></div>
        <div class="field"><label for="precio">Precio de venta (por unidad)</label><div class="input-suffix"><input class="input" id="precio" name="precio" inputmode="decimal"><span>$</span></div></div>
      </div>

      <p class="fieldset-title">Datos de la etiqueta (para la calculadora)</p>
      <div id="label-warn"></div>
      <div id="label-fields" class="form"></div>

      <details class="details"><summary>Avanzado: cómo actúa el producto</summary>
        <div class="form" style="margin-top:12px">
          <div class="field"><label for="modo">Modelo de dosis</label><select class="select" id="modo" name="modo">
            <option value="concentracion">Concentración de activo (cloro / estabilizante)</option>
            <option value="efecto">Efecto por dosis (pH, alcalinidad)</option>
            <option value="fija">Dosis fija por volumen (clarificante, alguicida…)</option>
            <option value="pastilla">Pastilla por volumen</option></select></div>
          <div class="grid-2">
            <div class="field"><label for="parametro">Parámetro</label><select class="select" id="parametro" name="parametro"><option value="">Ninguno</option>${Object.entries(PARAMS).map(([k, p]) => html`<option value="${k}">${p.label}</option>`)}</select></div>
            <div class="field"><label for="sentido">Sentido</label><select class="select" id="sentido" name="sentido"><option value="">—</option><option value="sube">Sube</option><option value="baja">Baja</option></select></div>
          </div>
        </div>
      </details>
      <div class="field"><label for="notas">Notas</label><textarea class="textarea" id="notas" name="notas" placeholder="Proveedor, presentación, indicaciones de la etiqueta…"></textarea></div>

      <div class="form-actions">
        ${existing ? html`<button class="btn btn-ghost" type="button" data-action="delete" aria-label="Eliminar producto">${icon('trash')}</button>` : html`<a class="btn btn-ghost" href="#/stock">Cancelar</a>`}
        <button class="btn" type="submit">${icon('check')}Guardar</button>
      </div>
    </form>`);

  const form = root.querySelector('#sf');
  const str = (v) => (v === '' || v === undefined || v === null ? '' : String(v).replace('.', ','));
  fillForm(form, { ...init, ...Object.fromEntries(NUMS.map((k) => [k, str(init[k])])) });

  function labelFields() {
    const modo = form.modo.value;
    const u = form.unidad.value;
    const param = form.parametro.value;
    const box = root.querySelector('#label-fields');
    const keep = Object.fromEntries(NUMS.map((k) => [k, form.querySelector(`[name="${k}"]`)?.value ?? str(init[k])]));
    const conc = form.querySelector('[name="conc_unidad"]')?.value || init.conc_unidad || '';
    let content;
    if (modo === 'concentracion') {
      content = html`<div class="grid-2">
        <div class="field"><label for="conc_valor">Concentración de ${param === 'estabilizante' ? 'ácido cianúrico' : 'cloro activo'}</label><input class="input" id="conc_valor" name="conc_valor" inputmode="decimal" placeholder="Ver etiqueta"></div>
        <div class="field"><label for="conc_unidad">Expresada en</label><select class="select" id="conc_unidad" name="conc_unidad"><option value="">Elegí</option><option value="%">% (peso)</option><option value="g/L">g/L</option></select></div>
      </div><p class="field-hint">Ej. de etiqueta: "cloro activo 80 g/L" o "90 % de cloro disponible". Con L/mL y "%" se interpreta como % p/v (gramos cada 100 mL).</p>`;
    } else if (modo === 'efecto') {
      content = html`<p class="small">Según la etiqueta: <strong>X ${u}</strong> cada <strong>Y m³</strong> ${form.sentido.value === 'baja' ? 'bajan' : 'suben'} <strong>Z ${param === 'ph' ? 'unidades de pH' : 'ppm'}</strong>.</p>
        <div class="grid-3">
          <div class="field"><label for="dosis_cant">X (${u})</label><input class="input" id="dosis_cant" name="dosis_cant" inputmode="decimal"></div>
          <div class="field"><label for="dosis_m3">Y (m³)</label><input class="input" id="dosis_m3" name="dosis_m3" inputmode="decimal"></div>
          <div class="field"><label for="dosis_efecto">Z (${param === 'ph' ? 'pH' : 'ppm'})</label><input class="input" id="dosis_efecto" name="dosis_efecto" inputmode="decimal"></div>
        </div>`;
    } else if (modo === 'pastilla') {
      content = html`<div class="field"><label for="dosis_m3">Una pastilla cada (m³)</label><input class="input" id="dosis_m3" name="dosis_m3" inputmode="decimal"></div>`;
    } else {
      content = html`<div class="field"><label for="dosis_m3">Dosis cada (m³)</label><input class="input" id="dosis_m3" name="dosis_m3" inputmode="decimal"></div>
        <div class="grid-2">
          <div class="field"><label for="dosis_cant">Mantenimiento (${u})</label><input class="input" id="dosis_cant" name="dosis_cant" inputmode="decimal"></div>
          <div class="field"><label for="dosis_choque">Choque (${u})</label><input class="input" id="dosis_choque" name="dosis_choque" inputmode="decimal"></div>
        </div>`;
    }
    mount(box, content);
    for (const [k, v] of Object.entries(keep)) { const el = box.querySelector(`[name="${k}"]`); if (el) el.value = v; }
    const cu = box.querySelector('[name="conc_unidad"]'); if (cu) cu.value = conc;
    warn();
  }

  function warn() {
    const d = readNums(formData(form));
    const miss = missingFields({ ...d, unidad: form.unidad.value, modo: form.modo.value, conc_unidad: form.querySelector('[name="conc_unidad"]')?.value });
    mount(root.querySelector('#label-warn'), miss.length ? html`<div class="alert warn">${icon('alert')}<p>Falta: ${miss.join(', ')}. Copialo de la etiqueta del producto: la calculadora no usa valores por defecto.</p></div>` : '');
  }

  form.tipo.addEventListener('change', () => {
    const t = TIPOS[form.tipo.value];
    form.modo.value = t.modo; form.parametro.value = t.parametro; form.sentido.value = t.sentido; form.unidad.value = t.unidad;
    if (!form.producto.value && t.sugerido) form.producto.value = t.sugerido;
    labelFields();
    if (t.conc_unidad) { const cu = form.querySelector('[name="conc_unidad"]'); if (cu && !cu.value) cu.value = t.conc_unidad; }
  });
  ['modo', 'unidad', 'parametro', 'sentido'].forEach((n) => form[n].addEventListener('change', labelFields));
  form.addEventListener('input', warn);
  labelFields();

  function readNums(d) {
    const o = {};
    for (const k of NUMS) o[k] = d[k] === undefined ? '' : parseNum(d[k]);
    return o;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const n = readNums(d);
    const errors = {};
    if (!d.producto) errors.producto = 'Poné un nombre.';
    for (const k of NUMS) if (Number.isNaN(n[k])) errors[k] = 'Número inválido.';
    for (const k of NUMS.filter((x) => x !== 'cantidad')) if (!errors[k] && n[k] !== '' && n[k] < 0) errors[k] = 'No puede ser negativo.';
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    const rec = await save('stock', { ...(existing || {}), ...d, ...n, conc_unidad: d.conc_unidad || '' });
    toast('Producto guardado');
    navigate(ctx.query.volver ? decodeURIComponent(ctx.query.volver) : '#/stock', { replace: true });
    return rec;
  });

  on(root, 'click', '[data-action="delete"]', async () => {
    const ok = await confirmDialog({ title: 'Eliminar producto', message: 'Las visitas y ventas que lo usaron se conservan.', confirm: 'Eliminar', danger: true });
    if (!ok) return;
    await remove('stock', existing.id);
    toast('Producto eliminado');
    navigate('#/stock', { replace: true });
  });
}
