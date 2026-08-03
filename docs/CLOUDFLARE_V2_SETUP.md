# Cloudflare v2 setup

This guide connects BroTM Poker to one remote D1 database, Cloudflare Access, provider-backed invitation delivery, and the reminder Cron Worker without committing account identifiers or personal email addresses.

## 1. Create one D1 database

Create one remote database:

```bash
npx wrangler d1 create brotm-poker
```

This consumes one Cloudflare D1 database slot. Local development uses Wrangler's local D1 storage and does not consume another remote slot.

## 2. Apply migrations

Local development database:

```bash
npm run db:migrate:local
```

Remote production database:

```bash
npm run db:migrate:remote
```

Both commands apply the committed migrations in `migrations/`. Local data is stored under `.wrangler/state` and remains separate from production.

## 3. Add the first organizer

Replace every placeholder before running.

Local development:

```bash
npx wrangler d1 execute brotm-poker --local --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

Production:

```bash
npx wrangler d1 execute brotm-poker --remote --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

The organizer email must match the email authenticated by Cloudflare Access. Matching is case-insensitive.

## 4. Bind D1 to Pages

Bindings are managed in the Cloudflare dashboard.

1. Open the Pages project.
2. Go to **Settings**.
3. Select the **Production** environment.
4. Open **Bindings**.
5. Select **Add** and choose **D1 database**.
6. Variable name: `DB`.
7. Database: `brotm-poker`.
8. Save and redeploy `main`.

Do not bind the production database to Preview deployments. Preview builds can validate the frontend; full data-flow testing happens locally.

## 5. Configure Cloudflare Access

Create a self-hosted Access application for `poker.skpfam.com`.

Use an allow policy containing only approved organizer email addresses or an approved identity-provider group.

Record:

- the Cloudflare Zero Trust team domain, such as `example.cloudflareaccess.com`
- the Access application audience tag

Do not commit either value.

## 6. Add Pages variables

For the **Production** environment, add:

- `TEAM_DOMAIN`: the Zero Trust team domain without `https://`
- `POLICY_AUD`: the Access application audience tag
- `ENVIRONMENT`: `production`
- `AUTH_MODE`: `access`
- `DELIVERY_MODE`: `live`
- `PUBLIC_APP_ORIGIN`: the public application origin

Add these as encrypted Pages secrets for live delivery:

- `RESEND_API_KEY`
- `EMAIL_FROM`

SMS provider secrets and the reminder Worker are intentionally not required for the email-first invitation release. They remain follow-on work and should not block the first live email test.

Keep the application and Resend tracking DNS records separate. The application hostname `poker.skpfam.com` must continue pointing to the Cloudflare Pages project. If Resend tracking is enabled, use the separate `clicks-poker.skpfam.com` hostname for the Resend tracking CNAME; never replace the application `poker` record with the Resend tracking target.

For local and preview construction, use `AUTH_MODE=public`, `ENVIRONMENT=development`, and `DEV_ORGANIZER_EMAIL=<ORGANIZER_EMAIL>`. Set `DELIVERY_MODE=log` to use the development delivery sink. No Cloudflare Access application is required for these test environments.

## 7. Local development identity

Create a `.dev.vars` file:

```text
ENVIRONMENT=development
AUTH_MODE=public
DELIVERY_MODE=log
DEV_ORGANIZER_EMAIL=<ORGANIZER_EMAIL>
TEAM_DOMAIN=unused-locally
POLICY_AUD=unused-locally
PUBLIC_APP_ORIGIN=http://localhost:8788
```

The local organizer email must exist in the local D1 database.

Build and start Pages Functions:

```bash
npm run build
npm run dev
```

## 8. Pages build configuration

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: blank
- Production branch: `main`

## 9. Verification checklist

- Access challenges an unauthenticated visit to `poker.skpfam.com`.
- An approved organizer reaches the application.
- An authenticated but unregistered email receives a forbidden message.
- Production has one D1 binding named `DB` pointing to `brotm-poker`.
- `ENVIRONMENT` is `production`, not `development`.
- A player can be created.
- A draft event can be created.
- A player can be added and checked in.
- The event can move from draft to open to active to completed.
- The completed event appears in History.
- A manual email send creates a delivery record and the message contains a working RSVP link.
- The email-first Invite roster action creates a delivery record containing a working RSVP link.
- A manual email batch returns a batch summary and can be retried without deleting the original attempt.
- The development sink can exercise the full workflow without Resend credentials.
