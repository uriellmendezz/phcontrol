/** Exportación de backup a CSV (una planilla por entidad). */
import { ENTITIES, META_FIELDS, serialize } from '../data/schema.js';
import { idb } from '../data/db.js';
import { today } from './format.js';

function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  // Evita inyección de fórmulas al abrir en Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function entityCSV(entity) {
  const rows = await idb.getAll(entity); // incluye eliminados, como la hoja
  const cols = [...META_FIELDS, ...Object.keys(ENTITIES[entity].fields)];
  const lines = [cols.join(',')];
  for (const r of rows) {
    const s = serialize(entity, r);
    lines.push(cols.map((c) => cell(s[c])).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM para que Excel respete los acentos
}

export async function exportFiles() {
  const files = [];
  for (const [entity, def] of Object.entries(ENTITIES)) {
    const text = await entityCSV(entity);
    files.push(new File([text], `phcontrol_${def.sheet}_${today()}.csv`, { type: 'text/csv' }));
  }
  return files;
}

export function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

