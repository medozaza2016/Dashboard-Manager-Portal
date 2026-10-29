# Dashboard Manager Portal

A centralized dashboard for accessing and managing self-hosted infrastructure,
Cloudflare services, development tools, and administrative applications.

## Overview

Luxorit Pro Portal provides a customizable interface for organizing service
links in one place. The goal is to create a clean, responsive, and easy-to-use
dashboard for everyday infrastructure administration.

The interface follows a dark navy design with green accents and supports a
light theme.

## Features

- Responsive dashboard with collapsible sidebar
- Dark and light themes
- Service cards and compact card layouts
- List view for service management
- Search services, categories, and tags
- Organize services by category
- Assign multiple tags to services
- Favorites and quick access to applications
- Add, edit, duplicate, and delete services
- Category and tag management
- Import and export dashboard configuration
- Application-native confirmation dialogs

## Technology Roadmap

### Phase 1: Frontend

- Finalize the dashboard UI and responsive behavior
- Implement service management workflows
- Complete category and tag management
- Improve accessibility and usability

### Phase 2: Application Architecture

- Migrate the prototype to React, Vite, TypeScript, and Tailwind CSS
- Establish reusable components and a maintainable project structure
- Add validation and automated tests

### Phase 3: Cloudflare Integration

- Cloudflare Pages for frontend hosting
- Cloudflare Workers for backend API endpoints
- Cloudflare D1 for persistent application data
- Cloudflare R2 if object storage becomes necessary
- Authentication and authorization for administrative features

## Current Status

**Development prototype.**

The initial frontend is a prototype. Persistent backend storage, authentication,
and Cloudflare integrations are planned and should not be considered implemented
until they are developed and tested.

Sample service URLs must be reviewed and replaced with the actual service
addresses before production use.

## Getting Started

The initial prototype can be opened locally in a modern web browser.

For the planned application architecture, the development setup will be
documented here after the React/Vite project structure is established.

## Security

- Do not commit passwords, API tokens, private keys, or other secrets.
- Keep environment files containing secrets out of Git.
- Protect administrative functionality with authentication before production.
- Validate and authorize backend requests.
- Review service URLs before exposing the dashboard to other users.
- Keep the repository private during early development if it contains
  internal infrastructure details.

## License

See [LICENSE](LICENSE) for licensing terms.
