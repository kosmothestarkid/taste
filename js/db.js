/* ============================================================
   TASTE — DB (local adapter)
   The whole data layer behind one small surface, shaped like the
   collections in DIRECTUS_SCHEMA.md. Today it persists to
   localStorage; pointing it at Directus later means reimplementing
   these functions with apiGet/apiPost against
   /items/taste_profiles etc. — nothing above this file changes.
   ============================================================ */

const DB_KEY = 'taste_db_v1';
const SESSION_KEY = 'taste_session_v1';

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

/* Demo portrait: quiet paper-toned gradient with a blue star, inline SVG. */
function demoPortrait(hue) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},30%,90%)'/><stop offset='1' stop-color='hsl(${hue + 25},26%,78%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='400' height='500' fill='url(%23g)'/>` +
    `<text x='200' y='285' font-size='130' text-anchor='middle' fill='%232050b3'>✦</text>` +
    `</svg>`;
  return 'data:image/svg+xml,' + svg.replaceAll('#', '%23').replaceAll("'", '%27');
}

/* Two demo profiles so the deck is never empty on first open. */
function seed() {
  const kosmoUser = uid(), novaUser = uid();
  const kosmo = uid(), nova = uid();
  const kFilms = uid(), kMusic = uid(), nBooks = uid(), nManga = uid();
  const lb = (t) => `https://letterboxd.com/search/films/${encodeURIComponent(t)}/`;
  const gr = (q) => `https://www.goodreads.com/search?q=${encodeURIComponent(q)}`;
  const sp = (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
  const al = (q) => `https://anilist.co/search/manga?search=${encodeURIComponent(q)}`;
  return {
    users: [
      { id: kosmoUser, email: 'kosmo@demo.taste', pass: null, name: 'Kosmo', demo: true },
      { id: novaUser, email: 'nova@demo.taste', pass: null, name: 'Nova', demo: true },
    ],
    profiles: [
      { id: kosmo, userId: kosmoUser, name: 'Kosmo', intro: 'Work I keep coming back to:', image: demoPortrait(243), createdAt: Date.now() - 2000 },
      { id: nova, userId: novaUser, name: 'Nova', intro: 'Things that rewired my head:', image: demoPortrait(38), createdAt: Date.now() - 1000 },
    ],
    categories: [
      { id: kFilms, profileId: kosmo, type: 'film', platform: 'letterboxd', sort: 1 },
      { id: kMusic, profileId: kosmo, type: 'music', platform: 'spotify', sort: 2 },
      { id: nBooks, profileId: nova, type: 'books', platform: 'goodreads', sort: 1 },
      { id: nManga, profileId: nova, type: 'manga', platform: 'anilist', sort: 2 },
    ],
    items: [
      { id: uid(), categoryId: kFilms, title: 'In the Mood for Love', creator: 'Wong Kar-wai', year: 2000, rating: 5, url: lb('In the Mood for Love'), image: null, status: 'partial', sort: 1 },
      { id: uid(), categoryId: kFilms, title: 'Paddington 2', creator: 'Paul King', year: 2017, rating: 4.5, url: lb('Paddington 2'), image: null, status: 'partial', sort: 2 },
      { id: uid(), categoryId: kFilms, title: 'Aftersun', creator: 'Charlotte Wells', year: 2022, rating: 4, url: lb('Aftersun'), image: null, status: 'partial', sort: 3 },
      { id: uid(), categoryId: kFilms, title: 'The Apartment', creator: 'Billy Wilder', year: 1960, rating: 5, url: lb('The Apartment'), image: null, status: 'partial', sort: 4 },
      { id: uid(), categoryId: kMusic, title: 'In Rainbows', creator: 'Radiohead', year: 2007, rating: 5, url: sp('In Rainbows Radiohead'), image: null, status: 'partial', sort: 1 },
      { id: uid(), categoryId: kMusic, title: 'Voodoo', creator: "D'Angelo", year: 2000, rating: 5, url: sp("Voodoo D'Angelo"), image: null, status: 'partial', sort: 2 },
      { id: uid(), categoryId: nBooks, title: 'The Remains of the Day', creator: 'Kazuo Ishiguro', year: 1989, rating: 5, url: gr('The Remains of the Day Ishiguro'), image: null, status: 'partial', sort: 1 },
      { id: uid(), categoryId: nBooks, title: 'Pachinko', creator: 'Min Jin Lee', year: 2017, rating: 4, url: gr('Pachinko Min Jin Lee'), image: null, status: 'partial', sort: 2 },
      { id: uid(), categoryId: nManga, title: 'Vagabond', creator: 'Takehiko Inoue', year: 1998, rating: 5, url: al('Vagabond'), image: null, status: 'partial', sort: 1 },
      { id: uid(), categoryId: nManga, title: 'Yotsuba&!', creator: 'Kiyohiko Azuma', year: 2003, rating: 4.5, url: al('Yotsuba'), image: null, status: 'partial', sort: 2 },
    ],
  };
}

let _db = null;

export function db() {
  if (_db) return _db;
  try {
    const raw = localStorage.getItem(DB_KEY);
    _db = raw ? JSON.parse(raw) : seed();
  } catch {
    _db = seed();
  }
  if (!raw_ok(_db)) _db = seed();
  save();
  return _db;
}

function raw_ok(d) {
  return d && Array.isArray(d.users) && Array.isArray(d.profiles) &&
    Array.isArray(d.categories) && Array.isArray(d.items);
}

export function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(_db));
  } catch (e) {
    console.warn('[taste] save failed (storage full?)', e);
  }
}

