import { html, mount, on, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead } from '../ui/components.js';
import { all, get } from '../data/store.js';
import { settings, saveSettings } from '../data/settings.js';
import { idb } from '../data/db.js';
import { navigate } from '../router.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { fullName, num, parseNum } from '../util/format.js';
import { PARAMS, TIPOS, SEGURIDAD, DISCLAIMER, recommend, doseFixed, doseConcentration, missingFields, fmtQty, midpoint } from '../domain/chem.js';

const TABS = { correccion: 'Corrección', verde: 'Agua verde', puesta: 'Puesta a punto' };

/** Recetas guiadas. Las dosis salen de tus productos; las esperas, de la etiqueta (las cargás vos). */
const RECETAS = {
  verde: {
    titulo: 'Agua verde',
    intro: 'Secuencia: clarificante o floculante + shock de cloro + alguicida, con espera y nueva medición entre pasos.',
    pasos: [
      { id: 'medir', kind: 'info', title: 'Medí pH y cloro', text: 'Cargá los valores arriba. Si el pH está fuera de rango, corregilo primero: el cloro rinde mejor con el pH en rango.' },
      { id: 'ph', kind: 'param', param: 'ph', title: 'Ajustá el pH' },
      { id: 'flocu', kind: 'fija', tipos: ['floculante', 'clarificante'], choque: true, title: 'Clarificante o floculante', text: 'Con floculante: apagá el filtrado durante el reposo y después aspirá el fondo a desagote. Con clarificante: filtrá.', espera: 'espera_floculante_h' },
      { id: 'shock', kind: 'shock', title: 'Shock de cloro', text: 'Aplicá de noche o al atardecer, con el filtro funcionando.', espera: 'espera_shock_h' },
      { id: 'algui', kind: 'fija', tipos: ['alguicida'], choque: true, title: 'Alguicida', text: 'Aplicalo cuando el cloro haya bajado según indique la etiqueta.', espera: 'espera_alguicida_h' },
      { id: 'remedir', kind: 'info', title: 'Volvé a medir', text: 'Medí pH y cloro de nuevo. Si el agua sigue verde o turbia, repetí desde el paso que corresponda. Limpiá o retrolavá el filtro al terminar.' }
    ]
  },
  puesta: {
    titulo: 'Puesta a punto',
    intro: 'Para arrancar la temporada o recuperar una pileta descuidada.',
    pasos: [
      { id: 'limpieza', kind: 'info', title: 'Limpieza física', text: 'Sacá hojas y suciedad, cepillá paredes y bordes, vaciá skimmers y canasto de la bomba. Revisá presión del filtro y hacé retrolavado si corresponde.' },
      { id: 'alc', kind: 'param', param: 'alcalinidad', title: 'Ajustá la alcalinidad', text: 'Primero la alcalinidad: estabiliza el pH.' },
      { id: 'ph', kind: 'param', param: 'ph', title: 'Ajustá el pH' },
      { id: 'cloro', kind: 'param', param: 'cloro', title: 'Llevá el cloro al rango' },
      { id: 'cya', kind: 'param', param: 'estabilizante', title: 'Estabilizante (si corresponde)', text: 'Solo en piletas exteriores con cloro no estabilizado.' },
      { id: 'clari', kind: 'fija', tipos: ['clarificante'], choque: false, title: 'Clarificante de mantenimiento' },
      { id: 'remedir', kind: 'info', title: 'Filtrá y volvé a medir', text: 'Dejá filtrar y medí de nuevo antes de habilitar el baño.' }
    ]
  }
};

