import { html, mount, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { quickActions } from '../ui/components.js';
import { all, get } from '../data/store.js';
import { settings } from '../data/settings.js';
import { sheet } from '../ui/modal.js';
import { navigate } from '../router.js';
import { idb } from '../data/db.js';
import {
  today, addDays, addMonths, startOfWeek, startOfMonth, parseDate, monthTitle, longDate, dayShort, fdate,
  timeToMin, fullName, MESES_CORTOS, DIAS_CORTOS_LIST, capFirst
} from '../util/format.js';
import { ESTADOS, RECURRENCIAS, updateOccurrence } from '../domain/agenda.js';
import { toast } from '../ui/toast.js';

const VISTAS = { dia: 'Día', semana: 'Semana', mes: 'Mes' };

/** Eventos de un rango: turnos de agenda + visitas registradas sin turno. */
function events(from, to) {
  const ag = all('agenda').filter((a) => a.fecha >= from && a.fecha <= to).map((a) => ({
    kind: 'agenda', id: a.id, fecha: a.fecha, hora: a.hora || '09:00', dur: Number(a.duracion) || 45, estado: a.estado, cliente_id: a.cliente_id, ref: a
  }));
  const vis = all('visitas').filter((v) => !v.agenda_id && v.fecha >= from && v.fecha <= to).map((v) => ({
    kind: 'visita', id: v.id, fecha: v.fecha, hora: v.hora || '09:00', dur: 45, estado: 'hecha', cliente_id: v.cliente_id, ref: v
  }));
  return [...ag, ...vis].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

/** Distribuye eventos superpuestos en carriles. */
function lanes(evs) {
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const e of group) {
      const s = timeToMin(e.hora);
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = s + e.dur;
      e.lane = lane;
    }
    group.forEach((e) => { e.lanes = laneEnds.length; out.push(e); });
    group = [];
  };
  for (const e of evs) {
    const s = timeToMin(e.hora);
    if (group.length && s >= groupEnd) { flush(); groupEnd = -1; }
    group.push(e);
    groupEnd = Math.max(groupEnd, s + e.dur);
  }
  if (group.length) flush();
  return out;
}

