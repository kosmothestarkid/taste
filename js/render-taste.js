/* ============================================================
   TASTE — TASTE PAGE RENDERER
   Client-side rebuild of the taste-page template: collapsible
   sections per category, grid/list toggle, gold stars, sortable
   list table, "See all N" clamp with fade. Data comes from the
   local DB instead of build-time RSS scraping.
   ============================================================ */

import { profileById, categoriesOf, itemsOf } from './db.js';
import { typeInfo, platformInfo, searchLink } from './platforms.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function stars(rating) {
  if (rating == null) return '';
  return '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
}

function itemLink(item, cat) {
  return item.url || searchLink(cat.type, cat.platform, item);
}

function gridHtml(items, cat, square) {
  const tiles = items.map((it) => `
    <li>
      <a href="${esc(itemLink(it, cat))}" target="_blank" rel="noopener" title="${esc(it.title)}">
        ${it.image
          ? `<img src="${esc(it.image)}" alt="${esc(it.title)}" loading="lazy">`
          : `<span class="tile-fallback">${esc(it.title)}</span>`}
      </a>
      <span class="tile-meta"><span class="stars">${stars(it.rating)}</span></span>
    </li>`).join('');
  return `
    <div class="view" data-view="grid">
      <ul class="tile-grid expandable${square ? ' square' : ''}" data-visible="9">${tiles}</ul>
      <button class="see-more" hidden>See all</button>
    </div>`;
}

function listHtml(items, cat, creatorLabel) {
  const rows = items.map((it) => `
    <tr data-year="${it.year ?? 0}" data-rating="${it.rating ?? 0}" data-sort="${it.sort}">
      <td>
        <span class="item-cell">
          ${it.image
            ? `<img class="cover" src="${esc(it.image)}" alt="" loading="lazy">`
            : `<span class="cover cover-blank"></span>`}
          <span class="item-info">
            <a href="${esc(itemLink(it, cat))}" target="_blank" rel="noopener">${esc(it.title)}</a>
            ${it.creator ? `<span class="detail">${esc(it.creator)}</span>` : ''}
          </span>
        </span>
      </td>
      <td class="year-cell">${it.year ?? ''}</td>
      <td class="stars">${stars(it.rating)}</td>
    </tr>`).join('');
  return `
    <div class="view" data-view="list" hidden>
      <table class="list-table">
        <thead>
          <tr>
            <th>${esc(typeInfo(cat.type).label.replace(/s$/, ''))}</th>
            <th><button class="sort-btn" data-key="year">Year</button></th>
            <th><button class="sort-btn" data-key="rating">Rating</button></th>
          </tr>
        </thead>
        <tbody class="expandable" data-visible="6">${rows}</tbody>
      </table>
      <button class="see-more" hidden>See all</button>
    </div>`;
}

export function tasteHtml(profileId, { backHref = '#/deck' } = {}) {
  const profile = profileById(profileId);
  if (!profile) return `<p class="empty-note">Profile not found.</p>`;
  const cats = categoriesOf(profileId);

  const sections = cats.map((cat) => {
    const info = typeInfo(cat.type);
    const items = itemsOf(cat.id);
    const plat = platformInfo(cat.type, cat.platform);
    const body = items.length === 0
      ? `<p class="empty-note">Nothing here yet.</p>`
      : gridHtml(items, cat, info.tile === 'square') + listHtml(items, cat, info.creatorLabel);
    return `
      <section class="taste-section-wrap">
        <details class="taste-section" open>
          <summary><h2>${esc(info.label)}</h2></summary>
          <div class="section-body">
            ${items.length ? `
            <div class="view-toggle" hidden>
              <button class="view-btn active" data-view="grid">Grid</button>
              <button class="view-btn" data-view="list">List</button>
            </div>` : ''}
            ${body}
            <p class="platform-link">Door: <a href="${esc(plat.search(''))}" target="_blank" rel="noopener">${esc(plat.label)} →</a></p>
          </div>
        </details>
      </section>`;
  }).join('');

  return `
    <div class="taste-back-row"><a class="ghost-btn" href="${esc(backHref)}">← Back to the deck</a></div>
    <header class="taste-head">
      <h1 class="foil">${esc(profile.name)}</h1>
      <p class="intro">${esc(profile.intro || `Work ${profile.name} has loved:`)}</p>
    </header>
    <main>${sections || '<p class="empty-note">No categories yet.</p>'}</main>`;
}

/* Wire the interactive behaviours inside a rendered container. */
export function wireTaste(root) {
  // Clamp long lists to N entries with fade + "See all" toggle.
  root.querySelectorAll('[data-visible]').forEach((list) => {
    const base = Number(list.dataset.visible);
    const btn = list.closest('.view')?.querySelector('.see-more');
    if (!btn || list.children.length <= base) return;
    let open = false;
    const render = () => {
      // Whole grid rows only: measure the live column count.
      let n = base;
      const cols = getComputedStyle(list)
        .gridTemplateColumns.split(' ')
        .filter((t) => t.endsWith('px')).length;
      if (cols > 1) n = Math.max(cols, Math.floor(base / cols) * cols);
      [...list.children].forEach((el, i) => {
        el.style.display = !open && i >= n ? 'none' : '';
      });
      list.classList.toggle('faded', !open);
      btn.classList.toggle('open', open);
      btn.textContent = open ? 'Show fewer ↑' : `See all ${list.children.length}`;
    };
    btn.hidden = false;
    btn.addEventListener('click', () => {
      open = !open;
      render();
      if (!open) btn.closest('.taste-section-wrap')?.scrollIntoView({ block: 'start' });
    });
    list.closest('details')?.addEventListener('toggle', render);
    list._reclamp = render;
    render();
  });

  // Grid/List switchers.
  root.querySelectorAll('.view-toggle').forEach((toggle) => {
    const scope = toggle.closest('.section-body');
    if (!scope) return;
    const views = scope.querySelectorAll('.view');
    const buttons = toggle.querySelectorAll('.view-btn');
    toggle.hidden = false;
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        views.forEach((v) => { v.hidden = v.dataset.view !== btn.dataset.view; });
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        scope.querySelectorAll('[data-visible]').forEach((l) => l._reclamp?.());
      });
    });
  });

  // Sortable list table: Rating sorts best-first; Year toggles asc/desc.
  root.querySelectorAll('.list-table').forEach((table) => {
    const tbody = table.querySelector('tbody');
    const buttons = table.querySelectorAll('.sort-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const dir = key !== 'rating' && btn.dataset.dir === 'asc' ? 'desc' : 'asc';
        buttons.forEach((b) => delete b.dataset.dir);
        btn.dataset.dir = key === 'rating' ? 'desc' : dir;
        const val = (row, k) => Number(row.dataset[k]) || 0;
        [...tbody.rows]
          .sort((a, b) => {
            if (key === 'rating') return val(b, 'rating') - val(a, 'rating') || val(a, 'year') - val(b, 'year');
            return dir === 'asc' ? val(a, key) - val(b, key) : val(b, key) - val(a, key);
          })
          .forEach((row) => tbody.appendChild(row));
        tbody._reclamp?.();
      });
    });
  });
}
