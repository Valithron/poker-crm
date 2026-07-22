# BroTM Poker

A private, mobile-first organizer application for planning, running, and closing recurring home poker nights.

## Current slice

The v2 organizer foundation supports:

- Cloudflare Access-backed organizer identity
- player creation and directory browsing
- draft poker-night creation
- event rosters and RSVP status
- live attendance check-in
- controlled event status transitions
- event completion and history

Money tracking, automatic invitations, player accounts, and analytics are intentionally later phases.

## Stack

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- Cloudflare Access
- React
- TypeScript
- Vite
- Zod
- Vitest

## Install and validate

```bash
npm install
npm run check
```

The production build writes to `dist/`.

## Local development

Apply the initial migration and add a development organizer before starting Pages Functions. See [`docs/CLOUDFLARE_V2_SETUP.md`](docs/CLOUDFLARE_V2_SETUP.md).

```bash
npm run build
npm run dev
```

For frontend-only styling work:

```bash
npm run dev:web
```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank
- D1 binding: `DB`
- Required variables: `TEAM_DOMAIN`, `POLICY_AUD`, `ENVIRONMENT`

Production: `https://poker.skpfam.com`
