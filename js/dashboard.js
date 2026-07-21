/* ============================================================
   TASTE — DASHBOARD
   The signed-in journal: your card (name, intro, photo), your
   categories (each with its platform doors), the item tables you
   type into, the "fetch links & art" resolver, and settings.
   ============================================================ */

import {
  profileByUser, updateProfile, categoriesOf, itemsOf, allCategories,
  addCategory, removeCategory, setCategoryPlatform,
  addItem, updateItem, removeItem, getSetting, setSetting,
} from './db.js';
import { currentUser, signOut } from './auth.js';
import { CATEGORY_TYPES, typeInfo } from './platforms.js';
import { resolveAll, suggest } from './resolve.js';
import { esc, stars } from './render-taste.js';
import { toast } from './main.js';

/* A category's shown name: the custom label if set, else the type label. */
const catName = (cat) => (cat.name || typeInfo(cat.type).label).trim();

/* Category types with a live typeahead source (see resolve.js suggest()). */
const SEARCHABLE_TYPES = new Set(['film', 'books', 'music', 'manga', 'anime']);

/* Guess a resolver type from a free-typed category name; 'custom' if none
   fit (theatre, podcasts, food…), which still gets a web-search door. */
function typeForName(name) {
  const n = String(name).toLowerCase();
  if (/\b(films?|movies?|cinema)\b/.test(n)) return 'film';
  if (/\b(books?|novels?|reading|literature)\b/.test(n)) return 'books';
  if (/\b(music|albums?|songs?|artists?)\b/.test(n)) return 'music';
  if (/\b(manga|comics?)\b/.test(n)) return 'manga';
  if (/\b(anime)\b/.test(n)) return 'anime';
  if (/\b(games?|gaming|videogames?)\b/.test(n)) return 'games';
  return 'custom';
}

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
        <h3>${esc(catName(cat))}</h3>
        <button class="danger-btn" data-remove-cat="${esc(cat.id)}">remove</button>
      </div>
      <div class="platform-pick">${chips}</div>
      <div class="cat-items">
        ${items.map(itemRowHtml).join('') || '<p class="empty-note">Type your first entry below.</p>'}
      </div>
      <form class="add-item-form" data-add-to="${esc(cat.id)}">
        <div class="ac-field span-2">
          <input name="title" placeholder="Start typing a title…" required autocomplete="off">
          <div class="ac-menu" hidden></div>
        </div>
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
      <p class="sub">Search a shelf someone's already started — or name your own. Type your list, then fetch.</p>
      <div id="cat-blocks">${cats.map(categoryBlockHtml).join('')}</div>
      <form id="add-cat-form" class="dash-row">
        <div class="ac-field" style="flex:1;">
          <input id="cat-search" name="name" autocomplete="off"
            placeholder="Search or name a category — films, theatre, music…">
          <div class="ac-menu" hidden></div>
        </div>
        <button class="pill-btn small" type="submit">Add category</button>
      </form>
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

/* Generic typeahead: debounced fetch, thumbnails, keyboard + click select.
   `fetch(q)` returns rows of { title, sub?, image?, ...payload };
   `onPick(row)` acts on the chosen row. */
