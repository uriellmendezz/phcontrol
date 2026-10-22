/**
 * Pantalla de ingreso (usuario y contraseña). Se muestra sobre toda la app cuando el dispositivo
 * no tiene sesión. Una vez que ingresás, la sesión dura un año y la app funciona sin conexión.
 */
import { html, mount, formData, showErrors } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { login } from '../data/api.js';

export function showLogin({ message = '', onDone } = {}) {
  document.getElementById('login')?.remove();
  const el = document.createElement('div');
  el.id = 'login';
  el.className = 'login';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Ingresar a phcontrol');
  mount(el, html`
    <div class="waves-anim" aria-hidden="true"></div>
    <div class="login-inner">
      <img class="login-logo" src="assets/logo/logo-white.svg" alt="phcontrol">
      <form class="login-card form" novalidate>
        <h1 class="login-title">Ingresar</h1>
        ${message ? html`<div class="alert warn">${icon('info')}<p>${message}</p></div>` : ''}
        <div class="field"><label for="lg-user">Usuario</label>
          <input class="input" id="lg-user" name="usuario" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
        <div class="field"><label for="lg-pass">Contraseña</label>
          <div class="input-group"><input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" required>
          <button class="btn btn-soft" type="button" data-toggle aria-label="Mostrar u ocultar contraseña">Ver</button></div></div>
        <p class="form-error" id="lg-error" role="alert" hidden></p>
        <button class="btn btn-block" type="submit">${icon('check')}Ingresar</button>
        <p class="xsmall muted login-help">¿Primera vez? Creá tu usuario desde tu hoja <strong>phcontrol</strong> en Google Sheets: menú <strong>phcontrol → Crear o cambiar usuario</strong>.</p>
      </form>
    </div>`);
  document.body.appendChild(el);
  document.body.classList.add('modal-open');

  const form = el.querySelector('form');
  const err = el.querySelector('#lg-error');
  setTimeout(() => form.usuario.focus(), 300);
  el.querySelector('[data-toggle]').addEventListener('click', (e) => {
    form.password.type = form.password.type === 'password' ? 'text' : 'password';
    e.currentTarget.textContent = form.password.type === 'password' ? 'Ver' : 'Ocultar';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const errors = {};
    if (!d.usuario) errors.usuario = 'Ingresá tu usuario.';
    if (!form.password.value) errors.password = 'Ingresá tu contraseña.';
    if (!showErrors(form, errors)) return;
    if (!navigator.onLine) { err.textContent = 'Necesitás conexión para ingresar. Después la app funciona sin señal.'; err.hidden = false; return; }
    const btn = form.querySelector('[type="submit"]');
    btn.classList.add('is-loading');
    err.hidden = true;
    try {
      await login(d.usuario, form.password.value);
      form.password.value = '';
      el.classList.add('closing');
      document.body.classList.remove('modal-open');
      setTimeout(() => el.remove(), 260);
      onDone?.();
    } catch (ex) {
      err.textContent = ex.message || 'No se pudo ingresar.';
      err.hidden = false;
      btn.classList.remove('is-loading');
    }
  });
}