export default async function calculadora(root, ctx) {
  const q = ctx.query;
  const st = (await idb.kvGet('calc:estado')) || {};
  let tab = q.tab || st.tab || 'correccion';
  let piletaId = q.pileta || st.piletaId || '';
  let m3 = piletaId && get('piletas', piletaId)?.m3 !== '' ? get('piletas', piletaId)?.m3 : (st.m3 ?? '');
  const medidos = { ph: '', cloro: '', alcalinidad: '', estabilizante: '', ...(q.ph || q.cloro ? {} : st.medidos || {}) };
  for (const k of Object.keys(PARAMS)) if (q[k]) medidos[k] = String(q[k]);
  const objetivos = { ...(st.objetivos || {}) };
  const volver = q.volver || '';
  const picks = new Map();
  let ticker = null;

  const piletas = all('piletas').map((p) => ({ ...p, c: get('clientes', p.cliente_id) })).filter((p) => p.c)
    .sort((a, b) => fullName(a.c).localeCompare(fullName(b.c), 'es'));

  const persist = debounce(() => idb.kvSet('calc:estado', { tab, piletaId, m3, medidos, objetivos }), 300);
  const nums = () => Object.fromEntries(Object.entries(medidos).map(([k, v]) => [k, parseNum(v)]));
  const m3n = () => parseNum(m3);

  function shell() {
    mount(root, html`
      ${pageHead('Calculadora', 'Dosis según tus productos y la medición')}
      <div class="segmented" role="tablist" aria-label="Modo">
        ${Object.entries(TABS).map(([k, l]) => html`<button type="button" role="tab" data-tab="${k}" aria-pressed="${k === tab}" aria-selected="${k === tab}">${l}</button>`)}
      </div>

      <section class="card stack" style="margin-top:16px">
        <div class="field"><label for="c-pil">Pileta</label>
          <select class="select" id="c-pil"><option value="">Ingresar m³ a mano</option>
            ${piletas.map((p) => html`<option value="${p.id}" ${p.id === piletaId ? 'selected' : ''}>${fullName(p.c)} · ${p.nombre || 'Pileta'}${p.m3 !== '' ? ` (${num(p.m3)} m³)` : ''}</option>`)}</select></div>
        <div class="field"><label for="c-m3">Volumen</label><div class="input-suffix"><input class="input" id="c-m3" inputmode="decimal" value="${m3 === '' ? '' : String(m3).replace('.', ',')}" placeholder="Ej.: 40"><span>m³</span></div></div>
        <p class="fieldset-title" style="margin-top:4px">Valores medidos</p>
        <div class="grid-2">
          ${Object.entries(PARAMS).map(([k, p]) => html`<div class="field"><label for="c-${k}">${k === 'estabilizante' ? 'Estabilizante' : p.label}</label>
            <div class="input-suffix"><input class="input" id="c-${k}" data-m="${k}" inputmode="decimal" value="${medidos[k]}" placeholder="—" autocomplete="off"><span>${p.unit}</span></div></div>`)}
        </div>
        <details class="details"><summary>Objetivos (por defecto, el medio del rango)</summary>
          <div class="grid-2" style="margin-top:12px">
            ${Object.entries(PARAMS).map(([k, p]) => html`<div class="field"><label for="o-${k}">${p.short} objetivo</label>
              <input class="input" id="o-${k}" data-o="${k}" inputmode="decimal" value="${objetivos[k] ?? ''}" placeholder="${num(midpoint(settings().rangos[k]))}"></div>`)}
          </div>
          <p class="field-hint" style="margin-top:8px">Rangos en <a href="#/ajustes">Ajustes</a>.</p>
        </details>
      </section>

      <div id="calc-out" style="margin-top:16px" aria-live="polite"></div>

      <section class="section">
        <div class="alert warn">${icon('alert')}<div><p class="alert-title">Seguridad</p>
          <ul style="margin:6px 0 0;padding-left:18px">${SEGURIDAD.map((s) => html`<li>${s}</li>`)}</ul></div></div>
        <p class="small muted" style="margin-top:12px">${DISCLAIMER}</p>
      </section>

      <div class="form-actions">
        <button class="btn btn-block" type="button" data-action="apply" disabled>${icon('check')}Aplicar a una visita</button>
      </div>`);
  }

  function productLine(key, p, res, label = '') {
    if (res.missing) {
      return html`<div class="calc-opt missing">
        <div class="grow"><p class="strong">${p.producto}</p><p class="small" style="color:var(--warn)">Falta completar desde la etiqueta: ${res.missing.join(', ')}.</p></div>
        <a class="btn btn-sm btn-soft" href="#/stock/${p.id}">Completar</a></div>`;
    }
    if (res.error) return html`<div class="calc-opt missing"><div class="grow"><p class="strong">${p.producto}</p><p class="small" style="color:var(--danger)">${res.error}</p></div><a class="btn btn-sm btn-soft" href="#/stock/${p.id}">Revisar</a></div>`;
    const picked = picks.has(key);
    return html`<div class="calc-opt">
      <label class="check grow" style="min-height:auto;align-items:flex-start">
        <input type="checkbox" data-pick="${key}" data-pid="${p.id}" data-qty="${res.cantidad}" ${picked ? 'checked' : ''}>
        <span class="grow"><span class="strong">${label || p.producto}</span><br><span class="calc-qty">${fmtQty(res.cantidad, res.unidad)}</span>
          ${p.cantidad !== '' && Number(p.cantidad) < res.cantidad ? html`<br><span class="small" style="color:var(--danger)">Stock insuficiente (${fmtQty(Number(p.cantidad), p.unidad)})</span>` : ''}</span>
      </label>
      <details class="formula"><summary>Fórmula</summary><ul>${res.formula.map((f) => html`<li class="mono">${f}</li>`)}</ul></details>
    </div>`;
  }

  function needVolume() {
    const v = m3n();
    if (v === '' || Number.isNaN(v) || v <= 0) return html`<div class="alert info">${icon('info')}<p>Elegí una pileta con volumen o ingresá los m³ para calcular.</p></div>`;
    return null;
  }

  function renderCorreccion() {
    const nv = needVolume(); if (nv) return nv;
    const productos = all('stock');
    const recs = recommend({ m3: m3n(), medidos: nums(), rangos: settings().rangos, objetivos: Object.fromEntries(Object.entries(objetivos).map(([k, v]) => [k, parseNum(v)])), productos });
    if (!recs.length) return html`<div class="alert info">${icon('tube')}<p>Ingresá al menos un valor medido.</p></div>`;
    return html`<div class="stack">${recs.map((r) => html`<article class="card">
      <div class="row-between"><p class="card-title">${r.label}</p>
        <span class="badge ${r.status === 'ok' ? 'ok' : 'warn'}">${r.status === 'ok' ? 'En rango' : r.status === 'bajo' ? 'Bajo' : 'Alto'}</span></div>
      <p class="small muted">Medido ${num(r.value)} ${r.unit} · rango ${num(r.range[0])}–${num(r.range[1])} ${r.unit}${r.status !== 'ok' ? ` · objetivo ${num(r.target)} (${r.sentido === 'sube' ? '+' : '−'}${num(Math.abs(r.delta))})` : ''}</p>
      ${r.status === 'ok' ? '' : r.opciones?.length ? html`<p class="small" style="margin-top:10px">Elegí <strong>un</strong> producto:</p><div class="stack" style="margin-top:8px">${r.opciones.map((o) => productLine(`corr:${r.param}:${o.producto.id}`, o.producto, o))}</div>` : html`<p class="small" style="margin-top:10px">${r.nota}</p>`}
    </article>`)}
    ${recs.some((r) => r.param === 'alcalinidad' && r.status !== 'ok') && recs.some((r) => r.param === 'ph' && r.status !== 'ok') ? html`<div class="alert info">${icon('info')}<p>Corregí primero la alcalinidad, dejá filtrar, volvé a medir el pH y recién ahí ajustalo.</p></div>` : ''}
    </div>`;
  }

  function stepState(rid) { return st.recetas?.[rid] || {}; }

  function renderReceta(rid) {
    const R = RECETAS[rid];
    const nv = needVolume();
    const cfg = settings();
    const done = stepState(rid);
    const productos = all('stock');
    const n = nums();
    return html`<p class="muted small">${R.intro}</p>
    <ol class="steps">${R.pasos.map((p, i) => {
      let body = '';
      if (p.kind === 'param') {
        if (nv) body = nv;
        else if (n[p.param] === '' || Number.isNaN(n[p.param])) body = html`<p class="small muted">Ingresá ${PARAMS[p.param].label.toLowerCase()} medido arriba para calcular.</p>`;
        else {
          const r = recommend({ m3: m3n(), medidos: { [p.param]: n[p.param] }, rangos: cfg.rangos, objetivos: { [p.param]: parseNum(objetivos[p.param] ?? '') }, productos })[0];
          body = r.status === 'ok' ? html`<p class="small" style="color:var(--ok)">En rango (${num(r.value)}). No hace falta corregir.</p>`
            : r.opciones?.length ? html`<div class="stack">${r.opciones.map((o) => productLine(`${rid}:${p.id}:${o.producto.id}`, o.producto, o))}</div>` : html`<p class="small">${r.nota}</p>`;
        }
      } else if (p.kind === 'fija') {
        const cands = productos.filter((x) => p.tipos.includes(x.tipo));
        if (nv) body = nv;
        else if (!cands.length) body = html`<p class="small">No tenés ${p.tipos.map((t) => TIPOS[t].label.toLowerCase()).join(' ni ')} en Stock. <a href="#/stock/nuevo?tipo=${p.tipos[0]}">Agregalo</a>.</p>`;
        else body = html`<div class="stack">${cands.map((x) => {
          const miss = missingFields(x, { choque: p.choque });
          const useChoque = p.choque && !(x.dosis_choque === '' || x.dosis_choque === undefined);
          const res = miss.length && !(p.choque && !missingFields(x).length) ? { missing: miss } : doseFixed(x, m3n(), { choque: useChoque });
          return productLine(`${rid}:${p.id}:${x.id}`, x, res, `${x.producto}${p.choque && !useChoque ? ' (dosis de mantenimiento: no cargaste dosis de choque)' : ''}`);
        })}</div>`;
      } else if (p.kind === 'shock') {
        const target = parseNum(cfg.calc.shock_ppm);
        const cands = productos.filter((x) => x.parametro === 'cloro' && x.modo === 'concentracion');
        body = html`<div class="field" style="margin-bottom:10px"><label for="shock-ppm">Cloro objetivo del shock (ppm, según tu criterio o la etiqueta)</label>
          <div class="input-suffix"><input class="input" id="shock-ppm" data-cfg="shock_ppm" inputmode="decimal" value="${cfg.calc.shock_ppm}" placeholder="Completar"><span>ppm</span></div></div>
          ${nv || (target === '' || Number.isNaN(target) ? html`<p class="small" style="color:var(--warn)">Cargá el cloro objetivo del shock para calcular.</p>`
            : n.cloro === '' || Number.isNaN(n.cloro) ? html`<p class="small muted">Ingresá el cloro libre medido arriba.</p>`
              : n.cloro >= target ? html`<p class="small">El cloro medido ya alcanza el objetivo del shock.</p>`
                : !cands.length ? html`<p class="small">No tenés cloro líquido o granulado en Stock.</p>`
                  : html`<div class="stack">${cands.map((x) => {
                    const miss = missingFields(x);
                    const res = miss.length ? { missing: miss } : doseConcentration(x, Math.round((target - n.cloro) * 100) / 100, m3n());
                    return productLine(`${rid}:${p.id}:${x.id}`, x, res);
                  })}</div>`)}`;
      }
      const espera = p.espera ? html`<div class="timer-row">
          <div class="input-suffix" style="width:130px"><input class="input" data-cfg="${p.espera}" inputmode="decimal" value="${cfg.calc[p.espera]}" placeholder="Según etiqueta" aria-label="Horas de espera"><span>h</span></div>
          <button class="btn btn-sm btn-soft" type="button" data-timer="${rid}:${p.id}:${p.espera}">${icon('timer')}Iniciar espera</button>
          <span class="timer-left mono small" data-left="${rid}:${p.id}"></span></div>` : '';
      return html`<li class="step ${done[p.id] ? 'is-done' : ''}">
        <label class="step-check"><input type="checkbox" data-step="${rid}:${p.id}" ${done[p.id] ? 'checked' : ''}><span class="step-num">${i + 1}</span></label>
        <div class="grow"><p class="strong">${p.title}</p>${p.text ? html`<p class="small muted">${p.text}</p>` : ''}<div style="margin-top:8px">${body}</div>${espera}</div>
      </li>`;
    })}</ol>
    <button class="btn btn-ghost btn-sm" type="button" data-reset="${rid}">${icon('refresh')}Reiniciar receta</button>`;
  }

  function renderOut() {
    const out = root.querySelector('#calc-out');
    mount(out, tab === 'correccion' ? renderCorreccion() : renderReceta(tab));
    // Mantener solo selecciones visibles
    const visible = new Set([...out.querySelectorAll('[data-pick]')].map((x) => x.dataset.pick));
    for (const k of [...picks.keys()]) if (!visible.has(k)) picks.delete(k);
    out.querySelectorAll('[data-pick]').forEach((x) => { if (picks.has(x.dataset.pick)) picks.set(x.dataset.pick, { pid: x.dataset.pid, qty: Number(x.dataset.qty) }); });
    root.querySelector('[data-action="apply"]').disabled = !picks.size;
    updateTimers();
  }

  async function updateTimers() {
    const timers = (await idb.kvGet('calc:timers')) || {};
    clearInterval(ticker);
    const paint = () => {
      let active = false;
      root.querySelectorAll('[data-left]').forEach((el) => {
        const end = timers[el.dataset.left];
        if (!end) { el.textContent = ''; return; }
        const left = end - Date.now();
        if (left <= 0) { el.textContent = 'Espera cumplida ✓'; return; }
        active = true;
        const h = Math.floor(left / 3600000); const m = Math.floor((left % 3600000) / 60000); const s = Math.floor((left % 60000) / 1000);
        el.textContent = `Faltan ${h ? `${h} h ` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      });
      if (!active) clearInterval(ticker);
    };
    paint();
    ticker = setInterval(paint, 1000);
  }

  shell();
  renderOut();

  on(root, 'click', '[data-tab]', (e, b) => {
    tab = b.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-selected', String(x === b)); });
    picks.clear(); persist(); renderOut();
  });
  root.querySelector('#c-pil').addEventListener('change', (e) => {
    piletaId = e.target.value;
    const p = get('piletas', piletaId);
    if (p && p.m3 !== '') { m3 = p.m3; root.querySelector('#c-m3').value = String(p.m3).replace('.', ','); }
    persist(); renderOut();
  });
  const rerender = debounce(renderOut, 250);
  root.querySelector('#c-m3').addEventListener('input', (e) => { m3 = e.target.value; persist(); rerender(); });
  on(root, 'input', '[data-m]', (e, el) => { medidos[el.dataset.m] = el.value; persist(); rerender(); });
  on(root, 'input', '[data-o]', (e, el) => { objetivos[el.dataset.o] = el.value; persist(); rerender(); });
  on(root, 'change', '[data-cfg]', async (e, el) => {
    const v = parseNum(el.value);
    if (Number.isNaN(v) || (v !== '' && v < 0)) { toast('Valor inválido'); return; }
    await saveSettings({ calc: { [el.dataset.cfg]: v } });
    renderOut();
  });
  on(root, 'change', '[data-pick]', (e, el) => {
    // Un producto por parámetro/paso: desmarca los hermanos.
    const prefix = el.dataset.pick.split(':').slice(0, 2).join(':');
    if (el.checked) {
      for (const k of [...picks.keys()]) if (k.startsWith(prefix + ':')) picks.delete(k);
      root.querySelectorAll('[data-pick]').forEach((x) => { if (x !== el && x.dataset.pick.startsWith(prefix + ':')) x.checked = false; });
      picks.set(el.dataset.pick, { pid: el.dataset.pid, qty: Number(el.dataset.qty) });
    } else picks.delete(el.dataset.pick);
    root.querySelector('[data-action="apply"]').disabled = !picks.size;
  });
  on(root, 'change', '[data-step]', async (e, el) => {
    const [rid, sid] = el.dataset.step.split(':');
    st.recetas = st.recetas || {};
    st.recetas[rid] = { ...(st.recetas[rid] || {}), [sid]: el.checked };
    el.closest('.step').classList.toggle('is-done', el.checked);
    await idb.kvSet('calc:estado', { ...((await idb.kvGet('calc:estado')) || {}), recetas: st.recetas });
  });
  on(root, 'click', '[data-timer]', async (e, b) => {
    const [rid, sid, key] = b.dataset.timer.split(':');
    const hrs = parseNum(settings().calc[key]);
    if (hrs === '' || Number.isNaN(hrs) || hrs <= 0) { toast('Cargá primero las horas de espera que indica la etiqueta.'); return; }
    const timers = (await idb.kvGet('calc:timers')) || {};
    timers[`${rid}:${sid}`] = Date.now() + hrs * 3600000;
    await idb.kvSet('calc:timers', timers);
    toast(`Espera de ${num(hrs)} h iniciada. Queda guardada aunque cierres la app.`);
    updateTimers();
  });
  on(root, 'click', '[data-reset]', async (e, b) => {
    const rid = b.dataset.reset;
    if (!(await confirmDialog({ title: 'Reiniciar receta', message: 'Se desmarcan los pasos y se borran las esperas.', confirm: 'Reiniciar' }))) return;
    st.recetas = { ...(st.recetas || {}), [rid]: {} };
    await idb.kvSet('calc:estado', { ...((await idb.kvGet('calc:estado')) || {}), recetas: st.recetas });
    const timers = (await idb.kvGet('calc:timers')) || {};
    for (const k of Object.keys(timers)) if (k.startsWith(rid + ':')) delete timers[k];
    await idb.kvSet('calc:timers', timers);
    renderOut();
  });
  on(root, 'click', '[data-action="apply"]', async () => {
    const productos = [...picks.values()].map(({ pid, qty }) => {
      const p = get('stock', pid);
      return { producto_id: pid, nombre: p?.producto || '', unidad: p?.unidad || '', cantidad: qty };
    });
    const pil = piletaId ? get('piletas', piletaId) : null;
    const m = Object.fromEntries(Object.entries(medidos).map(([k, v]) => [k, v === '' ? '' : String(v)]));
    await idb.kvSet('calc:aplicar', { productos, m, pileta_id: pil?.id || '', cliente_id: pil?.cliente_id || '' });
    const base = volver ? decodeURIComponent(volver) : '#/visitas/nueva';
    navigate(`${base}${base.includes('?') ? '&' : '?'}desde=calc`);
  });

  ctx.onChange(() => renderOut(), ['stock', 'config']);
  return () => clearInterval(ticker);
}

