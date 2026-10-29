# Dashboard Manager Portal

A self-hosted dashboard for organizing infrastructure links, applications, Cloudflare tools, and administrative services.

## Design

The approved interface uses a near-black navy canvas, subtle blue-gray borders, bright green primary actions, and an optional light theme. Its layout includes a collapsible sidebar, search, category filters, service cards, compact cards, a list view, and an administration panel.

## Current Status

**Frontend prototype.** The initial HTML prototype is stored at [prototype/index.html](prototype/index.html). It demonstrates the interface and client-side interactions. It is not yet a React application and is not connected to a persistent backend or Cloudflare services.

Some internal service URLs in the public prototype are replaced with `.example` placeholders. Configure actual URLs locally or through a future authenticated settings workflow.

## Planned Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **Hosting:** Cloudflare Pages
- **API:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Optional object storage:** Cloudflare R2, if required

These integrations are planned and are not represented as implemented.

## Roadmap

### Phase 1: Frontend
- Match the approved mockup and responsive layouts.
- Complete regular-card, compact-card, and list views.
- Complete navigation, search, favorites, categories, and tags.
- Complete add, edit, duplicate, and delete workflows.
- Ensure first-run behavior displays usable sample services.
- Use application-native confirmation dialogs.

### Phase 2: Application structure
- Migrate the prototype into a maintainable React/Vite/TypeScript project.
- Add reusable UI components and typed data models.
- Add linting, formatting, and automated tests.
- Document local development and production builds.

### Phase 3: Cloudflare integration
- Add Workers API endpoints.
- Store services, categories, tags, and preferences in D1.
- Add authentication and authorization before enabling administration.
- Configure Pages deployment and environment bindings.
- Add R2 only if file/object storage is needed.

## Security

- Never commit passwords, API tokens, private keys, or production secrets.
- Keep environment files containing secrets out of version control.
- Verify service URLs and access policies before deployment.
- Require authentication and server-side authorization for administrative actions.
- Treat infrastructure hostnames and topology as potentially sensitive.
- Keep this repository private if it will contain real infrastructure details.

## License

See [LICENSE](LICENSE).
