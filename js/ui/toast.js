const root = () => document.getElementById('toast-root');

/** toast('Guardado') · toast('Algo', { action: 'Deshacer', onAction }) */
export function toast(msg, { action, onAction, duration = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.type = 'button';
    b.textContent = action;
    b.onclick = () => { onAction?.(); close(); };
    el.appendChild(b);
  }
  root().appendChild(el);
  const t = setTimeout(close, duration);
  function close() {
    clearTimeout(t);
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  }
  return close;
}
