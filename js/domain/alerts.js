/** Alertas del inicio: stock bajo, clientes sin visitar, turnos vencidos, cobros pendientes y lluvia. */
import { all, get } from '../data/store.js';
import { today, diffDays, fullName, money, relDay, fdate } from '../util/format.js';
import { overdue } from './agenda.js';
import { debts } from './stats.js';

export function computeAlerts(cfg, fc) {
  const out = [];
  const t = today();

  // Clientes creados desde la agenda o una visita, con datos por completar
  const borradores = all('clientes').filter((c) => c.estado === 'borrador');
  if (borradores.length) {
    out.push({
      level: 'warn', ic: 'users', href: '#/clientes?filtro=borradores',
      title: `${borradores.length} cliente${borradores.length > 1 ? 's' : ''} en borrador`,
      text: `Completá los datos de ${borradores.slice(0, 3).map(fullName).join(', ')}${borradores.length > 3 ? '…' : ''}.`
    });
  }

  // Stock bajo
  const bajos = all('stock').filter((p) => p.umbral !== '' && Number(p.cantidad || 0) <= Number(p.umbral));
  if (bajos.length) {
    out.push({
      level: 'warn', ic: 'box', href: '#/stock?filtro=bajo',
      title: `Stock bajo: ${bajos.length} producto${bajos.length > 1 ? 's' : ''}`,
      text: bajos.slice(0, 3).map((p) => p.producto).join(', ') + (bajos.length > 3 ? '…' : '')
    });
  }

  // Turnos vencidos (pendientes con fecha pasada)
  const venc = overdue();
  if (venc.length) {
    out.push({
      level: 'danger', ic: 'calendar', href: '#/calendario?vista=dia&fecha=' + venc[0].fecha,
      title: `${venc.length} visita${venc.length > 1 ? 's' : ''} agendada${venc.length > 1 ? 's' : ''} sin cerrar`,
      text: `La más vieja: ${fullName(get('clientes', venc[0].cliente_id))} (${fdate(venc[0].fecha)}). Marcala como hecha, reprogramala o cancelala.`
    });
  }

  // Clientes activos sin visita hace más de N días
  const N = Number(cfg.alertas.dias_sin_visita) || 8;
  const ultima = new Map();
  for (const v of all('visitas')) if (!ultima.has(v.cliente_id) || v.fecha > ultima.get(v.cliente_id)) ultima.set(v.cliente_id, v.fecha);
  const proximas = new Set(all('agenda').filter((a) => (a.estado === 'pendiente' || a.estado === 'reprogramada') && a.fecha >= t).map((a) => a.cliente_id));
  const sinVisita = all('clientes').filter((c) => c.estado !== 'inactivo').filter((c) => {
    const u = ultima.get(c.id);
    return u ? diffDays(t, u) > N && !proximas.has(c.id) : false;
  });
  if (sinVisita.length) {
    out.push({
      level: 'warn', ic: 'users', href: '#/clientes?filtro=sin_visita',
      title: `${sinVisita.length} cliente${sinVisita.length > 1 ? 's' : ''} sin visitar hace más de ${N} días`,
      text: sinVisita.slice(0, 3).map(fullName).join(', ') + ' · sin turno agendado'
    });
  }

  // Cobros pendientes
  const d = debts();
  if (d.total > 0) {
    out.push({
      level: 'info', ic: 'money', href: '#/visitas?pago=pendiente',
      title: `Pendiente de cobro: ${money(d.total)}`,
      text: d.porCliente.slice(0, 3).map((x) => `${fullName(get('clientes', x.cliente_id))} ${money(x.total)}`).join(' · ')
    });
  }

  // Lluvia en los próximos 2 días
  if (fc?.days?.length) {
    const umbral = Number(cfg.clima.umbral_lluvia) || 60;
    const lluvia = fc.days.slice(0, 3).filter((x) => Number(x.prob) >= umbral);
    if (lluvia.length) {
      const visitas = all('agenda').filter((a) => (a.estado === 'pendiente' || a.estado === 'reprogramada') && lluvia.some((l) => l.date === a.fecha)).length;
      out.push({
        level: 'warn', ic: 'rain', href: '#/calendario',
        title: `Lluvia probable ${lluvia.map((l) => `${relDay(l.date).toLowerCase()} (${l.prob} %)`).join(', ')}`,
        text: visitas ? `Tenés ${visitas} visita${visitas > 1 ? 's' : ''} agendada${visitas > 1 ? 's' : ''} esos días. Considerá reprogramar o avisar al cliente.` : 'Sin visitas agendadas esos días.'
      });
    }
  }
  return out;
}
