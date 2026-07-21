/* ============================================================
   TASTE — RESOLVER
   Turns a typed title into a canonical platform link + cover art.
   All client-side, keyless where possible:
     film  → TMDB when a key is set (exact Letterboxd /tmdb/{id}/ links +
             posters); otherwise Wikipedia, keyless, for the poster + the
             director/year parsed from its one-line description.
     books → Open Library search (keyless, CORS-open) for covers;
             the outbound link honours the chosen platform.
     music → iTunes Search via JSONP (no CORS headers on that API)
             for artwork + Apple Music links; Spotify/Bandcamp get
             search links with the same artwork.
     manga/anime → AniList GraphQL (keyless, CORS-open).
   Failure is never fatal: an item falls back to a search link
   ('partial') so every entry remains a working door.
   ============================================================ */

import { getSetting } from './db.js';
import { searchLink } from './platforms.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cb = '_taste_cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('jsonp timeout')); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    script.onerror = () => { cleanup(); reject(new Error('jsonp failed')); };
    document.head.appendChild(script);
  });
}

async function getJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
}

/* ---- Films ------------------------------------------------- */
/* Upscale an iTunes 100x100 artwork URL to a crisp poster. */
const bumpArtwork = (u) => (u ? u.replace('100x100', '600x600') : null);

/* Films via TMDB — best quality + exact Letterboxd/IMDb/TMDB links,
   but needs a free key. Returns null (not throws) when there's no key. */
async function tmdbFilm(item, platform) {
  const key = getSetting('tmdb_key').trim();
  if (!key) return null;
  // Accept either a v3 api key (short) or a v4 read token (long JWT).
  const isV4 = key.length > 40;
  const opts = isV4 ? { headers: { Authorization: `Bearer ${key}` } } : {};
  const base = 'https://api.themoviedb.org/3';
  const q = (withYear) =>
    `${base}/search/movie?query=${encodeURIComponent(item.title)}` +
    (withYear && item.year ? `&primary_release_year=${item.year}` : '') +
    (isV4 ? '' : `&api_key=${key}`);
  let m = (await getJson(q(true), opts))?.results?.[0];
  if (!m) m = (await getJson(q(false), opts))?.results?.[0];
  if (!m) return null;
  let url;
  if (platform === 'imdb') {
    const ext = await getJson(`${base}/movie/${m.id}/external_ids${isV4 ? '' : `?api_key=${key}`}`, opts);
    url = ext?.imdb_id ? `https://www.imdb.com/title/${ext.imdb_id}/` : null;
  } else if (platform === 'tmdb') {
    url = `https://www.themoviedb.org/movie/${m.id}`;
  } else {
    url = `https://letterboxd.com/tmdb/${m.id}/`;
  }
  return {
    url,
    image: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
  };
}

/* Films the keyless way — Wikipedia. One CORS-open call returns the film's
   poster (its lead image, pilicense=any so non-free posters come too) plus a
   short description like "2000 film by Wong Kar-wai" that hands us the year
   and director for free. iTunes' movie catalogue was retired, so this is our
   no-key source. The outbound link stays the platform's search page. */
const FILM_DISAMBIG = /\s*\((?:\d{4}\s+)?[^)]*\bfilm\b[^)]*\)\s*$/i;

function parseFilmDesc(desc) {
  const year = (String(desc).match(/\b(?:19|20)\d{2}\b/) || [])[0];
  const by = (String(desc).match(/\bby\s+(.+?)\s*$/i) || [])[1] || '';
  return { year: year ? Number(year) : null, creator: by.trim() };
}

async function wikiFilms(query, limit = 7) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
    `&generator=search&gsrsearch=${encodeURIComponent(query + ' film')}&gsrlimit=${limit + 4}&gsrnamespace=0` +
    '&prop=pageimages|description&piprop=thumbnail&pithumbsize=500&pilicense=any';
  const data = await getJson(url);
  const pages = Object.values(data?.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  return pages
    .filter((p) => /\bfilm\b/i.test(p.description || '')) // drop songs/actors/shows the search also returns
    .slice(0, limit)
    .map((p) => {
      const { year, creator } = parseFilmDesc(p.description);
      return { title: p.title.replace(FILM_DISAMBIG, ''), creator, year, image: p.thumbnail?.source ?? null };
    });
}

