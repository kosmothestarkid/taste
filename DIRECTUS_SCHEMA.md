# Taste — Directus Schema (matched to the prototype)

The prototype's local data layer ([js/db.js](js/db.js)) mirrors this schema one-to-one.
Going live means creating these collections on the Scene's Directus instance
(`api.thescenecapetown.co.za`), then reimplementing db.js's functions with the same
`apiGet`/`apiPost`/`apiPatch` wrapper Scene Studio already uses. Nothing above db.js changes.

Auth is **not** duplicated: Taste signs in against the existing Directus users
(`/auth/login`, `/auth/refresh`), exactly like Scene Studio. No new user system.

## Collections

### `taste_profiles`

One per user; created on first visit to the Taste dashboard.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user` | m2o → `directus_users` | unique; owner of the card |
| `display_name` | string | name on the card; first letter = the corner "rank" |
| `intro` | string | the line under the name ("Work I've loved in recent years:") |
| `card_image` | file (m2o → `directus_files`) | the card photo; replaces the prototype's data-URI |
| `status` | string enum: `draft` / `published` | only `published` cards appear in the deck |
| `date_created` / `date_updated` | timestamps | Directus system fields |

### `taste_categories`

The shelves a profile curates.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `profile` | m2o → `taste_profiles` | cascade delete |
| `name` | string | the shelf's shown label (e.g. `Films`, `Theatre`); the combobox matches this across profiles so users can join an existing category. Empty falls back to the type's default label |
| `type` | string enum: `film` / `books` / `music` / `manga` / `anime` / `games` / `custom` | drives renderer + resolver; `custom` is any free-named shelf (theatre, podcasts…) with a web-search door and no auto-resolver |
| `platform` | string | the chosen door, e.g. `letterboxd`, `goodreads`, `spotify`, `applemusic`, `bandcamp`, `anilist`, `mal`, `web` (validated client-side against platforms.js) |
| `sort` | integer | order on the taste page |

> The combobox's "categories others have made" pool is a global read over
> `taste_categories.name` (deduped, case-insensitive). In the local prototype that pool is
> every category on the device; on Directus it's a public read across published profiles.

### `taste_items`

The typed journal entries.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `category` | m2o → `taste_categories` | cascade delete |
| `title` | string | required; what the user typed |
| `creator` | string | director / author / artist; may be filled by the resolver |
| `year` | integer, nullable | may be filled by the resolver |
| `rating` | float, nullable | 0–5 in halves; rendered as gold stars |
| `url` | string, nullable | resolved canonical link on the chosen platform |
| `image_url` | string, nullable | resolved poster / cover / artwork URL (hotlinked) |
| `resolve_status` | string enum: `pending` / `resolved` / `partial` / `failed` | `partial` = search-link fallback, still a working door |
| `sort` | integer | order within the category |

## Permissions (roles)

- **Public**: read-only on all three collections, filtered to
  `profile.status = published` (items via `category.profile.status`). This is what the
  deck and taste pages read — no login needed to browse.
- **Authenticated (any Scene Studio role)**: full CRUD on rows they own, enforced with
  the standard Directus filter `user = $CURRENT_USER` on `taste_profiles` and
  `profile.user = $CURRENT_USER` / `category.profile.user = $CURRENT_USER` on the children.
  Create permission on `taste_profiles` limited to one row per user (unique constraint on `user`).

## Resolver placement (later option)

The prototype resolves client-side (TMDB / Open Library / iTunes / AniList). In production
this can stay client-side, or move server-side as a Directus Flow / small endpoint extension
triggered on `taste_items` create — which would also let the TMDB and Spotify keys live in
server env instead of the browser. The item fields above are already shaped for either.
