# Taste → Scene Studio / Directus Integration Handoff

**Audience:** the engineer (or AI agent) wiring Taste into the Scene Studio Directus
backend so profiles sync across devices and auth is shared with Scene Studio.

**Read first:** [README.md](README.md) (what the app is) and
[DIRECTUS_SCHEMA.md](DIRECTUS_SCHEMA.md) (the collections, already matched to the code).
This doc is the *how* that connects those two.

---

## 0. TL;DR

Taste is a fully static, hash-routed site. Today it persists everything to
`localStorage` on the device — that's why an account made on a laptop doesn't appear on a
phone. To fix that, **only two files change**: [`js/db.js`](js/db.js) (data layer) and
[`js/auth.js`](js/auth.js) (auth). Every other file is pure UI and must not be touched.

The one subtlety: the current getters are **synchronous** (they return arrays straight
into HTML-building functions), and Directus is **async** (`fetch`). The recommended fix —
detailed in §3 — is to keep the getters synchronous by reading from an in-memory cache
that a per-route `async` loader hydrates from Directus first. That confines async to one
well-defined touch-point in [`js/main.js`](js/main.js) and keeps the promise above intact.

---

## 1. The one architectural promise

> Everything above `db.js` / `auth.js` is UI. Reimplement those two against Directus and
> nothing else changes.

Concretely, the module graph is:

```
main.js ── auth.js ─┐
   │                ├─► db.js  ◄── (localStorage today, Directus tomorrow)
deck.js ────────────┤
render-taste.js ────┤
dashboard.js ───────┤
resolve.js ─────────┘   (resolve.js also uses platforms.js; stays client-side)
```

`deck.js`, `render-taste.js`, `dashboard.js`, `resolve.js`, `platforms.js` are **frozen**.
Preserve the exact function names, argument order, and **return shapes** listed in §2.

---

## 2. The surface you must preserve

These are the only symbols the UI imports. Keep signatures and the **object shapes they
return** identical. (Field-name translation between the UI shape and Directus columns
happens *inside* db.js — see §4.)

### `db.js` — reads (must stay synchronous; serve from the cache in §3)

