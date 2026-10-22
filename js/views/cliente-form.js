import { html, mount, on, debounce, formData, fillForm, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, photoField, bindPhotoFields, errorState } from '../ui/components.js';
import { get, save, piletasDe } from '../data/store.js';
import { getDraft, saveDraft, clearDraft } from '../data/drafts.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { currentPosition, parseMapsLink } from '../util/geo.js';
import { parseNum, fdatetime } from '../util/format.js';
import { piletaFields, readPileta, validatePileta, bindPiletaFields, piletaTieneDatos } from './pileta-form.js';

export default async function clienteForm(root, ctx) {
  const id = ctx.params.id;
  const existing = id ? get('clientes', id) : null;
  if (id && !existing) { mount(root, errorState('No encontramos ese cliente.')); return; }
  const draftKey = `cliente:${id || 'nuevo'}`;
  // Un borrador se activa al completarlo (el usuario puede volver a elegir "Borrador" si todavía le faltan datos).
  const base = existing ? { ...existing, ...(existing.estado === 'borrador' ? { estado: 'activo' } : {}) } : { estado: 'activo', tarifa_tipo: 'visita' };
  const draft = await getDraft(draftKey);
  const useDraft = draft && (!existing || draft.t > Date.parse(existing.actualizado_en));
  const init = useDraft ? { ...base, ...draft.data } : base;
  const firstPool = !existing; // al crear, se carga la primera pileta en el mismo formulario

  mount(root, html`
    ${pageHead(existing ? (existing.estado === 'borrador' ? 'Completar cliente' : 'Editar cliente') : 'Nuevo cliente')}
    ${existing?.estado === 'borrador' ? html`<div class="alert warn" style="margin-bottom:16px">${icon('info')}<p>Este cliente se creó desde la agenda o una visita. Completá sus datos y guardá: pasa a <strong>Activo</strong>.</p></div>` : ''}
    ${useDraft ? html`<div class="alert info" style="margin-bottom:16px">${icon('info')}<div class="grow"><p class="alert-title">Recuperamos un borrador</p><p>Guardado ${fdatetime(new Date(draft.t).toISOString())}.</p></div><button class="btn btn-sm btn-ghost" type="button" data-action="discard">Descartar</button></div>` : ''}
    <form class="form" id="cf" novalidate>
      <p class="fieldset-title">Datos personales</p>
      <div class="grid-2">
        <div class="field"><label for="nombre">Nombre *</label><input class="input" id="nombre" name="nombre" autocomplete="off" required></div>
        <div class="field"><label for="apellido">Apellido</label><input class="input" id="apellido" name="apellido" autocomplete="off"></div>
      </div>
      <div class="field"><label for="tel">Teléfono (WhatsApp)</label><input class="input" id="tel" name="telefono" type="tel" inputmode="tel" placeholder="351 123 4567" autocomplete="off">
        <p class="field-hint">Con código de área, sin 0 ni 15. Ej.: 351 1234567.</p></div>
      <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="off"></div>

      <p class="fieldset-title">Dirección y ubicación</p>
      <div class="field"><label for="dir">Dirección</label><input class="input" id="dir" name="direccion" placeholder="Calle y número" autocomplete="off"></div>
      <div class="field"><label for="barrio">Barrio / ciudad</label><input class="input" id="barrio" name="barrio" placeholder="Argüello, Villa Belgrano…" autocomplete="off"></div>
      <div class="card card-soft stack">
        <div class="row-between"><span class="label">Coordenadas</span><span class="small mono" id="coords"></span></div>
        <input type="hidden" name="lat"><input type="hidden" name="lng">
        <button class="btn btn-ghost btn-block" type="button" data-action="gps">${icon('locate')}Usar mi ubicación actual</button>
        <div class="field"><label for="maps">O pegá un enlace de Google Maps</label>
          <div class="input-group"><input class="input" id="maps" name="_maps" placeholder="https://www.google.com/maps/…" autocomplete="off"><button class="btn btn-soft" type="button" data-action="parse">${icon('link')}</button></div></div>
        <button class="btn btn-sm btn-ghost" type="button" data-action="clear-geo" hidden>Quitar ubicación</button>
      </div>

      <p class="fieldset-title">Tarifa</p>
      <div class="grid-2">
        <div class="field"><label for="tt">Modalidad</label><select class="select" id="tt" name="tarifa_tipo"><option value="visita">Por visita</option><option value="abono">Abono mensual</option></select></div>
        <div class="field"><label for="tm">Monto</label><div class="input-suffix"><input class="input" id="tm" name="tarifa_monto" inputmode="decimal" autocomplete="off"><span>$</span></div></div>
      </div>
      <div class="field"><label for="estado">Estado</label><select class="select" id="estado" name="estado"><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="borrador">Borrador (datos incompletos)</option></select></div>
      <div class="field"><label for="notas">Notas</label><textarea class="textarea" id="notas" name="notas" placeholder="Horarios, acceso, preferencias…"></textarea></div>

      ${firstPool ? html`
        <p class="fieldset-title">Pileta</p>
        ${photoField('p_foto', 'Foto de la pileta', init.p_foto || '')}
        ${piletaFields('p_')}
        <p class="field-hint">Podés agregar más piletas desde la ficha del cliente.</p>` : html`
        <p class="field-hint">${piletasDe(existing.id).length} pileta(s). Se editan desde la ficha del cliente.</p>`}

      <div class="form-actions">
        <a class="btn btn-ghost" href="${existing ? `#/clientes/${existing.id}` : '#/clientes'}">Cancelar</a>
        <button class="btn" type="submit">${icon('check')}Guardar</button>
      </div>
    </form>`);

  const form = root.querySelector('#cf');
  fillForm(form, { ...init, tarifa_monto: init.tarifa_monto === '' || init.tarifa_monto === undefined ? '' : String(init.tarifa_monto) });

  const paintCoords = () => {
    const has = form.lat.value !== '' && form.lng.value !== '';
    root.querySelector('#coords').textContent = has ? `${Number(form.lat.value).toFixed(5)}, ${Number(form.lng.value).toFixed(5)}` : 'Sin ubicación';
    root.querySelector('[data-action="clear-geo"]').hidden = !has;
  };
  paintCoords();
  const persist = debounce(() => saveDraft(draftKey, formData(form)), 400);
  form.addEventListener('input', persist);
  bindPhotoFields(form, persist);
  if (firstPool) bindPiletaFields(form, 'p_', persist);

  on(root, 'click', '[data-action="gps"]', async (e, b) => {
    b.classList.add('is-loading');
    try {
      const p = await currentPosition();
      form.lat.value = p.lat; form.lng.value = p.lng;
      paintCoords(); persist();
      toast(`Ubicación guardada (±${Math.round(p.acc)} m)`);
    } catch (err) { toast(err.message); } finally { b.classList.remove('is-loading'); }
  });
  on(root, 'click', '[data-action="parse"]', () => {
    try {
      const p = parseMapsLink(form._maps.value);
      form.lat.value = p.lat; form.lng.value = p.lng; form._maps.value = '';
      paintCoords(); persist();
      toast('Coordenadas extraídas del enlace');
    } catch (err) { showErrors(form, { _maps: err.message }); }
  });
  on(root, 'click', '[data-action="clear-geo"]', () => { form.lat.value = ''; form.lng.value = ''; paintCoords(); persist(); });
  on(root, 'click', '[data-action="discard"]', async () => { persist.cancel(); await clearDraft(draftKey); navigate(location.hash, { replace: true }); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const errors = {};
    if (!d.nombre) errors.nombre = 'El nombre es obligatorio.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.email = 'Email inválido.';
    if (d.telefono && d.telefono.replace(/\D/g, '').length < 8) errors.telefono = 'Teléfono incompleto.';
    const tm = parseNum(d.tarifa_monto);
    if (Number.isNaN(tm) || (tm !== '' && tm < 0)) errors.tarifa_monto = 'Monto inválido.';
    let pileta = null;
    if (firstPool) {
      pileta = readPileta(d, 'p_');
      Object.assign(errors, validatePileta(pileta, 'p_'));
    }
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    const btn = form.querySelector('[type="submit"]');
    btn.classList.add('is-loading');
    try {
      const rec = await save('clientes', {
        ...(existing || {}),
        nombre: d.nombre, apellido: d.apellido, telefono: d.telefono, email: d.email,
        direccion: d.direccion, barrio: d.barrio, lat: d.lat, lng: d.lng,
        tarifa_tipo: d.tarifa_tipo, tarifa_monto: tm, estado: d.estado, notas: d.notas
      });
      if (pileta && (piletaTieneDatos(pileta) || d.p_foto)) {
        await save('piletas', { ...pileta, cliente_id: rec.id, foto: d.p_foto, nombre: pileta.nombre || 'Pileta principal' });
      }
      persist.cancel(); await clearDraft(draftKey);
      toast(existing ? 'Cliente actualizado' : 'Cliente creado');
      navigate(`#/clientes/${rec.id}`, { replace: true });
    } catch (err) {
      btn.classList.remove('is-loading');
      toast(`No se pudo guardar: ${err.message}`);
    }
  });
}
