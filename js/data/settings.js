/**
 * Ajustes de la app. Se guardan como un registro de la entidad `config` (id "app"),
 * así viajan a la pestaña Config de la hoja. La URL y el token NO van acá (ver api.js).
 */
import { get, save } from './store.js';

export const DEFAULTS = {
  negocio: {
    nombre: 'phcontrol',
    titular: '',
    telefono: '',
    email: '',
    zona: 'Zona norte de Córdoba',
    lema: 'Puntualidad, reporte digital por WhatsApp y presupuesto transparente.'
  },
  clima: { ciudad: 'Córdoba', lat: -31.42, lng: -64.18, umbral_lluvia: 60 },
  alertas: { dias_sin_visita: 8, proximos_dias: 7 },
  // Rangos objetivo por defecto (sección 6.7), editables.
  rangos: {
    ph: [7.2, 7.6],
    cloro: [1, 3],
    alcalinidad: [80, 120],
    estabilizante: [30, 50]
  },
  // Valores que dependen de la etiqueta de tus productos: vacíos hasta que los cargues.
  calc: { shock_ppm: '', espera_floculante_h: '', espera_shock_h: '', espera_alguicida_h: '' },
  agenda: { duracion: 45, hora_inicio: 7, hora_fin: 21, repetir_semanas: 12 }
};

function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

export function settings() {
  const rec = get('config', 'app');
  return merge(DEFAULTS, rec?.valor || {});
}

export async function saveSettings(patch) {
  const next = merge(settings(), patch);
  await save('config', { id: 'app', valor: next });
  return next;
}
