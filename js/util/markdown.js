/**
 * Markdown mínimo y SEGURO para el teórico: primero se escapa todo y después se aplican
 * títulos (##, ###), listas (-, 1.), negrita (**texto**) y párrafos. No admite HTML.
 */
import { esc, raw } from '../ui/dom.js';

function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>');
}

export function markdown(src = '') {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let out = '';
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of lines) {
    const t = line.trim();
    let m;
    if (!t) { flushPara(); closeList(); continue; }
    if ((m = t.match(/^(#{2,3})\s+(.*)$/))) { flushPara(); closeList(); const lvl = m[1].length; out += `<h${lvl}>${inline(m[2])}</h${lvl}>`; continue; }
    if ((m = t.match(/^[-*]\s+(.*)$/))) { flushPara(); if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; continue; }
    closeList();
    para.push(t);
  }
  flushPara(); closeList();
  return raw(out);
}
