import { html, mount, on, debounce, formData, fillForm, showErrors, esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, clientPicker, bindClientPicker, piletaOptions, photoField, bindPhotoFields, rangeStatus, errorState } from '../ui/components.js';
import { get, save, all, piletasDe, ajustarStock } from '../data/store.js';
import { settings } from '../data/settings.js';
import { getDraft, saveDraft, clearDraft } from '../data/drafts.js';
import { idb } from '../data/db.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { today, nowTime, parseNum, num, money, fdatetime } from '../util/format.js';
import { PARAMS } from '../domain/chem.js';

const OPTIONAL = ['alcalinidad', 'estabilizante'];

export default async function visitaForm(root, ctx) {
  const editId = ctx.params.id;
  const existing = editId ? get('visitas', editId) : null;
  if (editId && !existing) { mount(root, errorState('No encontramos esa visita. Puede que se haya borrado.')); return; }
  const agenda = ctx.query.agenda ? get('agenda', ctx.query.agenda) : null;
  const draftKey = `visita:${editId || 'nueva'}`;

  // Valores iniciales
  const base = existing ? { ...existing } : {
    cliente_id: agenda?.cliente_id || ctx.query.cliente || '',
    pileta_id: agenda?.pileta_id || '',
    agenda_id: agenda?.id || '',
    fecha: today(),
    hora: nowTime(),
    ph: '', cloro: '', alcalinidad: '', estabilizante: '',
    productos: [], foto_antes: '', foto_despues: '', observaciones: '',
    monto: '', estado_pago: 'pagado'
  };
  if (!existing && base.cliente_id) {
    const c = get('clientes', base.cliente_id);
    if (c?.tarifa_tipo === 'visita' && c.tarifa_monto !== '') base.monto = c.tarifa_monto;
    if (c?.tarifa_tipo === 'abono') base.estado_pago = 'sin_cargo';
    if (!base.pileta_id) { const ps = piletasDe(base.cliente_id); if (ps.length === 1) base.pileta_id = ps[0].id; }
  }
  const draft = await getDraft(draftKey);
  // Un borrador viejo no pisa un link explícito (desde la agenda o la ficha de otro cliente).
  const matchesLink = !draft || ((!agenda || draft.data.agenda_id === agenda.id) && (!ctx.query.cliente || draft.data.cliente_id === ctx.query.cliente));
  const useDraft = draft && matchesLink && (!existing || draft.t > Date.parse(existing.actualizado_en));
  const init = useDraft ? { ...base, ...draft.data } : base;

  // Productos que vienen de la calculadora ("Aplicar a una visita"): se suman a lo que ya había.
  if (ctx.query.desde === 'calc') {
    const fromCalc = await idb.kvGet('calc:aplicar');
    if (fromCalc?.productos?.length) {
      init.productos = [...(init.productos || []), ...fromCalc.productos];
      for (const [k, v] of Object.entries(fromCalc.m || {})) if (v !== '' && (init[k] === '' || init[k] === undefined)) init[k] = v;
      if (fromCalc.cliente_id && !init.cliente_id) init.cliente_id = fromCalc.cliente_id;
      if (fromCalc.pileta_id && !init.pileta_id) init.pileta_id = fromCalc.pileta_id;
      await idb.kvDel('calc:aplicar');
      await saveDraft(draftKey, init);
    }
  }

  const stock = all('stock').sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
  const showOptional = OPTIONAL.some((k) => init[k] !== '' && init[k] !== undefined);

  mount(root, html`
    ${pageHead(existing ? 'Editar visita' : 'Registrar visita', agenda ? 'Desde la agenda' : '')}
    ${useDraft ? html`<div class="alert info" id="draft-banner" style="margin-bottom:16px">${icon('info')}<div class="grow"><p class="alert-title">Recuperamos un borrador</p><p>Guardado ${fdatetime(new Date(draft.t).toISOString())}.</p></div><button class="btn btn-sm btn-ghost" type="button" data-action="discard-draft">Descartar</button></div>` : ''}
    <form class="form" id="vf" novalidate>
      ${clientPicker('cliente_id', init.cliente_id)}
      <div class="field"><label for="pileta">Pileta</label><select class="select" id="pileta" name="pileta_id">${piletaOptions(init.cliente_id, init.pileta_id)}</select></div>
      <div class="grid-2">
        <div class="field"><label for="fecha">Fecha *</label><input class="input" type="date" id="fecha" name="fecha" required></div>
        <div class="field"><label for="hora">Hora</label><input class="input" type="time" id="hora" name="hora"></div>
      </div>

      <p class="fieldset-title">Medición</p>
      <div class="grid-2">
        <div class="field"><label for="ph">pH</label><input class="input" id="ph" name="ph" inputmode="decimal" placeholder="7,4" autocomplete="off"></div>
        <div class="field"><label for="cloro">Cloro libre</label><div class="input-suffix"><input class="input" id="cloro" name="cloro" inputmode="decimal" placeholder="1,5" autocomplete="off"><span>ppm</span></div></div>
      </div>
      <details class="details" ${showOptional ? 'open' : ''}>
        <summary>Más parámetros (opcional)</summary>
        <div class="grid-2" style="margin-top:12px">
          <div class="field"><label for="alcalinidad">Alcalinidad</label><div class="input-suffix"><input class="input" id="alcalinidad" name="alcalinidad" inputmode="decimal" autocomplete="off"><span>ppm</span></div></div>
          <div class="field"><label for="estabilizante">Estabilizante</label><div class="input-suffix"><input class="input" id="estabilizante" name="estabilizante" inputmode="decimal" autocomplete="off"><span>ppm</span></div></div>
        </div>
      </details>
      <div id="chem-warn" aria-live="polite"></div>

      <p class="fieldset-title">Productos usados</p>
      <p class="field-hint" style="margin-top:-8px">Se descuentan del stock al guardar.</p>
      <div id="prods" class="stack"></div>
      <button class="btn btn-ghost btn-sm" type="button" data-action="add-prod" ${stock.length ? '' : 'disabled'}>${icon('plus')}Agregar producto</button>
      ${stock.length ? '' : html`<p class="field-hint">Cargá tus productos en <a href="#/stock">Stock</a> para poder elegirlos.</p>`}

      <p class="fieldset-title">Fotos</p>
      <div class="grid-2">
        ${photoField('foto_antes', 'Antes', init.foto_antes)}
        ${photoField('foto_despues', 'Después', init.foto_despues)}
      </div>

      <div class="field"><label for="obs">Observaciones</label><textarea class="textarea" id="obs" name="observaciones" placeholder="Estado del agua, equipos, recomendaciones…"></textarea></div>

      <p class="fieldset-title">Cobro</p>
      <div class="grid-2">
        <div class="field"><label for="monto">Monto</label><div class="input-suffix"><input class="input" id="monto" name="monto" inputmode="decimal" placeholder="0" autocomplete="off"><span>$</span></div></div>
        <div class="field"><label for="pago">Estado de pago</label><select class="select" id="pago" name="estado_pago">
          <option value="pagado">Pagado</option><option value="pendiente">Pendiente</option><option value="sin_cargo">Sin cargo / abono</option></select></div>
      </div>

      <div class="form-actions">
        <a class="btn btn-ghost" href="${existing ? `#/visitas/${existing.id}` : '#/inicio'}">Cancelar</a>
        <button class="btn" type="submit">${icon('check')}Guardar</button>
      </div>
    </form>`);

  const form = root.querySelector('#vf');
  fillForm(form, { ...init, ph: fmt(init.ph), cloro: fmt(init.cloro), alcalinidad: fmt(init.alcalinidad), estabilizante: fmt(init.estabilizante), monto: init.monto === '' ? '' : String(init.monto) });
  const prodsBox = root.querySelector('#prods');

  function prodRow(p = {}) {
    const opts = stock.map((s) => `<option value="${esc(s.id)}" ${s.id === p.producto_id ? 'selected' : ''}>${esc(s.producto)} (${esc(s.unidad || '')})</option>`).join('');
    const div = document.createElement('div');
    div.className = 'prod-row';
    div.innerHTML = `
      <div class="field"><label class="sr-only">Producto</label><select class="select" data-p="producto_id"><option value="">Elegí producto</option>${opts}</select></div>
      <div class="field"><label class="sr-only">Cantidad</label><input class="input" data-p="cantidad" inputmode="decimal" placeholder="Cant." value="${esc(fmt(p.cantidad))}"></div>
      <button class="icon-btn soft" type="button" data-action="rm-prod" aria-label="Quitar producto">${icon('trash')}</button>`;
    prodsBox.appendChild(div);
  }
  (init.productos || []).forEach(prodRow);

  function readProds() {
    return [...prodsBox.querySelectorAll('.prod-row')].map((row) => {
      const id = row.querySelector('[data-p="producto_id"]').value;
      const s = stock.find((x) => x.id === id);
      return { producto_id: id, nombre: s?.producto || '', unidad: s?.unidad || '', cantidad: parseNum(row.querySelector('[data-p="cantidad"]').value) };
    }).filter((p) => p.producto_id || p.cantidad !== '');
  }

  function chemWarn() {
    const d = formData(form);
    const rangos = settings().rangos;
    const out = [];
    for (const k of ['ph', 'cloro', 'alcalinidad', 'estabilizante']) {
      const v = parseNum(d[k]);
      if (v === '' || isNaN(v)) continue;
      const st = rangeStatus(v, rangos[k]);
      if (st && st !== 'ok') out.push({ k, v, st, range: rangos[k] });
    }
    const box = root.querySelector('#chem-warn');
    if (!out.length) { box.innerHTML = ''; return; }
    const p = d.pileta_id ? get('piletas', d.pileta_id) : null;
    const q = new URLSearchParams({ ...(p?.m3 !== '' && p ? { pileta: p.id } : {}), ...Object.fromEntries(['ph', 'cloro', 'alcalinidad', 'estabilizante'].map((k) => [k, d[k]]).filter(([, v]) => v)) });
    mount(box, html`<div class="alert ${out.some((o) => o.st === 'danger') ? 'danger' : 'warn'}">${icon('alert')}<div class="grow">
      <p class="alert-title">Fuera de rango</p>
      <ul style="margin:4px 0 6px;padding-left:18px">${out.map((o) => html`<li>${PARAMS[o.k].label}: ${num(o.v)} ${PARAMS[o.k].unit} (${o.v < o.range[0] ? 'bajo' : 'alto'}; objetivo ${num(o.range[0])}–${num(o.range[1])})</li>`)}</ul>
      <a href="#/calculadora?${q.toString()}&volver=${encodeURIComponent(location.hash.split('?')[0] + (agenda ? `?agenda=${agenda.id}` : ''))}">Calcular la corrección →</a>
    </div></div>`);
  }

  const persistDraft = debounce(() => saveDraft(draftKey, { ...formData(form), productos: readProds() }), 400);
  form.addEventListener('input', () => { persistDraft(); chemWarn(); });
  form.addEventListener('change', persistDraft);
  bindPhotoFields(form, persistDraft);
  bindClientPicker(form, 'cliente_id', (c) => {
    const ps = piletasDe(c.id);
    form.pileta_id.innerHTML = String(piletaOptions(c.id, ps.length === 1 ? ps[0].id : ''));
    if (!existing && form.monto.value === '' && c.tarifa_tipo === 'visita' && c.tarifa_monto !== '') form.monto.value = c.tarifa_monto;
    if (!existing && c.tarifa_tipo === 'abono') form.estado_pago.value = 'sin_cargo';
    persistDraft();
  });
  on(root, 'click', '#chem-warn a', () => saveDraft(draftKey, { ...formData(form), productos: readProds() }));
  on(root, 'click', '[data-action="add-prod"]', () => { prodRow(); prodsBox.lastElementChild.querySelector('select').focus(); });
  on(root, 'click', '[data-action="rm-prod"]', (e, b) => { b.closest('.prod-row').remove(); persistDraft(); });
  on(root, 'click', '[data-action="discard-draft"]', async () => {
    persistDraft.cancel(); await clearDraft(draftKey);
    toast('Borrador descartado');
    navigate(location.hash, { replace: true });
  });
  chemWarn();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const productos = readProds();
    const errors = {};
    if (!d.cliente_id) errors.cliente_id = 'Elegí un cliente de la lista.';
    if (!d.fecha) errors.fecha = 'Indicá la fecha.';
    const nums = {};
    for (const k of ['ph', 'cloro', 'alcalinidad', 'estabilizante', 'monto']) {
      nums[k] = parseNum(d[k]);
      if (Number.isNaN(nums[k])) errors[k] = 'Ingresá un número válido (podés usar coma).';
    }
    if (nums.ph !== '' && !errors.ph && (nums.ph < 0 || nums.ph > 14)) errors.ph = 'El pH va de 0 a 14.';
    for (const k of ['cloro', 'alcalinidad', 'estabilizante', 'monto']) if (nums[k] !== '' && !errors[k] && nums[k] < 0) errors[k] = 'No puede ser negativo.';
    const badProd = productos.find((p) => !p.producto_id || p.cantidad === '' || Number.isNaN(p.cantidad) || p.cantidad <= 0);
    if (badProd) { toast('Revisá los productos: elegí el producto y una cantidad mayor a 0.'); return; }
    if (Object.keys(errors).length) {
      showErrors(form, errors);
      // El cliente se elige en el buscador visible (el id va en un campo oculto).
      if (errors.cliente_id) form.querySelector('#combo-cliente_id').focus();
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.classList.add('is-loading');
    try {
      const rec = await save('visitas', {
        ...(existing || {}),
        cliente_id: d.cliente_id, pileta_id: d.pileta_id, agenda_id: existing?.agenda_id || init.agenda_id || '',
        fecha: d.fecha, hora: d.hora,
        ph: nums.ph, cloro: nums.cloro, alcalinidad: nums.alcalinidad, estabilizante: nums.estabilizante,
        productos, foto_antes: d.foto_antes, foto_despues: d.foto_despues,
        observaciones: d.observaciones, monto: nums.monto, estado_pago: d.estado_pago
      });
      await applyStock(existing?.productos || [], productos);
      const ag = rec.agenda_id ? get('agenda', rec.agenda_id) : null;
      if (ag && (ag.estado !== 'hecha' || ag.visita_id !== rec.id)) await save('agenda', { ...ag, estado: 'hecha', visita_id: rec.id });
      persistDraft.cancel(); await clearDraft(draftKey);
      toast(existing ? 'Visita actualizada' : `Visita guardada${rec.monto ? ` · ${money(rec.monto)}` : ''}`);
      navigate(`#/visitas/${rec.id}`, { replace: true });
    } catch (err) {
      btn.classList.remove('is-loading');
      toast(`No se pudo guardar: ${err.message}`);
    }
  });
}

function fmt(v) { return v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','); }

/** Descuenta del stock la diferencia entre productos anteriores y nuevos. */
async function applyStock(before, after) {
  const diff = new Map();
  for (const p of before || []) if (p.producto_id) diff.set(p.producto_id, (diff.get(p.producto_id) || 0) + (Number(p.cantidad) || 0));
  for (const p of after) diff.set(p.producto_id, (diff.get(p.producto_id) || 0) - (Number(p.cantidad) || 0));
  for (const [id, d] of diff) if (Math.abs(d) > 1e-9) await ajustarStock(id, d);
}

export { applyStock };
