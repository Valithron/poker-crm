# BroTM Poker

A private, mobile-first organizer application for planning, running, and closing recurring poker nights.

## Technology

- Cloudflare Pages
- Cloudflare Pages Functions
- One remote Cloudflare D1 database
- Wrangler local D1 storage for development
- Cloudflare Access
- React, TypeScript, and Vite

## Local validation

```bash
npm install
npm run check
```

## Local application development

```bash
npm run db:migrate:local
npm run build
npm run dev
```

Create `.dev.vars` and seed a local organizer before starting the application. See [`docs/CLOUDFLARE_V2_SETUP.md`](docs/CLOUDFLARE_V2_SETUP.md).

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank
- Production branch: `main`
- Bindings source of truth: Cloudflare dashboard

The Production environment needs one D1 binding named `DB`, pointing to `brotm-poker`. The repository intentionally contains no Pages Wrangler configuration file.

## Documentation

- [`docs/CLOUDFLARE_V2_SETUP.md`](docs/CLOUDFLARE_V2_SETUP.md): D1, Access, Pages variables, and organizer setup
- [`docs/PRODUCT_SPEC_V2.md`](docs/PRODUCT_SPEC_V2.md): approved product definition
- [`docs/FIRST_SLICE_WORK_ORDER.md`](docs/FIRST_SLICE_WORK_ORDER.md): implementation scope and acceptance criteria
- [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md): durable product and architecture decisions
