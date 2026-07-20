# Taste ✦

A deck of cards for what people love. Each profile is a playing card — photo in the
arch, your initial in the corners — and flipping it opens that person's taste page:
films, books, music, manga, curated as typed lists that resolve into real doors
(Letterboxd, Goodreads, Spotify, Apple Music, AniList…) with posters and covers fetched
automatically.

Deep indigo + gold foil on warm cream paper. Every edge rounded. Mobile-first — built to
be embedded in the Scene app via Fabrik, and to sit happily on a desktop too.
A Scene Studio experiment by Southbound Studios.

## Run it

It's a fully static site — no build step, no server code:

```
python3 -m http.server 4173
# open http://localhost:4173
```

(Any static server works; ES modules just need http://, not file://.)

## Deploy on GitHub Pages

1. Push this folder as a repo (e.g. `kosmothestarkids/taste`).
2. Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://kosmothestarkids.github.io/taste/`. All paths are
   relative and routing is hash-based, so the subpath just works — the same URL can be
   dropped straight into Fabrik as an in-app webview.

## Status: prototype

- **Accounts and data live in localStorage on the device.** Sign-up/sign-in and the
  whole journal work, but profiles aren't shared between devices yet. That's what the
  Directus backend provides — the schema is written and matched to the code:
  [DIRECTUS_SCHEMA.md](DIRECTUS_SCHEMA.md). Only [js/db.js](js/db.js) and
  [js/auth.js](js/auth.js) swap out; everything above them stays.
- Two demo cards (Kosmo, Nova) seed the deck so it's never empty.
- Film posters need a free TMDB API key (Dashboard → Settings). Books, music, manga and
  anime fetch covers keylessly (Open Library, iTunes, AniList). Every entry always links
  out — no key, no fetch, it falls back to the platform's search page.

## Map

| File | What it is |
|---|---|
| `index.html` | shell: topbar, dark/light toggle, view root |
| `css/styles.css` | the whole aesthetic — indigo/gold/cream, cards, taste page |
| `js/main.js` | hash router, theme, auth views |
| `js/db.js` | data layer (localStorage today, Directus-shaped) |
| `js/auth.js` | sign up / in / out (swaps for Directus auth) |
| `js/platforms.js` | category types + their platform doors |
| `js/resolve.js` | title → link + artwork (TMDB, Open Library, iTunes, AniList) |
| `js/deck.js` | the card deck + flip |
| `js/render-taste.js` | the taste page renderer (grid/list, stars, sort, clamps) |
| `js/dashboard.js` | the signed-in journal: card, categories, tables, settings |
