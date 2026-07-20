/* ============================================================
   TASTE — DASHBOARD
   The signed-in journal: your card (name, intro, photo), your
   categories (each with its platform doors), the item tables you
   type into, the "fetch links & art" resolver, and settings.
   ============================================================ */

import {
  profileByUser, updateProfile, categoriesOf, itemsOf,
  addCategory, removeCategory, setCategoryPlatform,
  addItem, updateItem, removeItem, getSetting, setSetting,
} from './db.js';
import { currentUser, signOut } from './auth.js';
import { CATEGORY_TYPES, typeInfo } from './platforms.js';
import { resolveAll } from './resolve.js';
import { esc, stars } from './render-taste.js';
import { toast } from './main.js';

const STATUS_LABEL = {
  pending: '○ not fetched',
  partial: '◐ link only',
  resolved: '● fetched',
  failed: '○ failed',
};

function itemRowHtml(it) {
  return `
    <div class="item-row" data-item="${esc(it.id)}">
      <span class="thumb">${it.image ? `<img src="${esc(it.image)}" alt="">` : '✦'}</span>
      <span class="item-main">
        <span class="t">${esc(it.title)} ${it.year ? `<span class="d">(${it.year})</span>` : ''}</span>
        <span class="d">${esc(it.creator || '')} <span class="stars">${stars(it.rating)}</span>
          <span class="status-dot status-${esc(it.status)}">${STATUS_LABEL[it.status] ?? ''}</span></span>
      </span>
      <button class="danger-btn" data-remove="${esc(it.id)}" aria-label="Remove ${esc(it.title)}">✕</button>
    </div>`;
}

function categoryBlockHtml(cat) {
  const info = typeInfo(cat.type);
  const items = itemsOf(cat.id);
  const chips = Object.entries(info.platforms).map(([key, p]) =>
    `<button class="chip${key === cat.platform ? ' active' : ''}" data-cat="${esc(cat.id)}" data-platform="${esc(key)}">${esc(p.label)}</button>`
  ).join('');
  return `
    <div class="cat-block" data-cat-block="${esc(cat.id)}">
      <div class="cat-head">
        <h3>${esc(info.label)}</h3>
        <button class="danger-btn" data-remove-cat="${esc(cat.id)}">remove</button>
      </div>
      <div class="platform-pick">${chips}</div>
      <div class="cat-items">
        ${items.map(itemRowHtml).join('') || '<p class="empty-note">Type your first entry below.</p>'}
      </div>
      <form class="add-item-form" data-add-to="${esc(cat.id)}">
        <input name="title" placeholder="Title" required class="span-2">
        <input name="creator" placeholder="${esc(info.creatorLabel)}">
        <input name="year" placeholder="Year" inputmode="numeric" pattern="[0-9]*">
        <select name="rating">
          <option value="">Rating</option>
          <option value="5">★★★★★</option>
          <option value="4.5">★★★★½</option>
          <option value="4">★★★★</option>
          <option value="3.5">★★★½</option>
          <option value="3">★★★</option>
        </select>
        <button class="pill-btn small span-2" type="submit">Add</button>
      </form>
      <div class="cat-actions">
        <button class="pill-btn small gold" data-resolve="${esc(cat.id)}">Fetch links &amp; art</button>
        <span class="empty-note" data-progress="${esc(cat.id)}"></span>
      </div>
    </div>`;
}