export default async function calendario(root, ctx) {
  let vista = ctx.query.vista || (await idb.kvGet('cal:vista', 'semana'));
  let fecha = ctx.query.fecha || today();
  const cfg = settings().agenda;
  const H0 = Number(cfg.hora_inicio) || 7;
  const H1 = Number(cfg.hora_fin) || 21;

  function range() {
    if (vista === 'dia') return { from: fecha, to: fecha };
    if (vista === 'semana') { const f = startOfWeek(fecha); return { from: f, to: addDays(f, 6) }; }
    const f = startOfWeek(startOfMonth(fecha));
    return { from: f, to: addDays(f, 41) };
  }

  function title() {
    if (vista === 'dia') return longDate(fecha);
    if (vista === 'semana') {
      const f = startOfWeek(fecha); const t = addDays(f, 6);
      const a = parseDate(f); const b = parseDate(t);
      return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${MESES_CORTOS[a.getUTCMonth()]}` : `${a.getUTCDate()} ${MESES_CORTOS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESES_CORTOS[b.getUTCMonth()]}`;
    }
    return monthTitle(fecha);
  }

  function block(e, style) {
    const c = get('clientes', e.cliente_id);
    const st = ESTADOS[e.estado] || ESTADOS.pendiente;
    return html`<button type="button" class="ev ev-${e.estado}" style="${style};--ev:${st.color}" data-ev="${e.kind}:${e.id}" aria-label="${e.hora} ${fullName(c)}, ${st.label}">
      <span class="ev-time">${e.hora}</span><span class="ev-name">${fullName(c)}</span>
    </button>`;
  }

  function hourGrid(days, evs, compact) {
    const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
    const ph = compact ? 52 : 64;
    const t = today();
    return html`<div class="tg ${compact ? 'tg-week' : 'tg-day'}" style="--ph:${ph}px;--cols:${days.length}">
      ${days.length > 1 ? html`<div class="tg-head"><div></div>${days.map((d) => html`<button type="button" class="tg-dayhead ${d === t ? 'is-today' : ''}" data-goto="${d}"><span>${dayShort(d)}</span><strong>${parseDate(d).getUTCDate()}</strong></button>`)}</div>` : ''}
      <div class="tg-body">
        <div class="tg-gutter">${hours.map((h) => html`<div class="tg-hour">${String(h).padStart(2, '0')}:00</div>`)}</div>
        ${days.map((d) => {
          const dayEvs = lanes(evs.filter((e) => e.fecha === d));
          return html`<div class="tg-col ${d === t ? 'is-today' : ''}" data-day="${d}">
            ${hours.map((h) => html`<button type="button" class="tg-slot" data-slot="${d}|${String(h).padStart(2, '0')}:00" aria-label="Agendar ${fdate(d)} ${h}:00"></button>`)}
            ${dayEvs.map((e) => {
              const top = ((timeToMin(e.hora) - H0 * 60) / 60) * ph;
              const height = Math.max(compact ? 22 : 28, (e.dur / 60) * ph - 2);
              const w = 100 / e.lanes;
              return block(e, `top:${Math.max(0, top)}px;height:${height}px;left:${e.lane * w}%;width:calc(${w}% - 2px)`);
            })}
            ${d === t ? nowLine(ph) : ''}
          </div>`;
        })}
      </div>
    </div>`;
  }

  function nowLine(ph) {
    const now = new Date();
    const min = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').reduce((h, m) => h * 60 + Number(m)));
    if (min < H0 * 60 || min > H1 * 60) return '';
    return html`<div class="tg-now" style="top:${((min - H0 * 60) / 60) * ph}px" aria-hidden="true"></div>`;
  }

  function monthGrid(r, evs) {
    const days = Array.from({ length: 42 }, (_, i) => addDays(r.from, i));
    const m = fecha.slice(0, 7);
    const t = today();
    const sel = evs.filter((e) => e.fecha === fecha);
    return html`<div class="mg">
      <div class="mg-head">${DIAS_CORTOS_LIST.map((d) => html`<span>${d}</span>`)}</div>
      <div class="mg-grid">${days.map((d) => {
        const de = evs.filter((e) => e.fecha === d);
        return html`<button type="button" class="mg-cell ${d.slice(0, 7) !== m ? 'out' : ''} ${d === t ? 'is-today' : ''} ${d === fecha ? 'is-sel' : ''}" data-pick="${d}" aria-label="${fdate(d)}: ${de.length} visitas">
          <span class="mg-num">${parseDate(d).getUTCDate()}</span>
          <span class="mg-dots">${de.slice(0, 4).map((e) => html`<i style="background:${(ESTADOS[e.estado] || ESTADOS.pendiente).color}"></i>`)}</span>
        </button>`;
      })}</div>
    </div>
    <div class="section"><div class="section-head"><h2 class="section-title">${capFirst(longDate(fecha))}</h2><a class="section-link" href="#/agenda/nueva?fecha=${fecha}">Agendar</a></div>
      ${sel.length ? html`<div class="list">${sel.map((e) => {
        const c = get('clientes', e.cliente_id);
        const st = ESTADOS[e.estado] || ESTADOS.pendiente;
        return html`<button type="button" class="list-item" data-ev="${e.kind}:${e.id}" style="text-align:left;width:100%">
          <span class="dot" style="background:${st.color}"></span>
          <div class="li-main"><div class="li-title">${e.hora} · ${fullName(c)}</div><div class="li-sub">${c?.direccion || ''}</div></div>
          <span class="badge ${st.badge}">${st.label}</span></button>`;
      })}</div>` : html`<p class="muted small">Sin visitas este día.</p>`}
    </div>`;
  }

  function render() {
    const r = range();
    const evs = events(r.from, r.to);
    const days = vista === 'dia' ? [fecha] : vista === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(r.from, i)) : [];
    mount(root, html`
      <div class="cal-top">
        <div class="row-between">
          <h1 class="page-title cal-title">${capFirst(title())}</h1>
          <div class="row" style="gap:4px">
            <button class="icon-btn soft" type="button" data-nav="-1" aria-label="Anterior">${icon('chevronLeft')}</button>
            <button class="btn btn-sm btn-soft" type="button" data-today>Hoy</button>
            <button class="icon-btn soft" type="button" data-nav="1" aria-label="Siguiente">${icon('chevron')}</button>
          </div>
        </div>
        <div class="segmented" role="group" aria-label="Vista del calendario" style="margin-top:12px">
          ${Object.entries(VISTAS).map(([k, l]) => html`<button type="button" data-vista="${k}" aria-pressed="${k === vista}">${l}</button>`)}
        </div>
        <div class="legend">${Object.values(ESTADOS).map((s) => html`<span><i style="background:${s.color}"></i>${s.label}</span>`)}</div>
      </div>
      <div class="cal-body" id="cal-body">
        ${vista === 'mes' ? monthGrid(r, evs) : hourGrid(days, evs, vista === 'semana')}
        ${vista !== 'mes' && !evs.length ? html`<p class="muted small" style="margin-top:12px;text-align:center">Sin visitas en este período. Tocá un horario para agendar.</p>` : ''}
      </div>
      <a class="fab" href="#/agenda/nueva?fecha=${fecha}" aria-label="Programar visita">${icon('plus')}</a>`);
    // Lleva la grilla cerca de la hora actual o del primer evento.
    const body = root.querySelector('.tg-body');
    if (body) {
      const first = evs.filter((e) => days.includes(e.fecha))[0];
      const ph = vista === 'semana' ? 52 : 64;
      const h = first ? timeToMin(first.hora) / 60 : 8;
      window.scrollTo({ top: Math.max(0, (h - H0 - 0.5) * ph + body.offsetTop - 120), behavior: 'instant' });
    }
    history.replaceState(null, '', `#/calendario?vista=${vista}&fecha=${fecha}`);
  }

  function shift(dir) {
    fecha = vista === 'dia' ? addDays(fecha, dir) : vista === 'semana' ? addDays(fecha, 7 * dir) : addMonths(fecha, dir);
    const body = root.querySelector('#cal-body');
    body?.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
    setTimeout(render, 120);
  }

  function openEvent(kind, id) {
    if (kind === 'visita') { navigate(`#/visitas/${id}`); return; }
    const a = get('agenda', id);
    if (!a) return;
    const c = get('clientes', a.cliente_id);
    const st = ESTADOS[a.estado];
    const s = sheet({
      title: fullName(c),
      content: html`
        <p class="muted">${capFirst(longDate(a.fecha))} · ${a.hora} h · ${a.duracion || '?'} min</p>
        <p style="margin-top:6px"><span class="badge ${st.badge}">${st.label}</span> ${a.serie_id ? html`<span class="badge">${icon('repeat')} ${RECURRENCIAS[a.recurrencia]}</span>` : ''}</p>
        ${c?.direccion ? html`<p class="small" style="margin-top:10px">${c.direccion}${c.barrio ? `, ${c.barrio}` : ''}</p>` : ''}
        ${a.notas ? html`<p class="small muted" style="margin-top:6px;white-space:pre-wrap">${a.notas}</p>` : ''}
        ${quickActions(c, { waText: `Hola ${c?.nombre || ''}! Voy en camino para el mantenimiento de la pileta.` })}
        <div class="stack" style="margin-top:16px">
          ${a.estado !== 'hecha' ? html`<a class="btn btn-block" href="#/visitas/nueva?agenda=${a.id}">${icon('check')}Registrar visita</a>` : a.visita_id ? html`<a class="btn btn-block btn-ghost" href="#/visitas/${a.visita_id}">Ver registro de la visita</a>` : ''}
          <a class="btn btn-block btn-ghost" href="#/agenda/${a.id}">${icon('clock')}Reprogramar / editar</a>
          ${a.estado === 'pendiente' || a.estado === 'reprogramada' ? html`<button class="btn btn-block btn-danger" type="button" data-cancel>Cancelar esta visita</button>` : ''}
        </div>`
    });
    s.el.querySelector('[data-cancel]')?.addEventListener('click', async () => {
      await updateOccurrence(a, { estado: 'cancelada' }, 'una');
      s.close();
      toast('Visita cancelada', { action: 'Deshacer', onAction: () => updateOccurrence({ ...a, estado: 'cancelada' }, { estado: a.estado }, 'una') });
    });
  }

  on(root, 'click', '[data-nav]', (e, b) => shift(Number(b.dataset.nav)));
  on(root, 'click', '[data-today]', () => { fecha = today(); render(); });
  on(root, 'click', '[data-vista]', (e, b) => { vista = b.dataset.vista; idb.kvSet('cal:vista', vista); render(); });
  on(root, 'click', '[data-goto]', (e, b) => { fecha = b.dataset.goto; vista = 'dia'; render(); });
  on(root, 'click', '[data-pick]', (e, b) => { fecha = b.dataset.pick; render(); });
  on(root, 'click', '[data-ev]', (e, b) => { const [k, id] = b.dataset.ev.split(':'); openEvent(k, id); });
  on(root, 'click', '[data-slot]', (e, b) => { const [d, h] = b.dataset.slot.split('|'); navigate(`#/agenda/nueva?fecha=${d}&hora=${h}`); });

  // Gestos: deslizar horizontalmente para cambiar de período.
  let sx = null; let sy = null;
  root.addEventListener('touchstart', (e) => { if (e.target.closest('.sheet')) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  }, { passive: true });

  render();
  ctx.onChange(render, ['agenda', 'visitas', 'clientes', '*']);
}
