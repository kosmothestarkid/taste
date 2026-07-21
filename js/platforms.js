/* ============================================================
   TASTE — PLATFORMS
   The category types on offer, each with up to three popular
   "doors" (platforms). Every platform gets a search-link builder
   so an item ALWAYS links out, even before/without resolution.
   ============================================================ */

export const CATEGORY_TYPES = {
  film: {
    label: 'Films',
    creatorLabel: 'Director',
    tile: 'poster',
    platforms: {
      letterboxd: { label: 'Letterboxd', search: (q) => `https://letterboxd.com/search/films/${encodeURIComponent(q)}/` },
      imdb: { label: 'IMDb', search: (q) => `https://www.imdb.com/find/?q=${encodeURIComponent(q)}&s=tt` },
      tmdb: { label: 'TMDB', search: (q) => `https://www.themoviedb.org/search?query=${encodeURIComponent(q)}` },
    },
  },
  books: {
    label: 'Books',
    creatorLabel: 'Author',
    tile: 'poster',
    platforms: {
      goodreads: { label: 'Goodreads', search: (q) => `https://www.goodreads.com/search?q=${encodeURIComponent(q)}` },
      storygraph: { label: 'StoryGraph', search: (q) => `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(q)}` },
      openlibrary: { label: 'Open Library', search: (q) => `https://openlibrary.org/search?q=${encodeURIComponent(q)}` },
    },
  },
  music: {
    label: 'Music',
    creatorLabel: 'Artist',
    tile: 'square',
    platforms: {
      spotify: { label: 'Spotify', search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
      applemusic: { label: 'Apple Music', search: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}` },
      bandcamp: { label: 'Bandcamp', search: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}` },
    },
  },
  manga: {
    label: 'Manga',
    creatorLabel: 'Author',
    tile: 'poster',
    platforms: {
      anilist: { label: 'AniList', search: (q) => `https://anilist.co/search/manga?search=${encodeURIComponent(q)}` },
      mal: { label: 'MyAnimeList', search: (q) => `https://myanimelist.net/manga.php?q=${encodeURIComponent(q)}` },
    },
  },
  anime: {
    label: 'Anime',
    creatorLabel: 'Studio',
    tile: 'poster',
    platforms: {
      anilist: { label: 'AniList', search: (q) => `https://anilist.co/search/anime?search=${encodeURIComponent(q)}` },
      mal: { label: 'MyAnimeList', search: (q) => `https://myanimelist.net/anime.php?q=${encodeURIComponent(q)}` },
    },
  },
  games: {
    label: 'Games',
    creatorLabel: 'Studio',
    tile: 'poster',
    platforms: {
      backloggd: { label: 'Backloggd', search: (q) => `https://backloggd.com/search/games/${encodeURIComponent(q)}` },
      steam: { label: 'Steam', search: (q) => `https://store.steampowered.com/search/?term=${encodeURIComponent(q)}` },
    },
  },
  // Anything the built-in shelves don't cover — theatre, podcasts, food…
  // No auto-resolver; every entry still gets a working web-search door.
  custom: {
    label: 'Custom',
    creatorLabel: 'Maker',
    tile: 'poster',
    platforms: {
      web: { label: 'Web search', search: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
      google: { label: 'Google', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    },
  },
};

export function typeInfo(type) {
  return CATEGORY_TYPES[type] ?? CATEGORY_TYPES.film;
}

export function platformInfo(type, platform) {
  const t = typeInfo(type);
  return t.platforms[platform] ?? Object.values(t.platforms)[0];
}

export function searchLink(type, platform, item) {
  const q = [item.title, item.creator].filter(Boolean).join(' ');
  return platformInfo(type, platform).search(q);
}
