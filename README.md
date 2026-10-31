# Anchor Dashboard

A self-hosted, favorites-first service dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services. Rebranded from Dashboard Manager Portal in 0.2.0. Version 0.3.0 adds ranked global search with quick results, catalog grouping and usage-aware sorting, a "Most used" surface on Home, a grouped Settings page, and browser-side caching for R2 images.

## Design

Anchor Dashboard ships one locked theme and no theme switch. A navy rail (`#0B1F3A`) frames a pale blue canvas (`#F1F6FB`), services sit on white cards with soft blue borders (`#D6E2EE`), and action blue (`#0868F9`) marks primary controls. Typography pairs Manrope for display with DM Sans for body copy.

The layout includes a collapsible sidebar, global search, category and tag filters, service cards, a dot grid, compact list rows, a drag-to-order favorites view, and an administration panel for taxonomy, settings, and Cloudflare status.

## Search, grouping, and most used

Global search is ranked rather than filtered. Every query term must match the service name, category, tag, description, or URL; each field carries a different weight (name 100, category 40, tag 30, description 14, URL 10) so a name match always outranks a description hit. Matching text is highlighted in the catalog and in the quick-results panel.

- Typing in the search box opens a quick-results panel listing the top five services plus matching categories and tags. `↑`/`↓` move the selection, `Enter` opens the selected result, `Esc` clears the search.
- `Ctrl`/`Cmd` + `K` focuses the search box from anywhere; `/` does the same when focus is not already inside a form control.
- The **Filters & display** panel now exposes **Group** (none, category, first tag) and **Sort** (default order, name A–Z, most used, recently opened). Grouping and sorting pause automatically while edit mode is active so drag targets stay stable.
- Opening a service increments a counter stored in `localStorage` under `anchor-usage-v1`, scoped per profile. Home shows the six most-opened services, and the same counters feed the "Most used" sort plus a small ranking bonus in search. Nothing leaves the browser; **Settings → Storage & connections → Local usage data** resets it.

## Image caching and the R2 free tier

Logos are the only asset type that leaves Cloudflare, so they are cached twice:

1. **Edge cache.** `GET /api/assets?key=…` checks the colo cache before touching D1 or R2, stores successful images for 30 days with an ETag, and normalises the cache key so the favicon cache-buster cannot create duplicate entries. Repeat visits in the same region cost no R2 Class B reads.
2. **Device cache.** `src/js/features/image-cache.js` keeps image bytes in Cache Storage (`anchor-assets-v1`), de-duplicates concurrent requests, and renders from an object URL. Markup opts in with `data-asset-key` and is hydrated after each render, so re-rendering the catalog never re-downloads a logo.

Uploads use the same 30-day immutable metadata. Because every asset key embeds a random UUID, a stored object never changes under the same key, so the long window stays honest. Deleting an upload — or saving a service or branding change that swaps a logo — removes the R2 object, its edge entry, and the device copy, so a retired logo cannot be served from cache for the rest of the window. `Settings → Image cache` reports how many images are stored on the device and can clear them.

The palette lives in `:root` inside `src/styles/00-tokens.css` and is enforced by `npm run check:brand`.

## Current Status

**Authenticated D1 catalog operations, JSON backup/restore, deployment metadata, and private R2 image uploads are deployed.** The portal is a Vite-built frontend hosted on Cloudflare Pages. Pages Functions in `functions/api/` provide the API, `luxorit-portal-db` is the D1 database, and `dashboard-manager-portal-assets` stores portal and service logos in a private R2 bucket.

Cloudflare Access login and initial create/read persistence were verified earlier. The Settings page is grouped into **Identity**, **Experience**, **Storage & connections**, **Data & backups**, **Image cache**, and **About**, with a section jump nav, a connection-status strip, a sticky save bar that reports unsaved changes, a collapsible deployment-details block, on-device image-cache controls, and a reset for local usage data. `npm run check:browser` now exercises the logo upload, display, replacement, and cache-eviction flow against a real browser and the local D1/R2 emulation; the same flow still needs one pass against production. Restore replaces the current catalog, so do not use it for casual testing against production.

Some existing service URLs intentionally end in `.example`. Replace them with real addresses only after reviewing the catalog.

## Stack

- **Frontend:** Vite-built vanilla HTML/CSS/JavaScript, with no framework or build-time type checking layered on top
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Pages Functions, executed on the Workers platform
- **Database:** Cloudflare D1 (SQLite)
- **Object storage:** Private Cloudflare R2 bucket for uploaded portal and service logos

Keeping Pages for the static UI while using Pages Functions for server-side API logic avoids a full hosting migration. A separate standalone Worker is not required for this application's current needs.

## Project structure

`index.html` is the Vite build entry and now holds markup only. Styles are linked from `src/styles/index.css` and the frontend boots from `src/js/main.js`.

```
index.html                  markup plus a single module script tag
src/styles/index.css        @import entry; layer order is load-bearing
src/styles/00-tokens.css    :root design tokens and reset
src/styles/1x-5x-*.css      feature layers, in original document order
src/styles/90-anchor.css    Anchor design system, must stay last
src/js/main.js              composition root: event wiring and first boot
src/js/state.js             the single mutable state object
src/js/config.js            version, image byte cap, favicon, icon options
src/js/seed.js              first-run catalog
src/js/icons.js             inline SVG icon set
src/js/core/dom.js          $ and safe helpers
src/js/core/asset-url.js    /api/assets URL builder shared by the cache layers
src/js/features/*.js        catalog, taxonomy, admin, editor, branding,
                            integrations, api, persistence, images, profile
src/js/features/search.js   ranked search, category/tag matching, highlighting
src/js/features/usage.js    local most-used counters (per profile)
src/js/features/image-cache.js  Cache Storage + object URLs for R2 logos
functions/                  Pages Functions API (D1 and R2)
migrations/                 D1 SQL migrations
scripts/check-brand.mjs     brand regression guard
scripts/smoke.mjs           jsdom boot + feature smoke test
scripts/check-assets.mjs    R2 asset caching contract test
```

