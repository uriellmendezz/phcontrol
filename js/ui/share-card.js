/**
 * Tarjeta de reporte exportable como imagen (para mandar por WhatsApp).
 * En iOS, navigator.share() debe llamarse dentro del toque del usuario: por eso primero se
 * genera la imagen y después se muestra una hoja con el botón "Compartir" (archivo ya listo).
 */
import { html, mount } from './dom.js';
import { icon } from './icons.js';
import { sheet } from './modal.js';
import { toast } from './toast.js';
import { loadLib } from '../util/libs.js';
import { get } from '../data/store.js';
import { settings } from '../data/settings.js';
import { photoBlob, blobToDataURL } from '../data/photos.js';
import { fullName, longDate, num, fdate, capFirst } from '../util/format.js';
import { rangeStatus } from './components.js';
import { PARAMS, fmtQty } from '../domain/chem.js';

async function toDataURL(url) {
  const res = await fetch(url);
  return blobToDataURL(await res.blob());
}

/**
 * Foto reducida y recortada (cover) al tamaño en que se ve en la tarjeta. Las fotos completas
 * (1280 px) hacen que Safari descarte alguna imagen al rasterizar una tarjeta alta.
 */
async function cardPhoto(ref) {
  const blob = ref ? await photoBlob(ref) : null;
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = 936; const H = 720;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    canvas.width = canvas.height = 0;
    return out;
  } catch {
    return blobToDataURL(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CARD_LABELS = { ph: 'pH', cloro: 'Cloro libre', alcalinidad: 'Alcalinidad', estabilizante: 'Estabilizante' };

function paramRow(key, value, range) {
  if (value === '' || value === null || value === undefined) return '';
  const st = rangeStatus(value, range);
  const txt = st === 'ok' ? 'En rango' : value < range[0] ? 'Bajo' : 'Alto';
  const [min, max] = range;
  const w = max - min || 1;
  const lo = min - w * 1.5; const hi = max + w * 1.5;
  const pct = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  return html`<div class="sc-param">
    <div class="sc-param-name">${CARD_LABELS[key]}</div>
    <div class="sc-param-val">${num(value)}${PARAMS[key].unit ? html`<span class="sc-unit">${PARAMS[key].unit}</span>` : ''}</div>
    <div class="sc-track"><div class="sc-band" style="left:${pct(min)}%;width:${pct(max) - pct(min)}%"></div><div class="sc-mark ${st}" style="left:${pct(value)}%"></div></div>
    <div class="sc-param-foot"><span>Objetivo ${num(min)}–${num(max)} ${PARAMS[key].unit}</span><span class="sc-chip ${st}">${txt}</span></div>
  </div>`;
}

/** Achica la letra del nombre de cada producto hasta que entre en una línea sin tocar la cantidad. */
function fitProductNames(card) {
  card.querySelectorAll('.sc-list li > span:first-child').forEach((name) => {
    let size = parseFloat(getComputedStyle(name).fontSize);
    while (name.scrollWidth > name.clientWidth && size > 14) {
      size -= 1;
      name.style.fontSize = `${size}px`;
    }
  });
}

export async function buildCard(v) {
  const cfg = settings();
  const c = get('clientes', v.cliente_id);
  const p = v.pileta_id ? get('piletas', v.pileta_id) : null;
  const [logo, logoVector, waves, antes, despues] = await Promise.all([
    toDataURL('assets/logo/logo-white.png'),
    toDataURL('assets/logo/logo-white.svg'),
    toDataURL('assets/img/ondas.svg').catch(() => ''),
    cardPhoto(v.foto_antes),
    cardPhoto(v.foto_despues)
  ]);
  const productos = Array.isArray(v.productos) ? v.productos.filter((x) => x.nombre) : [];
  const el = document.createElement('div');
  el.className = 'share-card';
  mount(el, html`
    <div class="sc-head" style="background-image:url('${waves}')">
      <div class="sc-head-inner">
        <img class="sc-logo" src="${logo}" alt="phcontrol">
        <div class="sc-kicker">Reporte de mantenimiento</div>
        <div class="sc-title">${fullName(c)}</div>
        <div class="sc-sub">${capFirst(longDate(v.fecha))}${v.hora ? ` · ${v.hora} h` : ''}</div>
      </div>
    </div>
    <div class="sc-body">
      <div class="sc-meta">
        ${c?.direccion ? html`<span>${c.direccion}${c.barrio ? `, ${c.barrio}` : ''}</span>` : ''}
        ${p ? html`<span>${p.nombre || 'Pileta'}${p.m3 !== '' ? ` · ${num(p.m3)} m³` : ''}</span>` : ''}
      </div>
      <div class="sc-section-title">Valores medidos</div>
      <div class="sc-params">
        ${['ph', 'cloro', 'alcalinidad', 'estabilizante'].map((k) => paramRow(k, v[k], cfg.rangos[k]))}
      </div>
      ${(antes || despues) ? html`
        <div class="sc-section-title">Antes y después</div>
        <div class="sc-photos">
          ${antes ? html`<figure><img src="${antes}" alt=""><figcaption>Antes</figcaption></figure>` : ''}
          ${despues ? html`<figure><img src="${despues}" alt=""><figcaption>Después</figcaption></figure>` : ''}
        </div>` : ''}
      ${productos.length ? html`
        <div class="sc-section-title">Productos aplicados</div>
        <ul class="sc-list">${productos.map((x) => html`<li><span>${x.nombre}</span><span>${fmtQty(Number(x.cantidad), x.unidad)}</span></li>`)}</ul>` : ''}
      ${v.observaciones ? html`<div class="sc-section-title">Observaciones</div><p class="sc-obs">${v.observaciones}</p>` : ''}
    </div>
    <div class="sc-foot">
      <img class="sc-foot-logo" src="${logoVector}" alt="phcontrol">
      <div class="sc-foot-text">
        ${cfg.negocio.titular || cfg.negocio.telefono ? html`<div>${[cfg.negocio.titular, cfg.negocio.telefono].filter(Boolean).join(' · ')}</div>` : ''}
        <div class="sc-lema">${cfg.negocio.lema}</div>
      </div>
    </div>`);
  return el;
}

export async function shareVisit(v) {
  const loading = toast('Generando imagen…', { duration: 20000 });
  let file;
  let url;
  const host = document.createElement('div');
  host.className = 'share-card-host';
  try {
    const lib = await loadLib('htmlToImage');
    const card = await buildCard(v);
    host.appendChild(card);
    document.body.appendChild(host);
    fitProductNames(card);
    // decode() puede quedar esperando un frame si la app está en segundo plano: máximo 1,5 s.
    const decoded = Promise.all([...card.querySelectorAll('img')].map((img) => img.decode?.().catch(() => {})));
    await Promise.race([decoded, new Promise((r) => setTimeout(r, 1500))]);
    await document.fonts?.ready;
    const opts = { pixelRatio: 1, cacheBust: false, backgroundColor: '#FFFFFF', width: 1080 };
    let blob;
    try {
      await lib.toBlob(card, opts); // primer render "en blanco": bug conocido de Safari con imágenes
      blob = await lib.toBlob(card, opts);
    } catch {
      blob = await lib.toBlob(card, { ...opts, skipFonts: true });
    }
    if (!blob) throw new Error('No se pudo generar la imagen.');
    const c = get('clientes', v.cliente_id);
    const name = `reporte_${(fullName(c) || 'cliente').replace(/\s+/g, '_')}_${fdate(v.fecha).replace(/\//g, '-')}.png`;
    file = new File([blob], name, { type: 'image/png' });
    url = URL.createObjectURL(blob);
  } catch (e) {
    loading();
    toast(e.message || 'No se pudo generar la imagen.');
    return;
  } finally {
    host.remove();
  }
  loading();

  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const s = sheet({
    title: 'Reporte listo',
    content: html`<img src="${url}" alt="Vista previa del reporte" style="width:100%;border-radius:12px;border:1px solid var(--border)">`,
    footer: html`
      <button class="btn btn-ghost" type="button" data-dl>${icon('download')}Descargar</button>
      ${canShare ? html`<button class="btn" type="button" data-share>${icon('share')}Compartir</button>` : ''}`,
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000)
  });
  s.el.querySelector('[data-share]')?.addEventListener('click', async () => {
    try {
      await navigator.share({ files: [file], title: 'Reporte de mantenimiento' });
      s.close();
    } catch (e) {
      if (e.name !== 'AbortError') toast('No se pudo compartir. Probá con Descargar.');
    }
  });
  s.el.querySelector('[data-dl]').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  });
}
