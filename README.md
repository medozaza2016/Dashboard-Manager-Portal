# Dashboard Manager Portal

A self-hosted dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services.

## Design

The approved interface uses a near-black navy canvas, subtle blue-gray borders, bright green primary actions, and an optional light theme. Its layout includes a collapsible sidebar, search, category filters, service cards, compact cards, a list view, and an administration panel.

## Current Status

**Authenticated D1 catalog operations and JSON backup/restore are deployed.** The portal is a Vite-built frontend hosted on Cloudflare Pages. Pages Functions in `functions/api/` provide the API, and `luxorit-portal-db` is the current D1 database binding.

During the browser smoke test, Cloudflare Access login succeeded, the test service remained visible after refresh, and the service was visible in D1. That verifies Access login and initial create/read persistence. The backup and restore API and Settings buttons are now deployed, but the actual authenticated export still needs a browser smoke test. Restore replaces the current catalog, so do not use it for casual testing against production.

Some existing service URLs intentionally end in `.example`. Replace them with real addresses only after reviewing the catalog.

## Stack

- **Frontend:** Vite-built HTML/CSS/JavaScript prototype, with React/TypeScript/Tailwind migration as a later refactor
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Pages Functions, executed on the Workers platform
- **Database:** Cloudflare D1 (SQLite)
- **Optional object storage:** Cloudflare R2 only if future features require file storage

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

The D1 schema has `services`, `categories`, `tags`, `service_tags`, and `portal_settings` tables, with indexes and foreign-key relationships. SQL migrations are stored in `migrations/`.

### Remaining verification steps
1. In the authenticated production portal, export a JSON backup and confirm it contains `source: "cloudflare-d1"` and the expected service list.
2. Test service edit, favorite, duplicate, delete, and Settings persistence after refresh.
3. Verify requests without a valid Access assertion fail closed, and verify the production and preview environment variables and D1 binding in Cloudflare Pages.
4. Exercise restore only with a known-good export after confirming there is no unsaved catalog change to preserve.

The API deliberately returns an error when authentication configuration is missing, rather than allowing unauthenticated database changes.

## Security

- Never commit passwords, API tokens, private keys, or production secrets.
- Keep environment files containing secrets out of version control.
- Verify service URLs and access policies before deployment.
- Require authentication and server-side authorization for administrative actions.
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
