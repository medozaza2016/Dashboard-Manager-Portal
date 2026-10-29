# Dashboard Manager Portal

A self-hosted dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services.

## Design

The approved interface uses a near-black navy canvas, subtle blue-gray borders, bright green primary actions, and an optional light theme. Its layout includes a collapsible sidebar, search, category filters, service cards, compact cards, a list view, and an administration panel.

## Current Status

**Backend foundation implemented, end-to-end activation pending.** The canonical frontend is the root `index.html`, built by Vite and deployed through Cloudflare Pages. Pages Functions in `functions/api/` provide the server-side API, and `luxorit-portal-db` stores the current catalog in Cloudflare D1. The frontend has API calls for service CRUD and settings, with a browser-local fallback when the backend is not available.

The D1 database has been created and seeded with 12 existing services, 5 categories, 21 tags, 24 service-tag associations, and 3 portal setting records. The SQL migration is checked into `migrations/0001_initial.sql`.

**Not yet fully live:** the latest frontend/API release is still being deployed, and Cloudflare Access variables and the Pages hostname's Access policy must be configured before the browser can use the protected API. Until that authentication configuration is complete, changes may remain local to the browser. Do not treat the portal as production-ready for managing infrastructure until the Access gate has been tested.

Some service URLs are intentionally placeholders ending in `.example`. Replace them with real addresses only after the portal is protected and access policies are verified.

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

The D1 schema has `services`, `categories`, `tags`, `service_tags`, and `portal_settings` tables, with indexes and foreign-key relationships. SQL migrations are stored in `migrations/`.

### Remaining activation steps
1. Verify the latest Pages deployment builds with Functions enabled.
2. Enable Cloudflare Access on the Pages hostname and allow only authorized identities.
3. Configure `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as production and preview environment variables for Pages Functions.
4. Test the protected API, CRUD operations, settings persistence, and failed-auth behavior before treating the portal as live.

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

The current Pages deployment is a public frontend preview only. Cloudflare Workers, D1 persistence, and authentication still need to be implemented before this prototype is used for real administration.
