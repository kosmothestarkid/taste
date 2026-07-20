/* ============================================================
   TASTE — RESOLVER
   Turns a typed title into a canonical platform link + cover art.
   All client-side, keyless where possible:
     film  → TMDB (needs a free key from Settings; CORS-open).
             Letterboxd accepts /tmdb/{id}/ redirect links.
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

/* ---- Films (TMDB) ------------------------------------------ */
async function resolveFilm(item, platform) {
  const key = getSetting('tmdb_key').trim();
  if (!key) return null; // no key -> caller falls back to search link
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

/* Resolve a list sequentially with a polite gap between calls. */
export async function resolveAll(items, category, onProgress) {
  let done = 0;
  for (const item of items) {
    const r = await resolveItem(item, category);
    onProgress?.(item, r, ++done, items.length);
    await sleep(180);
  }
}
