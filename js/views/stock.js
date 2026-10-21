import { html, mount, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, emptyState } from '../ui/components.js';
import { all, get, save, saveMany, byDateDesc } from '../data/store.js';
import { sheet, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { fullName, money, fdate, today, parseNum, num } from '../util/format.js';
import { TIPOS, TIPOS_SUGERIDOS, missingFields, fmtQty } from '../domain/chem.js';

export default async function stockView(root, ctx) {
  let tab = ctx.query.tab || 'inventario';
  let filtro = ctx.query.filtro || '';

  const isLow = (p) => p.umbral !== '' && Number(p.cantidad || 0) <= Number(p.umbral);

  function inventario() {
    const items = all('stock').filter((p) => filtro !== 'bajo' || isLow(p)).sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.producto.localeCompare(b.producto, 'es'));
    if (!all('stock').length) {
      return html`${emptyState({ ic: 'box', title: 'Sin productos', text: 'Cargá los químicos que usás. Podés empezar con la lista sugerida y completar concentraciones y dosis desde cada etiqueta.' })}
        <div class="btn-row"><button class="btn" type="button" data-action="seed">${icon('plus')}Cargar productos sugeridos</button><a class="btn btn-ghost" href="#/stock/nuevo">Nuevo producto</a></div>`;
    }
    const total = all('stock').reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.costo) || 0), 0);
    return html`
      <div class="row-between" style="margin-bottom:12px">
        <div class="chips">${[['', 'Todos'], ['bajo', 'Stock bajo']].map(([k, l]) => html`<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filtro}">${l}</button>`)}</div>
        <span class="small muted">Valor al costo: ${money(total)}</span>
      </div>
      ${items.length ? html`<div class="list">${items.map((p) => {
        const low = isLow(p);
        const miss = p.modo ? missingFields(p) : [];
        return html`<div class="list-item">
          <a class="li-main" href="#/stock/${p.id}" style="color:inherit;text-decoration:none">
            <div class="li-title">${p.producto}</div>
            <div class="li-sub">${fmtQty(Number(p.cantidad) || 0, p.unidad)}${p.umbral !== '' ? ` · mín. ${num(p.umbral)} ${p.unidad}` : ''}${p.precio !== '' ? ` · venta ${money(p.precio)}` : ''}</div>
            <div class="row wrap" style="gap:6px;margin-top:4px">${low ? html`<span class="badge danger">Stock bajo</span>` : ''}${miss.length ? html`<span class="badge warn">Completar etiqueta</span>` : ''}</div>
          </a>
          <button class="btn btn-sm btn-soft" type="button" data-restock="${p.id}" aria-label="Reponer ${p.producto}">${icon('plus')}Reponer</button>
        </div>`;
      })}</div>` : html`<p class="muted small">No hay productos con stock bajo.</p>`}
      <a class="btn btn-ghost btn-block" style="margin-top:12px" href="#/stock/nuevo">${icon('plus')}Nuevo producto</a>`;
  }

  function compras() {
    const bajos = all('stock').filter(isLow);
    const recientes = all('compras').sort(byDateDesc).slice(0, 20);
    return html`
      <h2 class="section-title" style="margin-bottom:12px">Lista de compras sugerida</h2>
      ${bajos.length ? html`<div class="card"><ul class="shop-list">${bajos.map((p) => {
        const falta = Math.max(0, (Number(p.umbral) || 0) * 2 - (Number(p.cantidad) || 0));
        return html`<li><span>${p.producto}</span><span class="mono">${fmtQty(falta, p.unidad)}${p.costo !== '' ? html` · <span class="muted">${money(falta * Number(p.costo))}</span>` : ''}</span></li>`;
      })}</ul>
      <p class="xsmall muted" style="margin-top:8px">Sugerencia: reponer hasta el doble del umbral mínimo.</p>
      <button class="btn btn-sm btn-ghost" type="button" data-action="share-list" style="margin-top:8px">${icon('share')}Compartir lista</button></div>`
        : html`<p class="muted small">Nada por reponer: todo está sobre el umbral.</p>`}
      <h2 class="section-title" style="margin:24px 0 12px">Reposiciones recientes</h2>
      ${recientes.length ? html`<div class="list">${recientes.map((c) => html`<div class="list-item"><div class="li-main"><div class="li-title">${c.producto}</div><div class="li-sub">${fdate(c.fecha)} · ${fmtQty(Number(c.cantidad), get('stock', c.producto_id)?.unidad || '')}</div></div><span class="mono small">${c.costo_total !== '' ? money(c.costo_total) : ''}</span></div>`)}</div>`
        : html`<p class="muted small">Todavía no registraste reposiciones.</p>`}`;
  }

  function ventas() {
    const vs = all('ventas').sort(byDateDesc);
    const total = vs.filter((v) => v.estado_pago !== 'pendiente').reduce((s, v) => s + (Number(v.monto) || 0), 0);
    return html`
      <div class="row-between" style="margin-bottom:12px"><span class="small muted">${vs.length} ventas · cobrado ${money(total)}</span><a class="btn btn-sm" href="#/ventas/nueva">${icon('plus')}Venta</a></div>
      ${vs.length ? html`<div class="list">${vs.slice(0, 100).map((v) => html`<div class="list-item">
        <div class="li-main"><div class="li-title">${v.producto} · ${num(v.cantidad)}</div><div class="li-sub">${fdate(v.fecha)}${v.cliente_id ? ` · ${fullName(get('clientes', v.cliente_id))}` : ''}</div></div>
        <div class="right"><div class="strong mono">${money(v.monto)}</div>
          ${v.estado_pago === 'pendiente' ? html`<button class="badge danger" type="button" data-paid="${v.id}" style="border:0">Pendiente · cobrar</button>` : html`<span class="badge ok">Pagado</span>`}</div>
      </div>`)}</div>` : emptyState({ ic: 'cart', title: 'Sin ventas registradas', text: 'Registrá la venta de químicos a tus clientes.', action: { label: 'Registrar venta', href: '#/ventas/nueva' } })}`;
  }

  function render() {
    mount(root, html`
      ${pageHead('Stock y ventas')}
      <div class="segmented" role="tablist">
        ${[['inventario', 'Inventario'], ['compras', 'Compras'], ['ventas', 'Ventas']].map(([k, l]) => html`<button type="button" role="tab" data-tab="${k}" aria-pressed="${k === tab}" aria-selected="${k === tab}">${l}</button>`)}
      </div>
      <div style="margin-top:16px">${tab === 'inventario' ? inventario() : tab === 'compras' ? compras() : ventas()}</div>`);
  }

  function restock(id) {
    const p = get('stock', id);
    const s = sheet({
      title: `Reponer ${p.producto}`,
      content: html`<form class="form" id="rf" novalidate>
        <div class="grid-2">
          <div class="field"><label for="r-cant">Cantidad (${p.unidad || 'u'})</label><input class="input" id="r-cant" name="cantidad" inputmode="decimal" autofocus></div>
          <div class="field"><label for="r-cost">Costo total</label><div class="input-suffix"><input class="input" id="r-cost" name="costo_total" inputmode="decimal"><span>$</span></div></div>
        </div>
        <div class="field"><label for="r-fecha">Fecha</label><input class="input" type="date" id="r-fecha" name="fecha" value="${today()}"></div>
        <label class="check"><input type="checkbox" name="act_costo" checked> Actualizar el costo unitario del producto</label>
      </form>`,
      footer: html`<button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn" type="button" data-ok>Guardar</button>`
    });
    s.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const f = s.el.querySelector('#rf');
      const cant = parseNum(f.cantidad.value);
      const cost = parseNum(f.costo_total.value);
      if (cant === '' || Number.isNaN(cant) || cant <= 0) { toast('Ingresá una cantidad mayor a 0'); f.cantidad.focus(); return; }
      if (Number.isNaN(cost) || (cost !== '' && cost < 0)) { toast('Costo inválido'); return; }
      await save('compras', { fecha: f.fecha.value || today(), producto_id: p.id, producto: p.producto, cantidad: cant, costo_total: cost });
      const cur = get('stock', p.id);
      await save('stock', { ...cur, cantidad: Math.round(((Number(cur.cantidad) || 0) + cant) * 1000) / 1000, ...(f.act_costo.checked && cost !== '' ? { costo: Math.round((cost / cant) * 100) / 100 } : {}) });
      s.close();
      toast(`Stock de ${p.producto}: ${fmtQty(Number(cur.cantidad || 0) + cant, p.unidad)}`);
    });
  }

  on(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; render(); });
  on(root, 'click', '[data-f]', (e, b) => { filtro = b.dataset.f; render(); });
  on(root, 'click', '[data-restock]', (e, b) => restock(b.dataset.restock));
  on(root, 'click', '[data-paid]', async (e, b) => { const v = get('ventas', b.dataset.paid); await save('ventas', { ...v, estado_pago: 'pagado' }); toast('Venta cobrada'); });
  on(root, 'click', '[data-action="seed"]', async () => {
    const ok = await confirmDialog({ title: 'Cargar productos sugeridos', message: 'Se crean los productos que usás habitualmente con cantidad 0 y sin concentraciones ni dosis: completalos desde cada etiqueta.', confirm: 'Cargar' });
    if (!ok) return;
    await saveMany('stock', TIPOS_SUGERIDOS.map((t) => ({ producto: TIPOS[t].sugerido, tipo: t, unidad: TIPOS[t].unidad, cantidad: 0, modo: TIPOS[t].modo, parametro: TIPOS[t].parametro, sentido: TIPOS[t].sentido, conc_unidad: TIPOS[t].conc_unidad || '' })));
    toast('Productos cargados. Completá concentraciones y dosis.');
  });
  on(root, 'click', '[data-action="share-list"]', async () => {
    const text = 'Lista de compras phcontrol:\n' + all('stock').filter(isLow).map((p) => `• ${p.producto}: ${fmtQty(Math.max(0, (Number(p.umbral) || 0) * 2 - (Number(p.cantidad) || 0)), p.unidad)}`).join('\n');
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Lista copiada'); }
    } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir'); }
  });

  render();
  ctx.onChange(render, ['stock', 'compras', 'ventas', 'clientes', '*']);
}
