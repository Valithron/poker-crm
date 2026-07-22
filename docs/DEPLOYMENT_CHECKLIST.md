# BroTM Poker production deployment checklist

Use this checklist for every production merge that changes database-backed features.

## Before merge

1. Confirm the feature branch passes `npm run check`.
2. Review every new file in `migrations/`.
3. Export the Cloudflare API token and account ID in the current Codespaces terminal.
4. Apply remote migrations from the feature branch:

```bash
npm run db:migrate:remote
```

5. Confirm Wrangler reports every pending migration as applied.
6. Open `/api/health` while signed in through Cloudflare Access.
7. Confirm the response reports:
   - `ok: true`
   - no missing tables
   - no missing columns
   - `schemaVersion` greater than or equal to `requiredSchemaVersion`
8. When the release changes public RSVP behavior, verify the path-specific Access applications described in `PRIVATE_RSVP_ROLLOUT.md`.

## After merge

1. Wait for the Cloudflare Pages production deployment to finish.
2. Open `https://poker.skpfam.com` in a private browser window.
3. Confirm the footer says `Database ready` and displays the deployed build identifier when available.
4. Smoke-test:
   - dashboard
   - player directory and editing
   - night creation
   - roster and attendance
   - invite and RSVP view
   - private RSVP link generation and revocation
   - public RSVP response from a browser without organizer access
   - money ledger
   - closeout
   - history and RSVP audit entry
   - settings
5. On a phone-sized viewport, verify the bottom navigation, event workspace tabs, public RSVP controls, large money controls, and sticky closeout totals.

## Failure behavior

The application must show a deployment warning when the frontend expects tables, columns, or migrations that production D1 does not have. Do not treat a deployment as complete until `/api/health` reports `ok: true`.
