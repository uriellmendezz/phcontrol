import { html, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { errorState } from '../ui/components.js';
import { markdown } from '../util/markdown.js';
import { loadTeorico } from './teorico.js';

const SECCIONES = [
  ['sintomas', 'Síntomas', 'info', 'ul'],
  ['causas', 'Causa probable', 'search', 'ul'],
  ['pasos', 'Solución paso a paso', 'check', 'ol'],
  ['productos', 'Productos y dosis', 'flask', 'ul'],
  ['seguridad', 'Precauciones de seguridad', 'alert', 'ul']
];

export default async function articulo(root, ctx) {
  let data;
  try { data = await loadTeorico(); } catch (e) { mount(root, errorState(e.message)); return; }
  const a = data.articulos.find((x) => x.id === ctx.params.id);
  if (!a) { mount(root, errorState('No encontramos ese artículo.')); return; }
  const isProblem = a.categoria === 'problemas';

  mount(root, html`
    <div class="page-head"><div>
      <a class="badge" href="#/teorico?cat=${a.categoria}" style="text-decoration:none">${data.categorias[a.categoria] || a.categoria}</a>
      <h1 class="page-title" style="margin-top:8px">${a.titulo}</h1>
      ${a.resumen ? html`<p class="page-sub" style="font-size:var(--fs-md)">${a.resumen}</p>` : ''}
    </div></div>
    <div class="stack-lg">
      ${SECCIONES.filter(([k]) => a[k]?.length).map(([k, title, ic, tag]) => html`
        <section class="card ${k === 'seguridad' ? 'card-warn' : ''}">
          <h2 class="section-title row" style="gap:8px;margin-bottom:8px">${icon(ic)}${title}</h2>
          ${tag === 'ol' ? html`<ol class="prose-list">${a[k].map((x) => html`<li>${x}</li>`)}</ol>` : html`<ul class="prose-list">${a[k].map((x) => html`<li>${x}</li>`)}</ul>`}
          ${k === 'productos' ? html`<p class="small muted" style="margin-top:8px">Las dosis dependen de la concentración de tu producto: calculalas en la <a href="#/calculadora">Calculadora</a>.</p>` : ''}
        </section>`)}
      ${a.contenido ? html`<section class="card prose">${markdown(a.contenido)}</section>` : ''}
      ${isProblem ? html`<a class="btn btn-block" href="#/calculadora${a.id === 'agua-verde' ? '?tab=verde' : ''}">${icon('calc')}Abrir la calculadora</a>` : ''}
    </div>`);
}