function attachAutocomplete(input, menu, { fetch, onPick, minLen = 2 }) {
  let rows = [], active = -1, token = 0, timer = null;

  const close = () => { menu.hidden = true; menu.innerHTML = ''; rows = []; active = -1; };
  const rowHtml = (it, i) => `
    <button type="button" class="ac-row${i === active ? ' active' : ''}" data-i="${i}">
      ${it.image
        ? `<span class="ac-thumb"><img src="${esc(it.image)}" alt="" loading="lazy"></span>`
        : `<span class="ac-thumb ac-thumb-blank">✦</span>`}
      <span class="ac-text">
        <span class="ac-title">${esc(it.title)}</span>
        ${it.sub ? `<span class="ac-sub">${esc(it.sub)}</span>` : ''}
      </span>
    </button>`;
  const render = () => {
    if (!rows.length) { menu.innerHTML = '<div class="ac-note">No matches</div>'; menu.hidden = false; return; }
    menu.innerHTML = rows.map(rowHtml).join('');
    menu.hidden = false;
    menu.querySelector('.ac-row.active')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => { const it = rows[i]; if (it) { close(); onPick(it); } };

  const run = async (q) => {
    const mine = ++token;
    menu.innerHTML = '<div class="ac-note">Searching…</div>';
    menu.hidden = false;
    let res = [];
    try { res = await Promise.resolve(fetch(q)); } catch { res = []; }
    if (mine !== token) return; // a newer keystroke already superseded this
    rows = res || []; active = -1; render();
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < minLen) { close(); return; }
    timer = setTimeout(() => run(q), 240);
  });
  input.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { close(); }
  });
  // mousedown (not click) so selection fires before the input's blur closes the menu.
  menu.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.ac-row');
    if (row) { e.preventDefault(); pick(Number(row.dataset.i)); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

/* The pool the category combobox searches: every distinct category name on
   this device (so you can join "theatre" if anyone made it) plus the built-in
   shelves, ranked by how many people share each, filtered to the query. */
function categoryOptions(query, profileId) {
  const q = query.trim().toLowerCase();
  const agg = new Map(); // lowercased name -> { name, type, count }
  for (const c of allCategories()) {
    const name = catName(c);
    const key = name.toLowerCase();
    const cur = agg.get(key) || { name, type: c.type, count: 0 };
    cur.count += 1;
    agg.set(key, cur);
  }
  // Seed the built-in shelves (skip the generic "custom" bucket).
  for (const [type, t] of Object.entries(CATEGORY_TYPES)) {
    if (type === 'custom') continue;
    if (!agg.has(t.label.toLowerCase())) agg.set(t.label.toLowerCase(), { name: t.label, type, count: 0 });
  }
  const mine = new Set(categoriesOf(profileId).map((c) => catName(c).toLowerCase()));
  let list = [...agg.values()].filter((r) => !q || r.name.toLowerCase().includes(q));
  list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const rows = list.slice(0, 8).map((r) => ({
    title: r.name,
    sub: (r.count > 0 ? `${typeInfo(r.type).label} · ${r.count} ${r.count === 1 ? 'person' : 'people'}` : typeInfo(r.type).label)
      + (mine.has(r.name.toLowerCase()) ? ' · already yours' : ''),
    image: null,
    _cat: { name: r.name, type: r.type },
    _mine: mine.has(r.name.toLowerCase()),
  }));
  // Offer to create a brand-new shelf when the query isn't an exact match.
  if (q && !agg.has(q)) {
    const t = typeForName(query);
    rows.unshift({
      title: `Create “${query.trim()}”`,
      sub: `new ${typeInfo(t).label.toLowerCase()} category`,
      image: null,
      _cat: { name: query.trim(), type: t },
    });
  }
  return rows;
}

export function wireDashboard(root, rerender) {
  const user = currentUser();
  const profile = profileByUser(user.id);

  /* Create (or join) a category by name, keeping names unique per profile. */
  const commitCategory = (name, type) => {
    name = String(name || '').trim();
    if (!name) return;
    const dup = categoriesOf(profile.id).some((c) => catName(c).toLowerCase() === name.toLowerCase());
    if (dup) { toast('You already have that category.'); return; }
    const t = type || typeForName(name);
    const platform = Object.keys(typeInfo(t).platforms)[0];
    addCategory(profile.id, t, platform, name);
    rerender();
  };

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

  // Category combobox: search shelves others made, or name your own.
  const catInput = root.querySelector('#cat-search');
  const catMenu = root.querySelector('#add-cat-form .ac-menu');
  if (catInput && catMenu) {
    attachAutocomplete(catInput, catMenu, {
      minLen: 1,
      fetch: (q) => categoryOptions(q, profile.id),
      onPick: (row) => commitCategory(row._cat.name, row._cat.type),
    });
  }
  root.querySelector('#add-cat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    commitCategory(catInput?.value, null);
  });

  // Item rows: typeahead with thumbnails, then Add.
  root.querySelectorAll('.add-item-form').forEach((form) => {
    const catId = form.dataset.addTo;
    const cat = categoriesOf(profile.id).find((c) => c.id === catId);
    const titleInput = form.querySelector('input[name="title"]');
    const creatorInput = form.querySelector('input[name="creator"]');
    const yearInput = form.querySelector('input[name="year"]');
    const ratingInput = form.querySelector('[name="rating"]');
    const menu = form.querySelector('.ac-menu');

    // Only the types with a live source get a typeahead; games/custom stay plain.
    if (cat && menu && titleInput && SEARCHABLE_TYPES.has(cat.type)) {
      attachAutocomplete(titleInput, menu, {
        minLen: 2,
        fetch: (q) => suggest(q, cat).then((list) => list.map((r) => ({
          title: r.title,
          sub: [r.creator, r.year].filter(Boolean).join(' · '),
          image: r.image,
          _item: r,
        }))),
        onPick: (row) => {
          const r = row._item;
          titleInput.value = r.title || '';
          if (r.creator) creatorInput.value = r.creator;
          if (r.year) yearInput.value = r.year;
          // Remember the exact match so Add stores its cover + link straight away.
          form._selected = { title: r.title || '', image: r.image || null, url: r.url || null };
        },
      });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = (titleInput.value || '').trim();
      if (!title) return;
      const sel = form._selected;
      const locked = sel && sel.title && sel.title.toLowerCase() === title.toLowerCase();
      addItem(catId, {
        title,
        creator: (creatorInput?.value || '').trim(),
        year: Number(yearInput?.value) || null,
        rating: ratingInput?.value ? Number(ratingInput.value) : null,
        ...(locked ? { url: sel.url, image: sel.image, status: (sel.image || sel.url) ? 'resolved' : 'partial' } : {}),
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