async function wikipediaFilm(item) {
  const rows = await wikiFilms([item.title, item.creator].filter(Boolean).join(' '), 6);
  if (!rows.length) return null;
  // Prefer an exact-year match when the user gave one, else the top film.
  const hit = (item.year && rows.find((r) => r.year === item.year)) || rows[0];
  return { image: hit.image, year: hit.year, creator: item.creator || hit.creator };
}

async function resolveFilm(item, platform) {
  // Best path first: TMDB (exact links + poster) when a key is present.
  let tmdb = null;
  try { tmdb = await tmdbFilm(item, platform); } catch (err) { /* fall through to keyless */ }
  if (tmdb && tmdb.image) return tmdb;
  // Keyless cover fallback so films get a poster with no TMDB key at all.
  let wiki = null;
  try { wiki = await wikipediaFilm(item); } catch (err) { /* ignore */ }
  if (!tmdb && !wiki) return null;
  return {
    url: tmdb?.url ?? null, // no key -> null -> caller uses the search link
    image: tmdb?.image ?? wiki?.image ?? null,
    year: tmdb?.year ?? wiki?.year ?? null,
    creator: wiki?.creator || item.creator,
  };
}

/* ---- Books (Open Library) ---------------------------------- */
async function resolveBook(item, platform) {
  const q = [item.title, item.creator].filter(Boolean).join(' ');
  const data = await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=key,title,author_name,first_publish_year,cover_i`
  );
  const doc = data?.docs?.[0];
  if (!doc) return null;
  return {
    // Covers come from Open Library regardless; the door is the chosen platform.
    url: platform === 'openlibrary' && doc.key ? `https://openlibrary.org${doc.key}` : null,
    image: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    year: doc.first_publish_year ?? null,
    creator: item.creator || (doc.author_name?.[0] ?? ''),
  };
}

/* ---- Music (iTunes Search, JSONP) -------------------------- */
async function resolveMusic(item, platform) {
  const q = [item.title, item.creator].filter(Boolean).join(' ');
  const data = await jsonp(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=5`
  );
  const hit = data?.results?.[0];
  if (!hit) return null;
  return {
    url: platform === 'applemusic' ? (hit.collectionViewUrl ?? null) : null,
    image: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '600x600') : null,
    year: hit.releaseDate ? Number(hit.releaseDate.slice(0, 4)) : null,
    creator: item.creator || (hit.artistName ?? ''),
  };
}

/* ---- Manga / Anime (AniList GraphQL) ----------------------- */
async function resolveAniList(item, platform, mediaType) {
  const query = `query ($q: String, $t: MediaType) {
    Media(search: $q, type: $t) {
      idMal siteUrl startDate { year }
      title { userPreferred }
      coverImage { large }
    }
  }`;
  const data = await getJson('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { q: item.title, t: mediaType } }),
  });
  const m = data?.data?.Media;
  if (!m) return null;
  const malKind = mediaType === 'ANIME' ? 'anime' : 'manga';
  return {
    url: platform === 'mal'
      ? (m.idMal ? `https://myanimelist.net/${malKind}/${m.idMal}` : null)
      : (m.siteUrl ?? null),
    image: m.coverImage?.large ?? null,
    year: m.startDate?.year ?? null,
  };
}

/* ---- Entry point ------------------------------------------- */
export async function resolveItem(item, category) {
  const fallbackUrl = searchLink(category.type, category.platform, item);
  try {
    let r = null;
    if (category.type === 'film') r = await resolveFilm(item, category.platform);
    else if (category.type === 'books') r = await resolveBook(item, category.platform);
    else if (category.type === 'music') r = await resolveMusic(item, category.platform);
    else if (category.type === 'manga') r = await resolveAniList(item, category.platform, 'MANGA');
    else if (category.type === 'anime') r = await resolveAniList(item, category.platform, 'ANIME');

    if (!r) return { url: fallbackUrl, image: item.image ?? null, status: 'partial' };
    return {
      url: r.url ?? fallbackUrl,
      image: r.image ?? item.image ?? null,
      year: item.year ?? r.year ?? null,
      creator: r.creator ?? item.creator,
      status: r.image || r.url ? 'resolved' : 'partial',
    };
  } catch (err) {
    console.warn(`[taste] resolve failed for "${item.title}":`, err);
    return { url: item.url ?? fallbackUrl, image: item.image ?? null, status: 'partial' };
  }
}