/* ---- Session ---------------------------------------------- */
export function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function setSession(userId) {
  if (userId) localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, at: Date.now() }));
  else localStorage.removeItem(SESSION_KEY);
}

/* ---- Queries ---------------------------------------------- */
export const profiles = () =>
  [...db().profiles].sort((a, b) => a.createdAt - b.createdAt);

export const profileById = (id) => db().profiles.find((p) => p.id === id) ?? null;

export const profileByUser = (userId) => db().profiles.find((p) => p.userId === userId) ?? null;

export const categoriesOf = (profileId) =>
  db().categories.filter((c) => c.profileId === profileId).sort((a, b) => a.sort - b.sort);

export const itemsOf = (categoryId) =>
  db().items.filter((i) => i.categoryId === categoryId).sort((a, b) => a.sort - b.sort);

/* ---- Mutations -------------------------------------------- */
export function addCategory(profileId, type, platform) {
  const cats = categoriesOf(profileId);
  const cat = { id: uid(), profileId, type, platform, sort: cats.length + 1 };
  db().categories.push(cat);
  save();
  return cat;
}

export function removeCategory(catId) {
  const d = db();
  d.items = d.items.filter((i) => i.categoryId !== catId);
  d.categories = d.categories.filter((c) => c.id !== catId);
  save();
}

export function setCategoryPlatform(catId, platform) {
  const c = db().categories.find((c) => c.id === catId);
  if (c) { c.platform = platform; save(); }
}

export function addItem(categoryId, fields) {
  const item = {
    id: uid(), categoryId,
    title: fields.title, creator: fields.creator ?? '', year: fields.year ?? null,
    rating: fields.rating ?? null, url: null, image: null, status: 'pending',
    sort: itemsOf(categoryId).length + 1,
  };
  db().items.push(item);
  save();
  return item;
}

export function updateItem(itemId, patch) {
  const i = db().items.find((i) => i.id === itemId);
  if (i) { Object.assign(i, patch); save(); }
  return i;
}

export function removeItem(itemId) {
  const d = db();
  d.items = d.items.filter((i) => i.id !== itemId);
  save();
}

export function updateProfile(profileId, patch) {
  const p = db().profiles.find((p) => p.id === profileId);
  if (p) { Object.assign(p, patch); save(); }
  return p;
}

/* ---- Settings (e.g. TMDB key) ------------------------------ */
export const getSetting = (k) => localStorage.getItem('taste_setting_' + k) ?? '';
export const setSetting = (k, v) => localStorage.setItem('taste_setting_' + k, v);
