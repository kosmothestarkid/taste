/* ============================================================
   TASTE — MAIN (entry point)
   Hash routing (works from any base path — GitHub Pages, Fabrik
   webview), theme toggle, auth views, and the route map.
   ============================================================ */

import { signUp, signIn, currentUser, currentProfile } from './auth.js';
import { deckHtml, wireDeck } from './deck.js';
import { tasteHtml, wireTaste } from './render-taste.js';
import { dashboardHtml, wireDashboard } from './dashboard.js';

const view = document.getElementById('view');

/* ---- Toast ------------------------------------------------- */
let toastEl = null, toastTimer = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ---- Theme (dark / light view) ----------------------------- */
const THEME_KEY = 'taste_theme';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

function initTheme() {
  // Light (the template's paper look) is the default; dark is opt-in.
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

/* ---- Auth views -------------------------------------------- */
function loginHtml() {
  return `
    <div class="auth-wrap">
      <div class="heading-block"><h1>Sign in</h1><p>Back to your shelf of doors.</p></div>
      <form id="login-form" class="panel">
        <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
        <button class="pill-btn" type="submit" style="width:100%;">Sign in</button>
        <p class="form-error" id="login-error"></p>
        <p class="form-note">Prototype note: accounts live on this device only until the Directus backend is connected.</p>
      </form>
      <p class="auth-switch">New here? <a href="#/signup">Create your card</a></p>
    </div>`;
}

function signupHtml() {
  return `
    <div class="auth-wrap">
      <div class="heading-block"><h1>Create your card</h1><p>A name, an email, and you're in the deck.</p></div>
      <form id="signup-form" class="panel">
        <div class="field"><label>Display name</label><input name="name" autocomplete="name" required></div>
        <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>Password</label><input name="password" type="password" autocomplete="new-password" required minlength="6"></div>
        <button class="pill-btn gold" type="submit" style="width:100%;">Join the deck</button>
        <p class="form-error" id="signup-error"></p>
      </form>
      <p class="auth-switch">Already have a card? <a href="#/login">Sign in</a></p>
    </div>`;
}

function wireLogin(root) {
  root.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await signIn(f.get('email'), f.get('password'));
    if (r.success) { syncAccountButton(); location.hash = '#/dashboard'; }
    else root.querySelector('#login-error').textContent = r.error;
  });
}

function wireSignup(root) {
  root.querySelector('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await signUp(f.get('name'), f.get('email'), f.get('password'));
    if (r.success) { syncAccountButton(); toast('Welcome to the deck ✦'); location.hash = '#/dashboard'; }
    else root.querySelector('#signup-error').textContent = r.error;
  });
}

/* ---- Topbar account button --------------------------------- */
function syncAccountButton() {
  const btn = document.getElementById('account-btn');
  const user = currentUser();
  if (user) { btn.textContent = 'My Taste'; btn.href = '#/dashboard'; }
  else { btn.textContent = 'Sign in'; btn.href = '#/login'; }
}

/* ---- Router ------------------------------------------------ */
function route() {
  const hash = location.hash || '#/deck';
  const [, path, arg] = hash.match(/^#\/([^/]*)\/?(.*)$/) ?? [];
  syncAccountButton();
  window.scrollTo(0, 0);

  if (path === 'taste' && arg) {
    view.innerHTML = tasteHtml(arg);
    wireTaste(view);
    return;
  }
  if (path === 'login') {
    if (currentUser()) { location.hash = '#/dashboard'; return; }
    view.innerHTML = loginHtml();
    wireLogin(view);
    return;
  }
  if (path === 'signup') {
    if (currentUser()) { location.hash = '#/dashboard'; return; }
    view.innerHTML = signupHtml();
    wireSignup(view);
    return;
  }
  if (path === 'dashboard') {
    if (!currentUser()) { location.hash = '#/login'; return; }
    const rerender = () => {
      // Preserve scroll across dashboard rerenders (adds, fetches).
      const y = window.scrollY;
      view.innerHTML = dashboardHtml();
      wireDashboard(view, rerender);
      window.scrollTo(0, y);
    };
    view.innerHTML = dashboardHtml();
    wireDashboard(view, rerender);
    return;
  }
  // Default: the deck.
  view.innerHTML = deckHtml();
  wireDeck(view);
}

initTheme();
window.addEventListener('hashchange', route);
route();
