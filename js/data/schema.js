/**
 * Esquema del lado cliente. Debe coincidir con SCHEMA de apps-script/Code.gs.
 * `sheet` = nombre de la pestaña. Tipos: s (texto), n (número), b (booleano), j (JSON).
 */
export const ENTITIES = {
  clientes: {
    sheet: 'Clientes',
    fields: { nombre: 's', apellido: 's', telefono: 's', email: 's', direccion: 's', barrio: 's', lat: 'n', lng: 'n', notas: 's', tarifa_tipo: 's', tarifa_monto: 'n', estado: 's' }
  },
  piletas: {
    sheet: 'Piletas',
    fields: { cliente_id: 's', nombre: 's', m3: 'n', forma: 's', material: 's', bomba: 's', filtro: 's', cloracion: 's', foto: 's', notas: 's' }
  },
  visitas: {
    sheet: 'Visitas',
    fields: { cliente_id: 's', pileta_id: 's', agenda_id: 's', fecha: 's', hora: 's', ph: 'n', cloro: 'n', alcalinidad: 'n', estabilizante: 'n', productos: 'j', foto_antes: 's', foto_despues: 's', observaciones: 's', monto: 'n', estado_pago: 's' }
  },
  agenda: {
    sheet: 'Agenda',
    fields: { cliente_id: 's', pileta_id: 's', serie_id: 's', visita_id: 's', fecha: 's', hora: 's', duracion: 'n', recurrencia: 's', estado: 's', notas: 's' }
  },
  stock: {
    sheet: 'Stock',
    fields: { producto: 's', tipo: 's', unidad: 's', cantidad: 'n', umbral: 'n', costo: 'n', precio: 'n', modo: 's', parametro: 's', sentido: 's', conc_valor: 'n', conc_unidad: 's', dosis_cant: 'n', dosis_m3: 'n', dosis_efecto: 'n', dosis_choque: 'n', notas: 's' }
  },
  ventas: {
    sheet: 'Ventas',
    fields: { fecha: 's', cliente_id: 's', producto_id: 's', producto: 's', cantidad: 'n', monto: 'n', estado_pago: 's' }
  },
  compras: {
    sheet: 'Compras',
    fields: { fecha: 's', producto_id: 's', producto: 's', cantidad: 'n', costo_total: 'n' }
  },
  config: {
    sheet: 'Config',
    fields: { valor: 'j' }
  }
};

export const META_FIELDS = ['id', 'creado_en', 'actualizado_en', 'servidor_en', 'eliminado'];
export const SHEET_TO_ENTITY = Object.fromEntries(Object.entries(ENTITIES).map(([k, v]) => [v.sheet, k]));

/** Normaliza un registro (por ejemplo, el que viene de la hoja, donde todo es texto). */
export function normalize(entity, rec) {
  const def = ENTITIES[entity];
  const out = { ...rec };
  for (const [f, t] of Object.entries(def.fields)) {
    let v = rec[f];
    if (v === undefined || v === null) v = '';
    if (t === 'n') out[f] = v === '' ? '' : (isNaN(Number(String(v).replace(',', '.'))) ? '' : Number(String(v).replace(',', '.')));
    else if (t === 'j') {
      if (typeof v === 'string' && v !== '') { try { out[f] = JSON.parse(v); } catch { out[f] = null; } }
      else out[f] = v === '' ? null : v;
    } else out[f] = String(v);
  }
  out.eliminado = rec.eliminado === true || rec.eliminado === 'TRUE' || rec.eliminado === 'true';
  return out;
}

/** Prepara un registro para enviar a la hoja. */
export function serialize(entity, rec) {
  const def = ENTITIES[entity];
  const out = {};
  for (const f of META_FIELDS) if (rec[f] !== undefined) out[f] = rec[f];
  for (const [f, t] of Object.entries(def.fields)) {
    const v = rec[f];
    out[f] = t === 'j' ? (v === null || v === undefined || v === '' ? '' : JSON.stringify(v)) : (v ?? '');
  }
  return out;
}
