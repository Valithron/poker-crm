# Cloudflare architecture notes

## Proposed request path

```text
Browser
  -> Cloudflare Access
  -> Cloudflare Pages
  -> /api/* Pages Function
  -> Access JWT validation
  -> organizer authorization
  -> D1
```

## Security boundary

Cloudflare Access determines whether a request may reach the application, but API code must still validate the signed Access assertion and resolve the verified email to an active organizer record.

The browser must never choose its own organizer identity.

## Data boundary

The browser communicates only with JSON endpoints under `/api/*`.

D1 bindings remain server-side. No database identifier, SQL statement, or direct database credential is exposed to browser code.

## Environment separation

Use separate D1 databases or bindings for:

- local development
- preview deployments
- production

Preview deployments must not write to production data.

## Deferred choices

The exact frontend component implementation, schema indexes, and deployment-variable names may be refined during the first vertical slice. The organizer workflow and single-source-of-truth rules should not be weakened by those refinements.
