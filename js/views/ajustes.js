import { html, mount, on, formData, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead } from '../ui/components.js';
import { settings, saveSettings, DEFAULTS } from '../data/settings.js';
import { getConnection, saveConnection, call, isConfigured, logout } from '../data/api.js';
import { getStatus, syncNow, fullResync, getQueue, discardFailed, refreshPending } from '../data/sync.js';
import { bus, getRaw } from '../data/store.js';
import { ENTITIES } from '../data/schema.js';
import { idb } from '../data/db.js';
import { exportFiles, downloadFile } from '../util/csv.js';
import { currentPosition } from '../util/geo.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { fdatetime, parseNum, num } from '../util/format.js';
import { PARAMS } from '../domain/chem.js';
import { TEMAS, getThemePref, setThemePref } from '../ui/theme.js';

const STATE_TXT = { ok: 'Sincronizado', pendiente: 'Cambios pendientes', sincronizando: 'Sincronizando…', offline: 'Sin conexión', error: 'Error', sin_configurar: 'Sin configurar' };

export default async function ajustes(root, ctx) {
  const conn = getConnection();
  const cfg = settings();

  mount(root, html`
    ${pageHead('Ajustes')}

    <section class="card stack" aria-labelledby="h-tema" style="margin-bottom:20px">
      <h2 class="section-title" id="h-tema">Apariencia</h2>
      <div class="segmented" role="radiogroup" aria-labelledby="h-tema">
        ${Object.entries(TEMAS).map(([k, l]) => html`<button type="button" role="radio" data-tema="${k}" aria-checked="${k === getThemePref()}" aria-pressed="${k === getThemePref()}">${l}</button>`)}
      </div>
      <p class="small muted">Automático sigue el modo del iPhone. Se guarda en este dispositivo.</p>
    </section>

    <section class="card stack" aria-labelledby="h-con">
      <h2 class="section-title" id="h-con">Cuenta y sincronización</h2>
      <div class="row-between">
        <div><p class="strong">${conn.usuario ? `Conectado como ${conn.usuario}` : conn.token ? 'Conectado con token (modo avanzado)' : 'Sin sesión'}</p>
          <p class="small muted">Tus datos se guardan en tu Google Sheets privada.</p></div>
        ${conn.token ? html`<button class="btn btn-sm btn-danger" type="button" data-action="logout">Cerrar sesión</button>` : ''}
      </div>
      <div id="sync-box"></div>
      <details class="details"><summary>Conexión avanzada (URL y token)</summary>
      <p class="small muted" style="margin-top:8px">Solo si necesitás conectar sin usuario, con el token maestro de secreto.gs. Queda guardado solo en este dispositivo.</p>
      <form class="form" id="con-form" novalidate style="margin-top:12px">
        <div class="field"><label for="url">URL del Web App</label><input class="input" id="url" name="url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${conn.url}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label for="token">Token secreto</label>
          <div class="input-group"><input class="input" id="token" name="token" type="password" value="${conn.token}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn btn-soft" type="button" data-action="toggle-token" aria-label="Mostrar u ocultar token">Ver</button></div></div>
        <div class="btn-row">
          <button class="btn btn-ghost" type="button" data-action="test">${icon('refresh')}Probar</button>
          <button class="btn" type="submit">${icon('check')}Guardar conexión</button>
        </div>
      </form>
      </details>
    </section>

    <form id="cfg-form" class="stack-lg" style="margin-top:20px" novalidate>
      <section class="card form" aria-labelledby="h-neg">
        <h2 class="section-title" id="h-neg">Datos del negocio</h2>
        <div class="grid-2">
          <div class="field"><label for="n-nombre">Nombre comercial</label><input class="input" id="n-nombre" name="negocio.nombre" value="${cfg.negocio.nombre}"></div>
          <div class="field"><label for="n-titular">Tu nombre</label><input class="input" id="n-titular" name="negocio.titular" value="${cfg.negocio.titular}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="n-tel">Teléfono</label><input class="input" id="n-tel" name="negocio.telefono" type="tel" value="${cfg.negocio.telefono}"></div>
          <div class="field"><label for="n-mail">Email</label><input class="input" id="n-mail" name="negocio.email" type="email" value="${cfg.negocio.email}"></div>
        </div>
        <div class="field"><label for="n-zona">Zona</label><input class="input" id="n-zona" name="negocio.zona" value="${cfg.negocio.zona}"></div>
        <div class="field"><label for="n-lema">Lema (aparece en el reporte)</label><input class="input" id="n-lema" name="negocio.lema" value="${cfg.negocio.lema}"></div>
      </section>

      <section class="card form" aria-labelledby="h-clima">
        <h2 class="section-title" id="h-clima">Clima</h2>
        <div class="field"><label for="c-ciudad">Ciudad / ubicación por defecto</label><input class="input" id="c-ciudad" name="clima.ciudad" value="${cfg.clima.ciudad}"></div>
        <div class="grid-2">
          <div class="field"><label for="c-lat">Latitud</label><input class="input" id="c-lat" name="clima.lat" inputmode="decimal" value="${cfg.clima.lat}"></div>
          <div class="field"><label for="c-lng">Longitud</label><input class="input" id="c-lng" name="clima.lng" inputmode="decimal" value="${cfg.clima.lng}"></div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="gps">${icon('locate')}Usar mi ubicación</button>
        <div class="field"><label for="c-umb">Avisar lluvia desde (probabilidad)</label><div class="input-suffix"><input class="input" id="c-umb" name="clima.umbral_lluvia" inputmode="numeric" value="${cfg.clima.umbral_lluvia}"><span>%</span></div></div>
      </section>

      <section class="card form" aria-labelledby="h-al">
        <h2 class="section-title" id="h-al">Alertas y agenda</h2>
        <div class="grid-2">
          <div class="field"><label for="a-dias">Cliente sin visitar después de</label><div class="input-suffix"><input class="input" id="a-dias" name="alertas.dias_sin_visita" inputmode="numeric" value="${cfg.alertas.dias_sin_visita}"><span>días</span></div></div>
          <div class="field"><label for="a-prox">Próximos destinos a mostrar</label><div class="input-suffix"><input class="input" id="a-prox" name="alertas.proximos_dias" inputmode="numeric" value="${cfg.alertas.proximos_dias}"><span>días</span></div></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="g-dur">Duración por defecto</label><div class="input-suffix"><input class="input" id="g-dur" name="agenda.duracion" inputmode="numeric" value="${cfg.agenda.duracion}"><span>min</span></div></div>
          <div class="field"><label for="g-rep">Repetir series por</label><div class="input-suffix"><input class="input" id="g-rep" name="agenda.repetir_semanas" inputmode="numeric" value="${cfg.agenda.repetir_semanas}"><span>sem.</span></div></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="g-h0">Calendario desde</label><div class="input-suffix"><input class="input" id="g-h0" name="agenda.hora_inicio" inputmode="numeric" value="${cfg.agenda.hora_inicio}"><span>h</span></div></div>
          <div class="field"><label for="g-h1">hasta</label><div class="input-suffix"><input class="input" id="g-h1" name="agenda.hora_fin" inputmode="numeric" value="${cfg.agenda.hora_fin}"><span>h</span></div></div>
        </div>
      </section>

      <section class="card form" aria-labelledby="h-rang">
        <div class="row-between"><h2 class="section-title" id="h-rang">Rangos de química</h2><button class="btn btn-sm btn-ghost" type="button" data-action="reset-rangos">Restablecer</button></div>
        ${Object.entries(PARAMS).map(([k, p]) => html`<div class="grid-2">
          <div class="field"><label for="r-${k}-min">${p.label} mín.${p.unit ? ` (${p.unit})` : ''}</label><input class="input" id="r-${k}-min" name="rangos.${k}.0" inputmode="decimal" value="${String(cfg.rangos[k][0]).replace('.', ',')}"></div>
          <div class="field"><label for="r-${k}-max">máx.</label><input class="input" id="r-${k}-max" name="rangos.${k}.1" inputmode="decimal" value="${String(cfg.rangos[k][1]).replace('.', ',')}"></div>
        </div>`)}
      </section>
      <div class="form-actions"><button class="btn btn-block" type="submit">${icon('check')}Guardar ajustes</button></div>
    </form>

    <section class="card stack" style="margin-top:20px" aria-labelledby="h-bk">
      <h2 class="section-title" id="h-bk">Backup</h2>
      <p class="small muted">Exporta todas las pestañas a archivos CSV (se abren en Excel o Google Sheets).</p>
      <button class="btn btn-ghost" type="button" data-action="csv">${icon('download')}Exportar backup CSV</button>
    </section>

    <section class="card stack" style="margin-top:20px" aria-labelledby="h-loc">
      <h2 class="section-title" id="h-loc">Datos en este teléfono</h2>
      <p class="small muted" id="storage-info">Calculando…</p>
      <p class="small muted">iOS puede borrar los datos de una app web que no se usa por semanas. Lo que ya se sincronizó está a salvo en tu Google Sheets.</p>
      <button class="btn btn-danger" type="button" data-action="wipe">${icon('trash')}Borrar datos locales</button>
    </section>
    <p class="xsmall muted" style="text-align:center;margin-top:24px">phcontrol · hecho para trabajar con poca señal</p>`);

  async function renderSync() {
    const st = getStatus();
    const queue = await getQueue();
    const byEntity = {};
    for (const q of queue) byEntity[q.entity] = (byEntity[q.entity] || 0) + 1;
    mount(root.querySelector('#sync-box'), html`
      <div class="card card-soft stack">
        <div class="row-between"><span class="strong">${STATE_TXT[st.state]}</span><span class="small muted">${st.lastSync ? `Última: ${fdatetime(st.lastSync)}` : 'Nunca sincronizado'}</span></div>
        ${st.error ? html`<p class="small" style="color:var(--danger)">${st.error}</p>` : ''}
        <p class="small">Cola de sincronización: <strong>${queue.length}</strong> cambio(s)${queue.length ? ` (${Object.entries(byEntity).map(([e, n]) => `${ENTITIES[e]?.sheet || e}: ${n}`).join(', ')})` : ''}</p>
        ${queue.length ? html`<details class="details"><summary>Ver cola</summary><ul class="small" style="margin:8px 0 0;padding-left:18px">${queue.slice(0, 50).map((q) => {
          const r = getRaw(q.entity, q.id);
          return html`<li>${ENTITIES[q.entity]?.sheet}: ${r?.nombre || r?.producto || r?.fecha || q.id}${r?.eliminado ? ' (borrado)' : ''} · ${fdatetime(q.t)}</li>`;
        })}</ul></details>` : ''}
        ${st.failed?.length ? html`<div class="alert danger">${icon('alert')}<div class="grow"><p class="alert-title">Registros rechazados por la hoja</p>
          <ul style="margin:4px 0;padding-left:18px">${st.failed.slice(0, 10).map((f) => html`<li>${ENTITIES[f.entity]?.sheet}: ${f.error}</li>`)}</ul>
          <button class="btn btn-sm btn-danger" type="button" data-action="discard-failed">Descartar rechazados</button></div></div>` : ''}
        <div class="btn-row">
          <button class="btn btn-sm" type="button" data-action="sync" ${isConfigured() ? '' : 'disabled'}>${icon('refresh')}Forzar sincronización</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="full" ${isConfigured() ? '' : 'disabled'}>Descargar todo de nuevo</button>
        </div>
      </div>`);
  }

  async function storageInfo() {
    let txt = '';
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      if (est) txt += `Usando ${num((est.usage || 0) / 1048576, 1)} MB. `;
      txt += persisted ? 'Almacenamiento persistente activo.' : 'Almacenamiento no persistente (instalá la app en la pantalla de inicio).';
    } catch { txt = 'No disponible en este navegador.'; }
    const n = await idb.count('fotos');
    root.querySelector('#storage-info').textContent = `${txt} ${n} foto(s) guardadas en el teléfono.`;
  }

  const onSync = () => renderSync();
  bus.addEventListener('sync', onSync);
  renderSync();
  storageInfo();

  on(root, 'click', '[data-tema]', (e, b) => {
    setThemePref(b.dataset.tema);
    root.querySelectorAll('[data-tema]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); });
  });

  // Conexión
  const conForm = root.querySelector('#con-form');
  const readConn = () => {
    const d = formData(conForm);
    const errors = {};
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(d.url)) errors.url = 'Tiene que ser la URL que termina en /exec.';
    if (d.token.length < 16) errors.token = 'Usá un token largo (16 caracteres o más).';
    return { d, errors };
  };
  on(root, 'click', '[data-action="toggle-token"]', (e, b) => {
    const t = conForm.token;
    t.type = t.type === 'password' ? 'text' : 'password';
    b.textContent = t.type === 'password' ? 'Ver' : 'Ocultar';
  });
  on(root, 'click', '[data-action="test"]', async (e, b) => {
    const { d, errors } = readConn();
    if (Object.keys(errors).length) { showErrors(conForm, errors); return; }
    b.classList.add('is-loading');
    try {
      await call('ping', {}, { connection: d, timeout: 20000 });
      toast('Conexión correcta ✓');
    } catch (err) { toast(err.message, { duration: 6000 }); }
    finally { b.classList.remove('is-loading'); }
  });
  conForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { d, errors } = readConn();
    if (Object.keys(errors).length) { showErrors(conForm, errors); return; }
    showErrors(conForm, {});
    await saveConnection({ ...d, usuario: '' });
    toast('Conexión guardada. Sincronizando…');
    await refreshPending();
    try {
      await call('setup', {}, { timeout: 30000 });
    } catch { /* se informa en el estado */ }
    syncNow();
  });
  on(root, 'click', '[data-action="logout"]', async () => {
    const pending = await idb.count('cola');
    const ok = await confirmDialog({
      title: 'Cerrar sesión',
      message: pending ? `Tenés ${pending} cambio(s) sin subir: se quedan en este teléfono y se suben cuando vuelvas a ingresar.` : 'Vas a tener que ingresar de nuevo con tu usuario y contraseña. Los datos de este teléfono no se borran.',
      confirm: 'Cerrar sesión', danger: true
    });
    if (!ok) return;
    await logout();
    location.reload();
  });
  on(root, 'click', '[data-action="sync"]', () => syncNow());
  on(root, 'click', '[data-action="full"]', async () => {
    if (!(await confirmDialog({ title: 'Descargar todo de nuevo', message: 'Se vuelven a bajar todos los registros de la hoja. Tus cambios pendientes se suben primero.', confirm: 'Descargar' }))) return;
    await fullResync();
    toast('Datos actualizados desde la hoja');
  });
  on(root, 'click', '[data-action="discard-failed"]', async () => {
    if (!(await confirmDialog({ title: 'Descartar rechazados', message: 'Esos cambios quedan solo en el teléfono y no se reintentan. Revisá el error para corregir el dato.', confirm: 'Descartar', danger: true }))) return;
    await discardFailed();
  });

  // Ajustes
  const cfgForm = root.querySelector('#cfg-form');
  on(root, 'click', '[data-action="gps"]', async (e, b) => {
    b.classList.add('is-loading');
    try {
      const p = await currentPosition();
      cfgForm.querySelector('[name="clima.lat"]').value = p.lat;
      cfgForm.querySelector('[name="clima.lng"]').value = p.lng;
      toast('Ubicación cargada. Guardá los ajustes.');
    } catch (err) { toast(err.message); } finally { b.classList.remove('is-loading'); }
  });
  on(root, 'click', '[data-action="reset-rangos"]', () => {
    for (const [k, [a, b]] of Object.entries(DEFAULTS.rangos)) {
      cfgForm.querySelector(`[name="rangos.${k}.0"]`).value = String(a).replace('.', ',');
      cfgForm.querySelector(`[name="rangos.${k}.1"]`).value = String(b).replace('.', ',');
    }
    toast('Rangos por defecto cargados. Guardá para aplicar.');
  });
  cfgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(cfgForm);
    const errors = {};
    const out = { negocio: {}, clima: {}, alertas: {}, agenda: {}, rangos: {} };
    const numField = (name, { min = -Infinity, max = Infinity } = {}) => {
      const v = parseNum(d[name]);
      if (v === '' || Number.isNaN(v) || v < min || v > max) { errors[name] = `Valor entre ${min} y ${max}.`; return null; }
      return v;
    };
    for (const k of ['nombre', 'titular', 'telefono', 'email', 'zona', 'lema']) out.negocio[k] = d[`negocio.${k}`];
    out.clima.ciudad = d['clima.ciudad'] || 'Córdoba';
    out.clima.lat = numField('clima.lat', { min: -90, max: 90 });
    out.clima.lng = numField('clima.lng', { min: -180, max: 180 });
    out.clima.umbral_lluvia = numField('clima.umbral_lluvia', { min: 1, max: 100 });
    out.alertas.dias_sin_visita = numField('alertas.dias_sin_visita', { min: 1, max: 365 });
    out.alertas.proximos_dias = numField('alertas.proximos_dias', { min: 1, max: 60 });
    out.agenda.duracion = numField('agenda.duracion', { min: 5, max: 600 });
    out.agenda.repetir_semanas = numField('agenda.repetir_semanas', { min: 1, max: 52 });
    out.agenda.hora_inicio = numField('agenda.hora_inicio', { min: 0, max: 23 });
    out.agenda.hora_fin = numField('agenda.hora_fin', { min: 1, max: 24 });
    if (!errors['agenda.hora_fin'] && out.agenda.hora_fin <= out.agenda.hora_inicio) errors['agenda.hora_fin'] = 'Tiene que ser mayor que "desde".';
    for (const k of Object.keys(PARAMS)) {
      const a = numField(`rangos.${k}.0`, { min: 0, max: 1000 });
      const b = numField(`rangos.${k}.1`, { min: 0, max: 1000 });
      if (a !== null && b !== null && a >= b) errors[`rangos.${k}.1`] = 'El máximo tiene que ser mayor que el mínimo.';
      out.rangos[k] = [a, b];
    }
    if (Object.keys(errors).length) { showErrors(cfgForm, errors); return; }
    await saveSettings(out);
    toast('Ajustes guardados');
  });

  // Backup
  on(root, 'click', '[data-action="csv"]', async (e, b) => {
    b.classList.add('is-loading');
    try {
      const files = await exportFiles();
      if (navigator.canShare?.({ files })) {
        try { await navigator.share({ files, title: 'Backup phcontrol' }); }
        catch (err) { if (err.name !== 'AbortError') files.forEach(downloadFile); }
      } else {
        files.forEach((f, i) => setTimeout(() => downloadFile(f), i * 400));
      }
    } finally { b.classList.remove('is-loading'); }
  });

  on(root, 'click', '[data-action="wipe"]', async () => {
    const pending = await idb.count('cola');
    if (pending) { toast(`Hay ${pending} cambio(s) sin subir. Sincronizá antes de borrar.`, { duration: 5000 }); return; }
    if (!(await confirmDialog({ title: 'Borrar datos locales', message: 'Se borran los datos y fotos guardados en este teléfono. Lo sincronizado sigue en Google Sheets y se vuelve a bajar. La conexión se conserva.', confirm: 'Borrar', danger: true }))) return;
    for (const s of [...Object.keys(ENTITIES), 'fotos']) await idb.clear(s);
    const keep = await idb.kvGet('conexion');
    await idb.clear('kv');
    if (keep) await idb.kvSet('conexion', keep);
    location.reload();
  });

  return () => bus.removeEventListener('sync', onSync);
}
