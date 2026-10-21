import { html, mount, on, debounce, formData, fillForm, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, clientPicker, bindClientPicker, piletaOptions, quickActions, errorState, isNewClientRef } from '../ui/components.js';
import { get, piletasDe, remove, ensureCliente } from '../data/store.js';
import { settings } from '../data/settings.js';
import { getDraft, saveDraft, clearDraft } from '../data/drafts.js';
import { confirmDialog, sheet } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { today, nowTime, addDays, seasonOf, fdate, longDate, fullName, timeToMin, minToTime, parseNum, capFirst } from '../util/format.js';
import { ESTADOS, RECURRENCIAS, overlaps, createSeries, updateOccurrence, seriesDates, label } from '../domain/agenda.js';

export default async function agendaForm(root, ctx) {
  const id = ctx.params.id;
  const item = id ? get('agenda', id) : null;
  if (id && !item) { mount(root, errorState('No encontramos esa visita agendada.')); return; }
  const cfg = settings();
  const draftKey = `agenda:${id || 'nueva'}`;

  const nextHour = minToTime(Math.min(23 * 60, Math.ceil((timeToMin(nowTime()) + 1) / 60) * 60));
  const fecha0 = ctx.query.fecha || today();
  const defaultHasta = (() => {
    const byWeeks = addDays(fecha0, 7 * (Number(cfg.agenda.repetir_semanas) || 12));
    const season = seasonOf(fecha0).to;
    return fecha0 <= season && byWeeks > season ? season : byWeeks;
  })();
  const base = item ? { ...item, hasta: '' } : {
    cliente_id: ctx.query.cliente || '', pileta_id: '', fecha: fecha0, hora: ctx.query.hora || nextHour,
    duracion: cfg.agenda.duracion, recurrencia: 'unica', hasta: defaultHasta, notas: ''
  };
  if (!item && base.cliente_id) { const ps = piletasDe(base.cliente_id); if (ps.length === 1) base.pileta_id = ps[0].id; }
  const draft = await getDraft(draftKey);
  const fromLink = !item && (ctx.query.fecha || ctx.query.hora || ctx.query.cliente);
  const init = draft && !fromLink && (!item || draft.t > Date.parse(item.actualizado_en)) ? { ...base, ...draft.data } : base;
  const c = item ? get('clientes', item.cliente_id) : null;
  const st = item ? ESTADOS[item.estado] : null;

  mount(root, html`
    ${pageHead(item ? 'Visita agendada' : 'Programar visita', item ? `${capFirst(longDate(item.fecha))} · ${item.hora} h` : '')}
    ${item ? html`
      <div class="card">
        <div class="row-between"><p class="card-title">${fullName(c)}</p><span class="badge ${st.badge}">${st.label}</span></div>
        <p class="card-sub">${c?.direccion || 'Sin dirección'}${item.serie_id ? ` · ${RECURRENCIAS[item.recurrencia] || ''}` : ''}</p>
        ${quickActions(c, { waText: `Hola ${c?.nombre || ''}! Te confirmo la visita del ${fdate(item.fecha)} a las ${item.hora} h.` })}
        <div class="btn-row" style="margin-top:12px">
          ${item.estado !== 'hecha' ? html`<a class="btn btn-sm" href="#/visitas/nueva?agenda=${item.id}">${icon('check')}Registrar visita</a>` : item.visita_id ? html`<a class="btn btn-sm btn-ghost" href="#/visitas/${item.visita_id}">Ver registro</a>` : ''}
          ${item.estado !== 'hecha' ? html`<button class="btn btn-sm btn-ghost" type="button" data-action="done">Marcar hecha</button>` : ''}
          ${item.estado !== 'cancelada' && item.estado !== 'hecha' ? html`<button class="btn btn-sm btn-danger" type="button" data-action="cancel">Cancelar</button>` : ''}
        </div>
      </div>
      <p class="fieldset-title" style="margin-top:24px">Reprogramar o editar</p>` : ''}

    <form class="form" id="af" novalidate>
      ${item ? html`<input type="hidden" name="cliente_id" value="${item.cliente_id}">` : clientPicker('cliente_id', init.cliente_id)}
      <div class="field"><label for="pileta">Pileta</label><select class="select" id="pileta" name="pileta_id">${piletaOptions(init.cliente_id, init.pileta_id)}</select></div>
      <div class="grid-2">
        <div class="field"><label for="fecha">Fecha *</label><input class="input" type="date" id="fecha" name="fecha" required></div>
        <div class="field"><label for="hora">Hora *</label><input class="input" type="time" id="hora" name="hora" required step="300"></div>
      </div>
      <div class="field"><label for="dur">Duración estimada</label><div class="input-suffix"><input class="input" id="dur" name="duracion" inputmode="numeric"><span>min</span></div></div>
      ${item ? (item.serie_id ? html`<div class="field"><span class="label">Aplicar cambios a</span>
          <div class="segmented" role="radiogroup">
            <label class="seg-radio"><input type="radio" name="scope" value="una" checked> Solo esta</label>
            <label class="seg-radio"><input type="radio" name="scope" value="serie"> Esta y las siguientes</label>
          </div><p class="field-hint">La fecha nueva se aplica solo a esta visita; hora, duración y notas, a las que elijas.</p></div>` : '')
      : html`
        <div class="field"><label for="rec">Recurrencia</label><select class="select" id="rec" name="recurrencia">
          ${Object.entries(RECURRENCIAS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
        <div class="field" id="hasta-field"><label for="hasta">Repetir hasta</label><input class="input" type="date" id="hasta" name="hasta"><p class="field-hint" id="hasta-hint"></p></div>`}
      <div class="field"><label for="notas">Notas</label><textarea class="textarea" id="notas" name="notas" placeholder="Portón, llaves, perro, etc."></textarea></div>
      <div id="overlap" aria-live="polite"></div>
      <div class="form-actions">
        ${item ? html`<button class="btn btn-ghost" type="button" data-action="delete" aria-label="Eliminar">${icon('trash')}</button>` : html`<a class="btn btn-ghost" href="#/calendario">Cancelar</a>`}
        <button class="btn" type="submit">${icon('check')}${item ? 'Guardar cambios' : 'Agendar'}</button>
      </div>
    </form>`);

  const form = root.querySelector('#af');
  fillForm(form, init);

  function check() {
    const d = formData(form);
    const box = root.querySelector('#overlap');
    if (!item) {
      const rec = d.recurrencia;
      root.querySelector('#hasta-field').hidden = rec === 'unica';
      if (rec !== 'unica' && d.fecha && d.hasta) {
        const n = seriesDates(d.fecha, rec, d.hasta).length;
        root.querySelector('#hasta-hint').textContent = `Se crearán ${n} visita${n > 1 ? 's' : ''}.`;
      }
    }
    if (!d.fecha || !d.hora) { box.innerHTML = ''; return; }
    const ov = overlaps(d.fecha, d.hora, parseNum(d.duracion) || 0, item ? [item.id] : []);
    mount(box, ov.length ? html`<div class="alert warn">${icon('alert')}<div><p class="alert-title">Se superpone con ${ov.length} visita${ov.length > 1 ? 's' : ''}</p>
      <ul style="margin:4px 0 0;padding-left:18px">${ov.map((o) => html`<li>${o.hora} h · ${label(o)} (${o.duracion || '?'} min)</li>`)}</ul></div></div>` : '');
  }
  const persist = debounce(() => saveDraft(draftKey, formData(form)), 400);
  form.addEventListener('input', () => { check(); persist(); });
  form.addEventListener('change', () => { check(); persist(); });
  if (!item) bindClientPicker(form, 'cliente_id', (cl) => {
    const ps = piletasDe(cl.id);
    form.pileta_id.innerHTML = String(piletaOptions(cl.id, ps.length === 1 ? ps[0].id : ''));
  }, { allowNew: true });
  check();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const errors = {};
    if (!d.cliente_id) errors.cliente_id = 'Elegí un cliente de la lista.';
    if (!d.fecha) errors.fecha = 'Indicá la fecha.';
    if (!d.hora) errors.hora = 'Indicá la hora.';
    const dur = parseNum(d.duracion);
    if (dur === '' || Number.isNaN(dur) || dur < 5 || dur > 600) errors.duracion = 'Entre 5 y 600 minutos.';
    if (!item && d.recurrencia !== 'unica') {
      if (!d.hasta) errors.hasta = 'Indicá hasta cuándo repetir.';
      else if (d.hasta < d.fecha) errors.hasta = 'Tiene que ser posterior a la fecha de inicio.';
    }
    if (Object.keys(errors).length) {
      showErrors(form, errors);
      if (errors.cliente_id) form.querySelector('#combo-cliente_id')?.focus();
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.classList.add('is-loading');
    try {
      if (item) {
        const moved = d.fecha !== item.fecha || d.hora !== item.hora;
        const patch = { pileta_id: d.pileta_id, fecha: d.fecha, hora: d.hora, duracion: dur, notas: d.notas };
        if (moved && item.estado === 'pendiente') patch.estado = 'reprogramada';
        if (moved && item.estado === 'cancelada') patch.estado = 'reprogramada';
        await updateOccurrence(item, patch, d.scope || 'una');
        toast(moved ? `Reprogramada para el ${fdate(d.fecha)} a las ${d.hora} h` : 'Cambios guardados');
      } else {
        const nuevo = isNewClientRef(d.cliente_id);
        const clienteId = await ensureCliente(d.cliente_id, 'la agenda');
        const created = await createSeries({ cliente_id: clienteId, pileta_id: d.pileta_id, fecha: d.fecha, hora: d.hora, duracion: dur, recurrencia: d.recurrencia, notas: d.notas }, d.recurrencia === 'unica' ? '' : d.hasta);
        toast((created.length > 1 ? `${created.length} visitas agendadas` : 'Visita agendada') + (nuevo ? '. El cliente quedó como borrador en Clientes.' : ''), { duration: nuevo ? 5000 : 3200 });
      }
      persist.cancel(); await clearDraft(draftKey);
      navigate(`#/calendario?fecha=${d.fecha}`, { replace: true });
    } catch (err) {
      btn.classList.remove('is-loading');
      toast(`No se pudo guardar: ${err.message}`);
    }
  });

  if (item) {
    const askScope = (title, confirm) => new Promise((resolve) => {
      if (!item.serie_id) { confirmDialog({ title, message: `${fullName(c)} · ${fdate(item.fecha)} ${item.hora} h`, confirm, danger: true }).then((ok) => resolve(ok ? 'una' : null)); return; }
      let ans = null;
      const s = sheet({
        title,
        content: html`<p class="muted">Esta visita es parte de una serie ${RECURRENCIAS[item.recurrencia]?.toLowerCase() || ''}.</p>`,
        footer: html`<button class="btn btn-ghost" type="button" data-s="una">Solo esta</button><button class="btn btn-danger" type="button" data-s="serie">Esta y siguientes</button>`,
        onClose: () => resolve(ans)
      });
      on(s.el, 'click', '[data-s]', (ev, b) => { ans = b.dataset.s; s.close(); });
    });
    on(root, 'click', '[data-action="cancel"]', async () => {
      const scope = await askScope('Cancelar visita', 'Cancelar visita');
      if (!scope) return;
      await updateOccurrence(item, { estado: 'cancelada' }, scope);
      toast('Visita cancelada');
      navigate(`#/calendario?fecha=${item.fecha}`, { replace: true });
    });
    on(root, 'click', '[data-action="done"]', async () => {
      await updateOccurrence(item, { estado: 'hecha' }, 'una');
      toast('Marcada como hecha', { action: 'Registrar', onAction: () => navigate(`#/visitas/nueva?agenda=${item.id}`) });
      navigate(`#/calendario?fecha=${item.fecha}`, { replace: true });
    });
    on(root, 'click', '[data-action="delete"]', async () => {
      const ok = await confirmDialog({ title: 'Eliminar turno', message: 'Se borra solo esta visita de la agenda (no el registro de visita, si existe).', confirm: 'Eliminar', danger: true });
      if (!ok) return;
      await remove('agenda', item.id);
      persist.cancel(); await clearDraft(draftKey);
      toast('Turno eliminado');
      navigate(`#/calendario?fecha=${item.fecha}`, { replace: true });
    });
  }
}
