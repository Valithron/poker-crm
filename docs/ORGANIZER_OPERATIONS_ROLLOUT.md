# Organizer operations rollout

This release adds the organizer operations hub, event capacity, shared defaults, invite text, search, improved dashboard summaries, and organizer management.

## Required database migration

Apply the third migration to the one remote D1 database before merging or immediately before the production deployment:

```bash
npm run db:migrate:remote
```

Expected new migration:

```text
0003_organizer_operations.sql
```

The migration:

- adds `events.capacity`
- creates the single-row `app_settings` table
- initializes safe empty defaults

## Production verification

After Cloudflare Pages deploys:

1. Open `/ops` and confirm the organizer overview loads.
2. Open **Settings** and save a default location, game text, stakes text, money-tracking preference, and buy-in.
3. Create a new night from **Plan night** and confirm those defaults are pre-filled.
4. Set a capacity and copy the generated invite text.
5. Add players and RSVP states in the main event editor, then confirm the operations RSVP rollup updates.
6. Search for a player by name or contact detail and an event by title, location, or host.
7. As an admin, confirm organizer records can be added and updated.
8. Confirm adding an organizer record does not imply Cloudflare Access permission. The same email must also be allowed by the Access policy.

## Access model

The operations API is protected by the same Cloudflare Access JWT validation and D1 organizer resolution as the existing API routes.

Only active D1 organizers can use the operations hub. Only admins can add organizers or change another organizer's role and active status. The API prevents removal of the final active admin and prevents an admin from removing their own admin access.
