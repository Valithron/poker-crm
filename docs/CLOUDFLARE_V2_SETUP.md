# Cloudflare v2 setup

This guide connects the first BroTM Poker application slice to one remote D1 database and Cloudflare Access without committing account identifiers or personal email addresses.

## 1. Create one D1 database

Create one remote database:

```bash
npx wrangler d1 create brotm-poker
```

This consumes one Cloudflare D1 database slot.

Local development uses Wrangler's local D1 storage and does not consume another remote database slot.

## 2. Apply migrations

Local development database:

```bash
npm run db:migrate:local
```

Remote production database:

```bash
npm run db:migrate:remote
```

Both commands apply the committed migrations in `migrations/`.

The local database is stored under `.wrangler/state` and is separate from production.

## 3. Add the first organizer

Generate a UUID locally or use any standards-compliant UUID generator. Replace every placeholder before running.

Local development:

```bash
npx wrangler d1 execute brotm-poker --local --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

Production:

```bash
npx wrangler d1 execute brotm-poker --remote --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

The organizer email must exactly match the email authenticated by Cloudflare Access. Matching is case-insensitive.

## 4. Bind D1 to Pages

The repository does not use a deployed `wrangler.toml`, so Pages bindings remain editable in the Cloudflare dashboard.

In the Pages project:

1. Open **Settings**.
2. Choose the **Production** environment.
3. Open **Bindings**.
4. Select **Add** and choose **D1 database**.
5. Variable name: `DB`.
6. Database: `brotm-poker`.
7. Save and redeploy the production branch.

Do not bind the production database to Preview deployments. Preview builds can validate and display the frontend, while complete database-backed workflow testing is performed locally.

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

For **Preview**, `ENVIRONMENT=preview` may be set, but no production D1 binding should be attached.

The API validates the signed `Cf-Access-Jwt-Assertion` header, issuer, audience, expiry, signature, and organizer database record.

## 7. Local development identity

For local Pages development only, create a `.dev.vars` file:

```text
ENVIRONMENT=development
DEV_ORGANIZER_EMAIL=<ORGANIZER_EMAIL>
TEAM_DOMAIN=unused-locally
POLICY_AUD=unused-locally
```

`.dev.vars` is ignored by Git and must not be committed.

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
- The Production environment has one D1 binding named `DB` pointing to `brotm-poker`.
- `ENVIRONMENT` is `production`, not `development`.
- A player can be created.
- A draft event can be created.
- A player can be added and checked in.
- The event can move from draft to open to active to completed.
- The completed event appears in History.