| Function | Used by | Returns (UI-facing shape) |
|---|---|---|
| `profiles()` | deck.js | `[profile]`, oldest-first |
| `profileById(id)` | render-taste.js | `profile \| null` |
| `profileByUser(userId)` | auth.js, dashboard.js | `profile \| null` |
| `categoriesOf(profileId)` | render-taste.js, dashboard.js | `[category]`, by `sort` |
| `allCategories()` | dashboard.js | `[category]` across **all published profiles** (feeds the category combobox's "others have made" pool) |
| `itemsOf(categoryId)` | render-taste.js, dashboard.js | `[item]`, by `sort` |
| `getSetting(k)` | resolve.js, dashboard.js | `string` |
| `session()` | auth.js | `{ userId } \| null` |

### `db.js` — mutations (write-through to Directus; also update the cache — see §3)

| Function | Notes |
|---|---|
| `addCategory(profileId, type, platform, name)` | `name` = free label; `type` includes `custom`; returns the new category |
| `removeCategory(catId)` | cascade-deletes its items |
| `setCategoryPlatform(catId, platform)` | |
| `addItem(categoryId, fields)` | `fields` may include `{title, creator, year, rating, url, image, status}` — a typeahead pick arrives pre-resolved; a plain add is `status:'pending'` |
| `updateItem(itemId, patch)` | resolver PATCHes `{url, image, status, year?, creator?}` |
| `removeItem(itemId)` | |
| `updateProfile(profileId, patch)` | `patch` may include `{name, intro, image}` |
| `setSetting(k, v)` | |
| `setSession(userId)` | `null` clears |
| `uid()` | keep for optimistic ids; Directus can also mint uuids |
| `save()` | today flushes to localStorage; with Directus it can be a no-op (writes go per-mutation) |

### `auth.js` — the whole surface

| Function | Used by | Behaviour to reproduce |
|---|---|---|
| `signIn(email, password)` | main.js | `{success:true}` or `{success:false, error}` |
| `signUp(name, email, password)` | main.js | same shape — but see §5, this may become "sign in + create card" |
| `signOut()` | dashboard.js | clears the session |
| `currentUser()` | main.js, dashboard.js | **synchronous** `{ id, email, name } \| null` (cache `/users/me`) |
| `currentProfile()` | main.js | `profileByUser(currentUser().id)` |

---

## 3. The async problem, and the pattern that solves it

**Problem.** `dashboardHtml()`, `tasteHtml()`, `deckHtml()` build HTML strings and call
`categoriesOf(...)`, `itemsOf(...)`, `profiles()` **inline, synchronously**. `fetch` is
async. If you make the getters async, the ripple hits every frozen file.

**Recommended pattern — cache + sync getters + write-through + one async touch-point.**

1. Keep an in-memory store shaped exactly like today's `_db`
   (`{ users, profiles, categories, items }`).
2. All getters read from that store, unchanged and synchronous.
3. Add **route-scoped async loaders** in db.js that fetch from Directus and populate the
   store, e.g. `loadDeck()`, `loadProfile(id)`, `loadDashboard(userId)`.
4. Mutations are **optimistic**: update the store immediately (so `rerender()` is instant),
   then fire the Directus write in the background; on failure, `toast(...)` + reload.
5. The **only** edit above db.js: make `route()` in `main.js` `async` and `await` the
   matching loader before it renders. This is the single sanctioned touch-point.

```js
// main.js — the ONE allowed change above the data layer
async function route() {
  const hash = location.hash || '#/deck';
  const [, path, arg] = hash.match(/^#\/([^/]*)\/?(.*)$/) ?? [];
  syncAccountButton();
  window.scrollTo(0, 0);

  if (path === 'taste' && arg) { await loadProfile(arg);              /* then render */ }
  else if (path === 'dashboard') { await loadDashboard(currentUser()?.id); }
  else { await loadDeck(); }
  // ...existing synchronous rendering below, unchanged...
}
```

Everything else (`dashboardHtml`, `wireDashboard`, `resolveAll`, etc.) keeps calling the
synchronous getters and never knows Directus exists.

> Alternative if you prefer: make the data layer fully `async` and add `await` in the
> handful of render/wire call-sites. It works, but it edits frozen files — only do it if
> the team decides the cache pattern isn't worth it.

---

## 4. Collections & field mapping

Create the three collections exactly as in [DIRECTUS_SCHEMA.md](DIRECTUS_SCHEMA.md)
(includes the newer `taste_categories.name` field and the `custom` type). The **UI object
shape differs from the Directus column names**, so db.js must translate on read and write:

**`taste_profiles` ⇄ UI `profile`**

| Directus column | UI field | Note |
|---|---|---|
| `id` | `id` | |
| `user` (m2o directus_users) | `userId` | |
| `display_name` | `name` | |
| `intro` | `intro` | |
| `card_image` (file m2o) | `image` | UI expects a URL string → serve `/assets/{file_id}` (see §6) |
| `status` | — | filter deck/taste reads to `published` |
| `date_created` | `createdAt` | for the deck's oldest-first sort |

**`taste_categories` ⇄ UI `category`**

| Directus column | UI field |
|---|---|
| `id` | `id` |
| `profile` (m2o) | `profileId` |
| `name` | `name` |
| `type` | `type` (enum incl. `custom`) |
| `platform` | `platform` (incl. `web`) |
| `sort` | `sort` |

**`taste_items` ⇄ UI `item`**

| Directus column | UI field |
|---|---|
| `id` | `id` |
| `category` (m2o) | `categoryId` |
| `title` | `title` |
| `creator` | `creator` |
| `year` | `year` |
| `rating` | `rating` |
| `url` | `url` |
| `image_url` | `image` |
| `resolve_status` | `status` |
| `sort` | `sort` |

Watch the renamed pairs: `image_url→image`, `resolve_status→status`,
`display_name→name`, `card_image→image`, `user→userId`. The UI only ever sees the
right-hand names.

---

## 5. Auth — reuse Scene Studio's session (a decision, not just a swap)

Per the schema, Taste must **not** create its own user system. Sign in against the
**existing** Directus users the same way Scene Studio does:

- `signIn(email, password)` → `POST /auth/login {email, password}` → store `access_token`
  + `refresh_token`; refresh via `POST /auth/refresh`.
- `currentUser()` must stay synchronous → on app load fetch `GET /users/me` once and cache
  it; `currentUser()` returns the cache. `signOut()` clears tokens + cache.
- A `taste_profile` is created lazily on first dashboard visit
  (`POST /items/taste_profiles` with `user = $CURRENT_USER`, unique per user).

**Decision to make with the product owner** — the prototype has its own "Create your
card" signup screen. If Taste ships inside the Scene app, users already have Scene
accounts, so `signUp` should probably become **"you're already signed in → let's set up
your card"** rather than registering a new user. Two options:

- **(a) Shared session (preferred if embedded):** Taste runs in a Fabrik webview on the
  same domain as Scene Studio and reuses its auth cookie/token — no login screen at all.
  `currentUser()` just reads `/users/me`. See §8.
- **(b) Standalone login:** keep the sign-in screen, drop/replace the sign-up screen,
  authenticate against Directus. Self-registration only if Scene Studio allows it.

Flag this to Benji before wiring — it changes whether the `#/signup` route survives.

---

## 6. Card image upload

The prototype downsizes the uploaded photo to a data-URI on a canvas
(`readPhoto()` in dashboard.js) and stores it in `profile.image`. **dashboard.js is
frozen**, so keep `updateProfile(profileId, { image })` accepting a data-URI, and inside
db.js:

1. Convert the data-URI to a `Blob`.
2. `POST /files` (multipart) → get the file `id`.
3. `PATCH /items/taste_profiles/{id}` with `card_image = fileId`.
4. On read, map `card_image` → `image` as the URL `/{directus}/assets/{fileId}` (add a
   transform preset for a ~640px thumbnail to match the current sizing).

---

## 7. Resolver & settings — leave as-is (mostly)

- **Keep `resolve.js` client-side.** It already fetches covers keyless (Open Library,
  iTunes, AniList, and Wikipedia for films) and writes results back via `updateItem`.
  `image_url` is an **external hotlink** — Directus just stores the string; don't proxy it.
- **`getSetting`/`setSetting`** back the TMDB key, currently in localStorage. Films now
  resolve **without** a key (Wikipedia), so the key is optional. Options: leave it as a
  per-device localStorage convenience (simplest, no change), or move it to a server env
  var if you later relocate the resolver into a Directus Flow (the schema's "Resolver
  placement" note). Do **not** put a shared TMDB key in client code in a public repo.

---

## 8. Linking it into the Scene app (Fabrik webview)

The site is static, hash-routed, and path-relative, so it drops into a webview as-is
(that's why GitHub Pages under `/taste/` works). To embed:

1. Host it where Scene Studio can frame it — either keep GitHub Pages, or serve the
   `/taste` build from the Scene Studio origin (recommended, because it lets Taste share
   the Directus **auth cookie** — option 5(a) — and avoids cross-origin token passing).
2. Point the Fabrik webview at the URL (a deep link like `.../taste/#/dashboard` lands
   straight on the card editor).
3. **Session sharing:** if same-origin, the Directus cookie is already present — nothing to
   pass. If cross-origin, hand the token to the webview via `postMessage` on load; **never
   put tokens in the URL/query string.** Set Directus CORS to allow the Taste origin.

---

## 9. Reimplementation template

A sketch of the shape — reuse Scene Studio's existing `apiGet/apiPost/apiPatch` wrapper
rather than raw `fetch`:

```js
// db.js (Directus) — read: hydrate the cache, then getters stay synchronous
let _store = { users: [], profiles: [], categories: [], items: [] };

const toProfile = (r) => ({ id: r.id, userId: r.user, name: r.display_name,
  intro: r.intro, image: r.card_image ? assetUrl(r.card_image) : null,
  createdAt: r.date_created });
const toItem = (r) => ({ id: r.id, categoryId: r.category, title: r.title,
  creator: r.creator, year: r.year, rating: r.rating, url: r.url,
  image: r.image_url, status: r.resolve_status, sort: r.sort });

export async function loadDashboard(userId) {
  const me = await apiGet(`/items/taste_profiles`, { filter: { user: { _eq: userId } } });
  const prof = me[0] && toProfile(me[0]);
  if (!prof) return;
  const cats = await apiGet(`/items/taste_categories`, { filter: { profile: { _eq: prof.id } }, sort: ['sort'] });
  const items = await apiGet(`/items/taste_items`, { filter: { category: { profile: { _eq: prof.id } } }, sort: ['sort'] });
  const pool = await apiGet(`/items/taste_categories`, { fields: ['name','type'], filter: { profile: { status: { _eq: 'published' } } } });
  _store.profiles = [prof];
  _store.categories = [...cats.map(toCategory), ...pool.map(toCategory)]; // dedupe as needed
  _store.items = items.map(toItem);
}

export const categoriesOf = (profileId) =>
  _store.categories.filter((c) => c.profileId === profileId).sort((a, b) => a.sort - b.sort);

// db.js (Directus) — write: optimistic cache update + background PATCH
export function updateItem(itemId, patch) {
  const i = _store.items.find((x) => x.id === itemId);
  if (i) Object.assign(i, patch);                     // instant rerender
  apiPatch(`/items/taste_items/${itemId}`, {          // field-name translation on write
    ...(patch.url !== undefined ? { url: patch.url } : {}),
    ...(patch.image !== undefined ? { image_url: patch.image } : {}),
    ...(patch.status !== undefined ? { resolve_status: patch.status } : {}),
    ...(patch.year !== undefined ? { year: patch.year } : {}),
    ...(patch.creator !== undefined ? { creator: patch.creator } : {}),
  }).catch(() => toast('Could not save — refresh to retry.'));
  return i;
}
```

---

## 10. Step-by-step checklist

1. Create `taste_profiles`, `taste_categories`, `taste_items` + fields + the Public /
   Authenticated permissions from [DIRECTUS_SCHEMA.md](DIRECTUS_SCHEMA.md). Include the
   `name` field, the `custom` type, and `web` as a valid platform.
2. Decide auth model with the product owner (§5): shared session vs standalone login;
   keep or drop `#/signup`.
3. Reimplement `auth.js` against `/auth/login` + `/users/me` (+ refresh). Cache the user
   so `currentUser()` stays synchronous.
4. Reimplement `db.js`: the read→cache→sync-getter + optimistic-write pattern (§3, §9),
   with field-name translation (§4).
5. Add the one `await loader()` in `main.js` `route()` (§3).
6. Handle card-image upload via `/files` + `/assets` (§6).
7. Set Directus CORS for the Taste origin; embed via Fabrik (§8).
8. **Parity test:** sign in on two devices → the same card, categories and items appear on
   both; adds/edits/removes persist; the deck lists only `published` profiles; the category
   combobox surfaces shelves other users made.

---

## 11. Gotchas

- **Don't touch the frozen files.** If you feel the urge to edit `dashboard.js` etc., the
  cache pattern (§3) is the escape hatch — use it.
- **Keep getters synchronous.** The whole design leans on it.
- **Translate field names in both directions** (§4) — the UI relies on `.image`, `.status`,
  `.name`.
- **`allCategories()` is a global read** (the combobox's "others have made" pool). Filter it
  to published profiles; if scale bites, replace with a small distinct-name+count endpoint.
- **`image_url` is a hotlink**, not an uploaded file — store the string, don't proxy.
- **Card image is a real file** (`/files` + `card_image`), unlike item covers — don't
  confuse the two.
- **Sort fields** (`sort`) drive on-page order; preserve them on create.
- **Films need no key now** (Wikipedia). A TMDB key only *upgrades* films to exact
  Letterboxd `/tmdb/` links; treat it as optional.
