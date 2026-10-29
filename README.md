# Dashboard Manager Portal

A self-hosted dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services.

## Design

The approved interface uses a near-black navy canvas, subtle blue-gray borders, bright green primary actions, and an optional light theme. Its layout includes a collapsible sidebar, search, category filters, service cards, compact cards, a list view, and an administration panel.

## Current Status

**Authenticated D1 catalog operations, JSON backup/restore, deployment metadata, and private R2 image uploads are deployed.** The portal is a Vite-built frontend hosted on Cloudflare Pages. Pages Functions in `functions/api/` provide the API, `luxorit-portal-db` is the D1 database, and `dashboard-manager-portal-assets` stores portal and service logos in a private R2 bucket.

Cloudflare Access login and initial create/read persistence were verified earlier. The Settings page now combines hosting and API information under one **Cloudflare Pages** card, exposes D1 and R2 connection checks, and includes portal and per-service logo browsing. The latest R2 deployment builds successfully, but the authenticated upload, display, and replacement flow still needs a browser smoke test. Restore replaces the current catalog, so do not use it for casual testing against production.

Some existing service URLs intentionally end in `.example`. Replace them with real addresses only after reviewing the catalog.

## Stack

- **Frontend:** Vite-built HTML/CSS/JavaScript prototype, with React/TypeScript/Tailwind migration as a later refactor
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Pages Functions, executed on the Workers platform
- **Database:** Cloudflare D1 (SQLite)
- **Object storage:** Private Cloudflare R2 bucket for uploaded portal and service logos

Keeping Pages for the static UI while using Pages Functions for server-side API logic avoids a full hosting migration. A separate standalone Worker is not required for this application's current needs.

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
- `GET /api/assets?key=<key>` and `DELETE /api/assets?key=<key>`, retrieve referenced images or remove unreferenced uploads. Access is protected by Cloudflare Access and server-side JWT validation.

The D1 schema has `services`, `categories`, `tags`, `service_tags`, and `portal_settings` tables, with indexes and foreign-key relationships. The `services.logo_key` field and branding `logoKey` setting point to private R2 object keys, not public URLs. SQL migrations are stored in `migrations/`.

### Remaining verification steps
1. In the authenticated production portal, export a JSON backup and confirm it contains `source: "cloudflare-d1"` and the expected service list.
2. Test service edit, favorite, duplicate, delete, and Settings persistence after refresh.
3. Verify authenticated uploads, rendering of portal/service logos after refresh, replacement cleanup, and failed-upload cleanup.
4. Verify requests without a valid Access assertion fail closed, and verify the production and preview environment variables and D1/R2 bindings in Cloudflare Pages.
4. Exercise restore only with a known-good export after confirming there is no unsaved catalog change to preserve.

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

Cloudflare Pages is the frontend host, Pages Functions run the backend API on the Workers platform, and D1 is connected for authenticated service, settings, and backup operations. The latest backup/restore implementation was merged in `c28f4e9755efe5c6c5c220f08b9442be413fb15f` and the associated production Pages deployment completed successfully.