/* ============================================================
   TYPEAHEAD — live suggestions as you type
   Each returns up to ~7 candidates with a thumbnail, so you pick
   the exact title/album (fixes "found the big artist, not the small
   one") instead of typing it all out and hoping the top hit is right.
   Same keyless sources as the resolver; door links honour the
   category's chosen platform where the source exposes them.
   ============================================================ */

async function suggestFilm(q, platform) {
  const key = getSetting('tmdb_key').trim();
  if (key) {
    try {
      const isV4 = key.length > 40;
      const opts = isV4 ? { headers: { Authorization: `Bearer ${key}` } } : {};
      const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}` +
        (isV4 ? '' : `&api_key=${key}`);
      const rows = ((await getJson(url, opts))?.results ?? []).slice(0, 7).map((m) => ({
        title: m.title,
        creator: '',
        year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
        image: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
        url: platform === 'tmdb' ? `https://www.themoviedb.org/movie/${m.id}`
          : platform === 'imdb' ? null // needs an extra call; the search link covers it
            : `https://letterboxd.com/tmdb/${m.id}/`,
      }));
      if (rows.length) return rows;
    } catch (err) { /* fall through to the keyless source */ }
  }
  // Keyless: Wikipedia — poster + director + year, no key.
  return (await wikiFilms(q, 7)).map((f) => ({
    title: f.title,
    creator: f.creator,
    year: f.year,
    image: f.image,
    url: null, // search-link fallback at add time
  }));
}

async function suggestBook(q, platform) {
  const data = await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=7&fields=key,title,author_name,first_publish_year,cover_i`
  );
  return (data?.docs ?? []).slice(0, 7).map((d) => ({
    title: d.title,
    creator: d.author_name?.[0] ?? '',
    year: d.first_publish_year ?? null,
    image: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    url: platform === 'openlibrary' && d.key ? `https://openlibrary.org${d.key}` : null,
  }));
}

async function suggestMusic(q, platform) {
  const data = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=8`);
  return (data?.results ?? []).slice(0, 7).map((a) => ({
    title: a.collectionName,
    creator: a.artistName ?? '',
    year: a.releaseDate ? Number(a.releaseDate.slice(0, 4)) : null,
    image: bumpArtwork(a.artworkUrl100),
    url: platform === 'applemusic' ? (a.collectionViewUrl ?? null) : null,
  }));
}

async function suggestAniList(q, mediaType, platform) {
  const query = `query ($q: String, $t: MediaType) {
    Page(perPage: 7) {
      media(search: $q, type: $t, sort: SEARCH_MATCH) {
        idMal siteUrl startDate { year }
        title { userPreferred }
        coverImage { large }
      }
    }
  }`;
  const data = await getJson('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { q, t: mediaType } }),
  });
  const malKind = mediaType === 'ANIME' ? 'anime' : 'manga';
  return (data?.data?.Page?.media ?? []).map((m) => ({
    title: m.title?.userPreferred ?? '',
    creator: '',
    year: m.startDate?.year ?? null,
    image: m.coverImage?.large ?? null,
    url: platform === 'mal'
      ? (m.idMal ? `https://myanimelist.net/${malKind}/${m.idMal}` : null)
      : (m.siteUrl ?? null),
  }));
}

/* Dispatch by category type. Returns [] for types without a live source
   (games, custom) or on any failure — the plain text field still works. */
export async function suggest(query, category) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  try {
    if (category.type === 'film') return await suggestFilm(q, category.platform);
    if (category.type === 'books') return await suggestBook(q, category.platform);
    if (category.type === 'music') return await suggestMusic(q, category.platform);
    if (category.type === 'manga') return await suggestAniList(q, 'MANGA', category.platform);
    if (category.type === 'anime') return await suggestAniList(q, 'ANIME', category.platform);
  } catch (err) {
    console.warn('[taste] suggest failed:', err);
  }
  return [];
}

/* Resolve a list sequentially with a polite gap between calls. */
export async function resolveAll(items, category, onProgress) {
  let done = 0;
  for (const item of items) {
    const r = await resolveItem(item, category);
    onProgress?.(item, r, ++done, items.length);
    await sleep(180);
  }
}
