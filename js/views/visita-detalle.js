import { html, mount, on, safeUrl } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { meter, errorState, quickActions } from '../ui/components.js';
import { get, save, remove } from '../data/store.js';
import { settings } from '../data/settings.js';
import { hydratePhotos } from '../data/photos.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { longDate, fullName, money, num, waNumber, capFirst } from '../util/format.js';
import { PARAMS, fmtQty } from '../domain/chem.js';
import { applyStock } from './visita-form.js';
import { shareVisit } from '../ui/share-card.js';

const PAGO = { pagado: ['Pagado', 'ok'], pendiente: ['Pendiente de cobro', 'danger'], sin_cargo: ['Sin cargo / abono', ''] };

export default async function visitaDetalle(root, ctx) {
  function render() {
    const v = get('visitas', ctx.params.id);
    if (!v) { mount(root, errorState('No encontramos esa visita. Puede que se haya borrado.')); return; }
    const c = get('clientes', v.cliente_id);
    const p = v.pileta_id ? get('piletas', v.pileta_id) : null;
    const rangos = settings().rangos;
    const productos = Array.isArray(v.productos) ? v.productos : [];
    const [pl, pc] = PAGO[v.estado_pago] || ['—', ''];
    const resumen = `Hola ${c?.nombre || ''}! Resumen de la visita del ${longDate(v.fecha)}:` +
      (v.ph !== '' ? `\n• pH: ${num(v.ph)}` : '') + (v.cloro !== '' ? `\n• Cloro libre: ${num(v.cloro)} ppm` : '') +
      (productos.length ? `\n• Productos: ${productos.map((x) => `${x.nombre} ${fmtQty(Number(x.cantidad), x.unidad)}`).join(', ')}` : '') +
      (v.observaciones ? `\n${v.observaciones}` : '') + (v.monto !== '' && v.estado_pago === 'pendiente' ? `\nMonto: ${money(v.monto)}` : '');
    const wa = waNumber(c?.telefono);

    mount(root, html`
      <div class="page-head"><div class="grow">
        <p class="page-sub" style="margin:0 0 4px">${capFirst(longDate(v.fecha))}${v.hora ? ` · ${v.hora} h` : ''}</p>
        <h1 class="page-title"><a href="#/clientes/${v.cliente_id}" style="color:inherit;text-decoration:none">${fullName(c)}</a></h1>
        <p class="page-sub">${p ? `${p.nombre || 'Pileta'}${p.m3 !== '' ? ` · ${num(p.m3)} m³` : ''}` : ''}</p>
      </div></div>

      <div class="btn-row">
        <button class="btn" type="button" data-action="share">${icon('share')}Enviar reporte</button>
        ${wa ? html`<a class="btn btn-ghost" href="${safeUrl(`https://wa.me/${wa}?text=${encodeURIComponent(resumen)}`)}" target="_blank" rel="noopener">${icon('chat')}Texto</a>` : ''}
      </div>

      <section class="card stack-lg" style="margin-top:16px">
        ${['ph', 'cloro', 'alcalinidad', 'estabilizante'].filter((k) => v[k] !== '').map((k) => meter(PARAMS[k].label, v[k], rangos[k], PARAMS[k].unit))}
        ${['ph', 'cloro', 'alcalinidad', 'estabilizante'].every((k) => v[k] === '') ? html`<p class="muted small">Sin mediciones registradas.</p>` : ''}
      </section>

      ${(v.foto_antes || v.foto_despues) ? html`<section class="section"><h2 class="section-title" style="margin-bottom:12px">Fotos</h2>
        <div class="grid-2">
          ${v.foto_antes ? html`<figure class="photo-fig"><img data-photo="${v.foto_antes}" alt="Antes" class="img-ph" loading="lazy"><figcaption>Antes</figcaption></figure>` : ''}
          ${v.foto_despues ? html`<figure class="photo-fig"><img data-photo="${v.foto_despues}" alt="Después" class="img-ph" loading="lazy"><figcaption>Después</figcaption></figure>` : ''}
        </div></section>` : ''}

      <section class="section"><h2 class="section-title" style="margin-bottom:12px">Productos</h2>
        ${productos.length ? html`<div class="card"><dl class="kv">${productos.map((x) => html`<dt>${x.nombre || 'Producto'}</dt><dd>${fmtQty(Number(x.cantidad), x.unidad)}</dd>`)}</dl></div>` : html`<p class="muted small">No se registraron productos.</p>`}
      </section>

      ${v.observaciones ? html`<section class="section"><h2 class="section-title" style="margin-bottom:12px">Observaciones</h2><div class="card"><p style="white-space:pre-wrap">${v.observaciones}</p></div></section>` : ''}

      <section class="section"><h2 class="section-title" style="margin-bottom:12px">Cobro</h2>
        <div class="card row-between">
          <div><p class="stat-value" style="font-size:var(--fs-xl)">${v.monto !== '' ? money(v.monto) : '—'}</p><span class="badge ${pc}">${pl}</span></div>
          ${v.estado_pago === 'pendiente' ? html`<button class="btn btn-sm btn-accent" type="button" data-action="paid">${icon('check')}Marcar cobrado</button>` : ''}
        </div>
      </section>

      <section class="section"><h2 class="section-title" style="margin-bottom:12px">Cliente</h2>
        <div class="card"><p class="strong">${fullName(c)}</p><p class="card-sub">${c?.direccion || ''}</p>${quickActions(c)}</div>
      </section>

      <div class="btn-row" style="margin-top:32px">
        <a class="btn btn-ghost" href="#/visitas/${v.id}/editar">${icon('edit')}Editar</a>
        <button class="btn btn-danger" type="button" data-action="delete">${icon('trash')}Eliminar</button>
      </div>`);
    hydratePhotos(root);
  }

  on(root, 'click', '[data-action="share"]', () => { const v = get('visitas', ctx.params.id); if (v) shareVisit(v); });
  on(root, 'click', '[data-action="paid"]', async () => {
    const v = get('visitas', ctx.params.id);
    await save('visitas', { ...v, estado_pago: 'pagado' });
    toast('Marcada como cobrada');
  });
  on(root, 'click', '[data-action="delete"]', async () => {
    const v = get('visitas', ctx.params.id);
    const ok = await confirmDialog({ title: 'Eliminar visita', message: 'Se borra el registro y se devuelven al stock los productos usados. No se puede deshacer.', confirm: 'Eliminar', danger: true });
    if (!ok) return;
    await applyStock(v.productos || [], []);
    await remove('visitas', v.id);
    const ag = v.agenda_id ? get('agenda', v.agenda_id) : null;
    if (ag && ag.visita_id === v.id) await save('agenda', { ...ag, estado: 'pendiente', visita_id: '' });
    toast('Visita eliminada');
    navigate('#/visitas', { replace: true });
  });

  render();
  ctx.onChange(render, ['visitas', 'clientes', 'piletas', '*']);
}
