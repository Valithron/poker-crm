# Cloudflare v2 setup

This guide connects the first BroTM Poker application slice to D1 and Cloudflare Access without committing account identifiers or personal email addresses.

## 1. Create D1 databases

Create separate databases for preview/development and production.

```bash
npx wrangler d1 create brotm-poker-dev
npx wrangler d1 create brotm-poker-production
```

Keep the returned database IDs in Cloudflare configuration. Do not commit them to the repository.

## 2. Apply migrations

Local development:

```bash
npx wrangler d1 migrations apply brotm-poker-dev --local
```

Remote preview/development database:

```bash
npx wrangler d1 migrations apply brotm-poker-dev --remote
```

Production database:

```bash
npx wrangler d1 migrations apply brotm-poker-production --remote
```

## 3. Add the first organizer

Generate UUIDs locally or use any standards-compliant UUID generator. Replace every placeholder before running.

Development:

```bash
npx wrangler d1 execute brotm-poker-dev --remote --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

Production:

```bash
npx wrangler d1 execute brotm-poker-production --remote --command "INSERT INTO organizers (id, email, display_name, role, active, created_at, updated_at) VALUES ('<UUID>', '<ORGANIZER_EMAIL>', '<DISPLAY_NAME>', 'admin', 1, datetime('now'), datetime('now'));"
```

The organizer email must exactly match the email authenticated by Cloudflare Access. Matching is case-insensitive.

## 4. Bind D1 to Pages

In the Cloudflare dashboard, open the Git-integrated Pages project.

For **Preview**:

1. Open **Settings**.
2. Open **Bindings**.
3. Add a D1 database binding.
4. Variable name: `DB`.
5. Database: `brotm-poker-dev`.

For **Production**:

1. Switch the environment selector to Production.
2. Add the same `DB` binding.
3. Database: `brotm-poker-production`.

Preview deployments must never bind to the production database.

## 5. Configure Cloudflare Access

Create a self-hosted Access application for `poker.skpfam.com`.

Use an allow policy containing only approved organizer email addresses or an approved identity-provider group.

Record:

- the Cloudflare Zero Trust team domain, such as `example.cloudflareaccess.com`
- the Access application audience tag

Do not commit either value.

## 6. Add Pages variables

Add these plain-text variables to both Preview and Production, using the proper values for each environment:

- `TEAM_DOMAIN`: the Zero Trust team domain without `https://`
- `POLICY_AUD`: the Access application audience tag
- `ENVIRONMENT`: `preview` or `production`

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
- A player can be created.
- A draft event can be created.
- A player can be added and checked in.
- The event can move from draft to open to active to completed.
- The completed event appears in History.
- Preview data does not appear in production.
