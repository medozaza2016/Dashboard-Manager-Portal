# Dashboard Manager Portal

A self-hosted dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services.

## Design

The approved interface uses a near-black navy canvas, subtle blue-gray borders, bright green primary actions, and an optional light theme. Its layout includes a collapsible sidebar, search, category filters, service cards, compact cards, a list view, and an administration panel.

## Current Status

**Core authenticated D1 path verified; backup and restore hardening is in progress.** The portal is a Vite-built frontend hosted on Cloudflare Pages. Pages Functions in `functions/api/` provide the API, and `luxorit-portal-db` is the current D1 database binding.

During the browser smoke test, Cloudflare Access login succeeded, the test service remained visible after a refresh, and the service was visible in D1. This verifies the authenticated login and initial create/read persistence path. Editing, deleting, favorites, shared settings, unauthenticated rejection, and backup/restore still need explicit verification before production-ready status.

The current working branch adds an authenticated `GET /api/backup` export endpoint and `POST /api/backup` restore endpoint. These changes are not deployed until merged and accepted by Cloudflare Pages. Restore validates the backup before replacing the catalog and runs its D1 statements as a batch transaction.

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
- `GET /api/backup` and `POST /api/backup`, export or restore the shared D1 catalog (requires the backup feature branch to be merged and deployed).

The D1 schema has `services`, `categories`, `tags`, `service_tags`, and `portal_settings` tables, with indexes and foreign-key relationships. SQL migrations are stored in `migrations/`.

### Remaining verification steps
1. Test service create, edit, favorite, duplicate, and delete through the authenticated browser session.
2. Test Settings persistence after refresh and in a separate authenticated browser session.
3. Merge and deploy the D1 backup/restore branch, then export a backup and validate restore behavior in a safe test before replacing production catalog data.
4. Verify requests without a valid Access assertion fail closed, and verify the production and preview environment variables and D1 binding in Cloudflare Pages.

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

Cloudflare Pages is the frontend host, Pages Functions run the backend API on the Workers platform, and D1 is connected for authenticated service and settings operations. Backup and restore changes remain pending merge and deployment from the `fix/d1-backup-restore` branch.