export function dashboardHtml() {
  const user = currentUser();
  const profile = profileByUser(user.id);
  const cats = categoriesOf(profile.id);
  const usedTypes = new Set(cats.map((c) => c.type));
  const typeOptions = Object.entries(CATEGORY_TYPES)
    .filter(([key]) => !usedTypes.has(key))
    .map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`)
    .join('');

  const letter = esc((profile.name || '?').charAt(0).toUpperCase());
  return `
    <div class="heading-block">
      <h1>Your Taste</h1>
      <p>Journal what you love; we fetch the doors. Your card sits in the deck.</p>
    </div>

    <section class="panel">
      <h2>Your card</h2>
      <div class="dash-card-preview">
        <div class="card-slot">
          <span class="card">
            <span class="card-face card-front">
              <span class="card-corner tl"><span class="rank foil">${letter}</span><span class="pip">✦</span></span>
              ${profile.image
                ? `<img class="card-photo" src="${esc(profile.image)}" alt="">`
                : `<span class="card-photo" style="display:grid;place-items:center;font-family:var(--font-heading);font-size:2.6rem;"><span class="foil">${letter}</span></span>`}
              <span class="card-name">${esc(profile.name)}</span>
              <span class="card-corner br"><span class="rank foil">${letter}</span><span class="pip">✦</span></span>
            </span>
          </span>
        </div>
      </div>
      <label class="photo-drop" for="card-photo-input">
        ${profile.image ? 'Replace your card photo' : 'Upload your card photo'} — it sits in the arch.
      </label>
      <input type="file" id="card-photo-input" accept="image/*" hidden>
      <form id="profile-form" style="margin-top:1rem;">
        <div class="field"><label>Display name</label><input name="name" value="${esc(profile.name)}" required></div>
        <div class="field"><label>Intro line</label><input name="intro" value="${esc(profile.intro || '')}" placeholder="Work I've loved in recent years:"></div>
        <button class="pill-btn small" type="submit">Save card</button>
      </form>
    </section>

    <section class="panel">
      <h2>Your categories</h2>
      <p class="sub">Pick a shelf, pick its door, type your list, then fetch.</p>
      <div id="cat-blocks">${cats.map(categoryBlockHtml).join('')}</div>
      ${typeOptions ? `
      <form id="add-cat-form" class="dash-row">
        <select name="type" required style="flex:1;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text);padding:0.6rem 0.8rem;">
          ${typeOptions}
        </select>
        <button class="pill-btn small" type="submit">Add category</button>
      </form>` : '<p class="empty-note">All shelves are in use.</p>'}
    </section>

    <section class="panel">
      <h2>Settings</h2>
      <div class="field">
        <label>TMDB API key (film posters + exact Letterboxd links)</label>
        <input id="tmdb-key" value="${esc(getSetting('tmdb_key'))}" placeholder="free at themoviedb.org/settings/api">
      </div>
      <p class="form-note">Books, music, manga and anime fetch art with no key at all.</p>
      <div class="dash-row" style="margin-top:1rem;">
        <button class="pill-btn small" id="save-settings">Save settings</button>
        <a class="ghost-btn" href="#/taste/${esc(profile.id)}">Preview my taste page</a>
        <button class="ghost-btn" id="sign-out">Sign out</button>
      </div>
    </section>`;
}

/* Downscale an uploaded photo to a storable data URI (~640px JPEG). */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 640;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export function wireDashboard(root, rerender) {
  const user = currentUser();
  const profile = profileByUser(user.id);

  root.querySelector('#profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    updateProfile(profile.id, { name: f.get('name').trim(), intro: f.get('intro').trim() });
    toast('Card saved ✦');
    rerender();
  });

  root.querySelector('#card-photo-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      updateProfile(profile.id, { image: await readPhoto(file) });
      toast('Photo set ✦');
      rerender();
    } catch {
      toast('That image could not be read.');
    }
  });

  root.querySelector('#add-cat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = new FormData(e.target).get('type');
    const firstPlatform = Object.keys(typeInfo(type).platforms)[0];
    addCategory(profile.id, type, firstPlatform);
    rerender();
  });

  root.querySelectorAll('.add-item-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const title = String(f.get('title') || '').trim();
      if (!title) return;
      addItem(form.dataset.addTo, {
        title,
        creator: String(f.get('creator') || '').trim(),
        year: Number(f.get('year')) || null,
        rating: f.get('rating') ? Number(f.get('rating')) : null,
      });
      rerender();
    });
  });

  // Event delegation for chips / removals / resolve buttons.
  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      setCategoryPlatform(chip.dataset.cat, chip.dataset.platform);
      rerender();
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) { removeItem(rm.dataset.remove); rerender(); return; }
    const rmc = e.target.closest('[data-remove-cat]');
    if (rmc) {
      if (confirm('Remove this category and everything in it?')) {
        removeCategory(rmc.dataset.removeCat);
        rerender();
      }
      return;
    }
    const rs = e.target.closest('[data-resolve]');
    if (rs) {
      const catId = rs.dataset.resolve;
      const cat = categoriesOf(profile.id).find((c) => c.id === catId);
      const items = itemsOf(catId);
      if (!cat || items.length === 0) { toast('Nothing to fetch yet.'); return; }
      rs.disabled = true;
      const progress = root.querySelector(`[data-progress="${catId}"]`);
      await resolveAll(items, cat, (item, r, done, total) => {
        updateItem(item.id, {
          url: r.url, image: r.image, status: r.status,
          ...(r.year != null && !item.year ? { year: r.year } : {}),
          ...(r.creator && !item.creator ? { creator: r.creator } : {}),
        });
        if (progress) progress.textContent = `${done}/${total} fetched…`;
      });
      toast('Fetched ✦');
      rerender();
    }
  });

  root.querySelector('#save-settings')?.addEventListener('click', () => {
    setSetting('tmdb_key', root.querySelector('#tmdb-key').value.trim());
    toast('Settings saved ✦');
  });

  root.querySelector('#sign-out')?.addEventListener('click', () => {
    signOut();
    location.hash = '#/deck';
  });
}
