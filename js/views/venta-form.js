import { html, mount, formData, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, clientPicker, bindClientPicker, emptyState } from '../ui/components.js';
import { all, get, save, ajustarStock } from '../data/store.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../router.js';
import { today, parseNum, money } from '../util/format.js';

export default async function ventaForm(root, ctx) {
  const stock = all('stock').sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
  if (!stock.length) { mount(root, emptyState({ ic: 'box', title: 'Primero cargá productos', text: 'Para vender necesitás productos en Stock.', action: { label: 'Ir a Stock', href: '#/stock' } })); return; }

  mount(root, html`
    ${pageHead('Registrar venta', 'Venta de químicos')}
    <form class="form" id="vf" novalidate>
      ${clientPicker('cliente_id', ctx.query.cliente || '', { required: false, label: 'Cliente (opcional)' })}
      <div class="field"><label for="prod">Producto *</label><select class="select" id="prod" name="producto_id"><option value="">Elegí</option>
        ${stock.map((p) => html`<option value="${p.id}">${p.producto} (${p.unidad || 'u'})${p.precio !== '' ? ` · ${money(p.precio)}` : ''}</option>`)}</select>
        <p class="field-hint" id="disp"></p></div>
      <div class="grid-2">
        <div class="field"><label for="cant">Cantidad *</label><input class="input" id="cant" name="cantidad" inputmode="decimal"></div>
        <div class="field"><label for="monto">Monto *</label><div class="input-suffix"><input class="input" id="monto" name="monto" inputmode="decimal"><span>$</span></div></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="fecha">Fecha</label><input class="input" type="date" id="fecha" name="fecha" value="${today()}"></div>
        <div class="field"><label for="pago">Pago</label><select class="select" id="pago" name="estado_pago"><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option></select></div>
      </div>
      <div class="form-actions"><a class="btn btn-ghost" href="#/stock?tab=ventas">Cancelar</a><button class="btn" type="submit">${icon('check')}Guardar venta</button></div>
    </form>`);
  const form = root.querySelector('#vf');
  bindClientPicker(form, 'cliente_id');
  let montoTocado = false;
  form.monto.addEventListener('input', () => { montoTocado = true; });
  const recalc = () => {
    const p = get('stock', form.producto_id.value);
    root.querySelector('#disp').textContent = p ? `Disponible: ${p.cantidad || 0} ${p.unidad}` : '';
    const c = parseNum(form.cantidad.value);
    if (p && p.precio !== '' && c && !Number.isNaN(c) && !montoTocado) form.monto.value = String(Math.round(c * Number(p.precio)));
  };
  form.producto_id.addEventListener('change', recalc);
  form.cantidad.addEventListener('input', recalc);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const cant = parseNum(d.cantidad);
    const monto = parseNum(d.monto);
    const errors = {};
    if (!d.producto_id) errors.producto_id = 'Elegí un producto.';
    if (cant === '' || Number.isNaN(cant) || cant <= 0) errors.cantidad = 'Cantidad mayor a 0.';
    if (monto === '' || Number.isNaN(monto) || monto < 0) errors.monto = 'Monto inválido.';
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    const p = get('stock', d.producto_id);
    await save('ventas', { fecha: d.fecha || today(), cliente_id: d.cliente_id, producto_id: p.id, producto: p.producto, cantidad: cant, monto, estado_pago: d.estado_pago });
    await ajustarStock(p.id, -cant);
    toast(`Venta registrada · ${money(monto)}`);
    navigate('#/stock?tab=ventas', { replace: true });
  });
}