Two rules keep the extraction honest. The CSS `@import` order mirrors the original single-file stylesheet exactly, because the sheet is a stack of override layers. Every mutable value lives on the `state` object instead of a module-level `let`, so features can share data without assigning to an imported binding.

## Local scripts

- `npm run dev` builds and serves `dist/` through `wrangler pages dev`.
- `npm run build` bundles the frontend into `dist/`.
- `npm run lint` runs ESLint over `src/js`; `no-undef` catches a module that forgot an import.
- `npm run check:brand` fails when retired palette colours, theme toggles, or the previous brand name reappear.
- `npm run check:smoke` boots the app in jsdom with the network disabled and asserts the catalog renders, global search works, grouping renders, usage is recorded, and the Settings page paints.
- `npm run check:assets` loads the R2 asset handler with stubbed D1, R2, and Cache API doubles and asserts the caching contract (immutable headers, edge hit, 304, 404, 400, and edge eviction when a logo is deleted or replaced).
- `npm run check:browser` drives a real headless Chrome or Edge against `npm run dev`: it uploads and replaces a service logo, verifies Cache Storage serves the second visit without a network request, checks quick results, grouping, and the Settings layout, and writes screenshots to the temp folder. It runs against the local D1/R2 emulation and is not part of `verify` because it needs a local browser.
- `npm run verify` runs the brand guard, lint, the smoke test, the asset test, and the production build.

## API and Data Model

The Pages Functions endpoints are:

- `GET /api/services`, list services.
- `GET /api/services?id=<id>`, read one service.
- `POST /api/services`, create a service.
- `PUT /api/services?id=<id>`, update a service.
- `DELETE /api/services?id=<id>`, delete a service.
- `GET /api/categories`, list categories and counts.
- `GET /api/settings` and `PUT /api/settings`, read or save portal branding and preferences.
- `GET /api/backup` and `POST /api/backup`, export or restore the shared D1 catalog (restore is destructive and requires an authenticated session).
- `GET /api/deployment`, return current Pages URL, branch, commit metadata, and runtime deployment state.
- `GET /api/assets`, check the authenticated R2 binding.
- `POST /api/assets`, upload a validated PNG, JPEG, WebP, or GIF (maximum 5 MB) to private R2.
- `GET /api/assets?key=<key>` and `DELETE /api/assets?key=<key>`, retrieve referenced images or remove unreferenced uploads. Access is protected by Cloudflare Access and server-side JWT validation. Responses are cached at the edge for 30 days (`public, s-maxage`) and in the browser as `private, immutable`, with ETag revalidation; the edge copy short-circuits both the D1 reference check and the R2 read. Deleting an upload, or saving a service or branding change that swaps a logo, evicts the matching edge entry as well as the object.

The D1 schema has `services`, `categories`, `tags`, `service_tags`, and `portal_settings` tables, with indexes and foreign-key relationships. The `services.logo_key` field and branding `logoKey` setting point to private R2 object keys, not public URLs. SQL migrations live in `migrations/` and apply in filename order; run one with `npx wrangler d1 execute DB --remote --file=migrations/<file>.sql`, or swap in `--local` against the dev database. Every migration is idempotent, so re-running is safe.

### Remaining verification steps
1. In the authenticated production portal, export a JSON backup and confirm it contains `source: "cloudflare-d1"` and the expected service list.
2. Test service edit, favorite, duplicate, delete, and Settings persistence after refresh.
3. Repeat the `npm run check:browser` flow once against production: authenticated upload, logo rendering after refresh, replacement cleanup, and failed-upload cleanup.
4. Verify requests without a valid Access assertion fail closed, and verify the production and preview environment variables and D1/R2 bindings in Cloudflare Pages.
5. Exercise restore only with a known-good export after confirming there is no unsaved catalog change to preserve.

The API deliberately returns an error when authentication configuration is missing, rather than allowing unauthenticated database changes.

## Security

- Never commit passwords, API tokens, private keys, or production secrets.
- Keep environment files containing secrets out of version control.
- Verify service URLs and access policies before deployment.
- Require authentication and server-side authorization for administrative actions.
- Keep R2 private; uploaded logos are served through the authenticated Pages Functions endpoint, not a public bucket URL.
- Treat infrastructure hostnames and topology as potentially sensitive.
- Keep this repository private if it will contain real infrastructure details.

## License

See [LICENSE](LICENSE).

## Cloudflare Pages

The Pages project is named `dashboard-manager-portal` and tracks the `main` branch of this repository.

- Build command: `npm run build`
- Build output directory: `dist`
- Preview URL: https://dashboard-manager-portal.pages.dev

Deployment runs through the Pages Git integration: pushes to `main` build and deploy production, and every other branch gets a preview deployment. There is no separate GitHub Actions workflow — `npm run check:brand` is the brand regression gate and is expected to run locally (or in `npm run verify`) before pushing.

Cloudflare Pages is the frontend host, Pages Functions run the backend API on the Workers platform, and D1 is connected for authenticated service, settings, and backup operations. The latest backup/restore implementation was merged in `c28f4e9755efe5c6c5c220f08b9442be413fb15f` and the associated production Pages deployment completed successfully.
