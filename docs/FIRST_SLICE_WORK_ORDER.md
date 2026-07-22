# BroTM Poker v2 first vertical slice work order

Status: Blocked until `docs/PRODUCT_SPEC_V2.md` is approved.

## Goal

Build the smallest complete, production-shaped workflow that proves the new application architecture and the organizer experience.

At the end of this slice, a trusted organizer can create one player, create one poker night, attach the player to it, mark attendance, complete the event, and see the result in history.

## Branch

Create from the latest `main` after the product-specification pull request is merged:

`agent/v2-first-vertical-slice`

## Technical foundation

Replace the dependency-free preview shell with a maintainable TypeScript application while preserving the existing Cloudflare Pages deployment.

Recommended stack:

- Vite
- React
- TypeScript
- React Router
- Zod
- Cloudflare Pages Functions
- Cloudflare D1
- Wrangler
- Vitest
- Playwright

Do not introduce a general UI framework unless the slice demonstrates a concrete need for one.

## Required repository structure

```text
src/
  app/
  components/
  features/
    dashboard/
    players/
    events/
    history/
  lib/
functions/
  api/
  _middleware.ts
migrations/
public/
tests/
```

The exact internal organization may vary, but feature code, API code, migrations, and tests must remain clearly separated.

## D1 schema

Implement migrations for:

- `organizers`
- `players`
- `events`
- `event_players`
- `event_audit_log`

Do not add the cash ledger in this slice.

All IDs should be generated server-side. All timestamps should be stored consistently in UTC.

Add unique and foreign-key constraints wherever the relationship requires them, including one `event_players` row per event-player pair.

## Authentication and authorization

Add Cloudflare Access JWT validation middleware for `/api/*`.

The middleware must:

1. require `Cf-Access-Jwt-Assertion`
2. validate its signature
3. validate issuer and application audience
4. extract the verified email address
5. resolve an active organizer in D1
6. reject unknown or inactive organizers

Do not trust a browser-supplied email header, query parameter, or request body value.

Expected environment values:

- `TEAM_DOMAIN`
- `POLICY_AUD`
- D1 binding named `DB`

## API routes

Implement JSON APIs for the slice.

### Session

- `GET /api/session`

Returns the verified organizer identity.

### Players

- `GET /api/players`
- `POST /api/players`
- `GET /api/players/:id`

### Events

- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id`

### Event players

- `POST /api/events/:eventId/players`
- `PATCH /api/events/:eventId/players/:playerId`

### Event completion

- `POST /api/events/:id/complete`

Completion must:

- require a valid event
- reject already completed or cancelled events
- set status to `completed`
- set `completed_at`
- append an audit-log entry

## Validation

Use shared Zod schemas for request payloads and domain enums.

Return consistent API errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable message",
    "fields": {}
  }
}
```

Use appropriate status codes. Do not expose SQL errors, stack traces, binding identifiers, or Access tokens to the browser.

## User interface

### Application shell

- authenticated organizer identity
- mobile navigation
- loading and error boundaries
- production-safe empty states

### Dashboard

- next open event, if any
- count of active players
- recent completed events
- create-player and create-event actions

### Players

- list active players
- create-player form
- player detail view

For this slice, player fields are:

- first name
- last name
- display name
- optional email
- optional phone
- optional notes

### Events

- create draft event
- date and start time
- optional host
- location
- game notes
- status display
- add existing player
- invitation and RSVP state
- attendance toggle
- complete event

### History

- list completed events
- show event date, host, and attendance count
- open event detail

## Design requirements

- mobile-first layout
- minimum 44-pixel touch targets for primary controls
- clear status language instead of unexplained icons
- usable at 320 pixels wide
- keyboard accessible on desktop
- visible focus styles
- reduced-motion support
- no horizontal scrolling for the primary workflow

The existing dark poker aesthetic may be refined, but the interface should prioritize speed and clarity over decorative card-table imagery.

## Tests

### Unit tests

- request validation
- status transitions
- attendance derivation
- completed-event calculations

### API tests

Run against local D1 and cover:

- unauthorized request rejected
- unknown organizer rejected
- player creation and retrieval
- event creation
- player added to event
- attendance updated
- event completed
- invalid status transition rejected

### Browser smoke test

Automate the complete slice:

1. open dashboard with test authentication context
2. create player
3. create event
4. add player
5. mark attendance
6. complete event
7. verify event appears in history

## Cloudflare configuration documentation

Update repository documentation with exact steps for:

- creating development and production D1 databases
- applying migrations locally and remotely
- binding `DB` to preview and production
- adding `TEAM_DOMAIN` and `POLICY_AUD`
- configuring Cloudflare Access for `poker.skpfam.com`
- adding the first organizer row
- running local development

Do not commit real account IDs, database IDs, audience tags, secrets, or personal email addresses.

## CI

The pull request must run:

- formatting check
- lint
- type check
- unit tests
- API tests
- production build

The Playwright smoke test may run in a separate job if setup cost makes that cleaner.

## Done when

- the entire organizer flow works locally
- preview deployment builds successfully
- D1 preview binding is documented and verified
- tests pass in GitHub Actions
- no Firebase code or references return
- no historical-data migration exists
- API authorization is enforced server-side
- the full flow is reviewable from a phone
- documentation allows the production setup to be repeated without guesswork
