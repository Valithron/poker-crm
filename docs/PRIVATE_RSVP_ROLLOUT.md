# Private RSVP rollout

This release adds passwordless, player-specific RSVP links. The organizer application remains protected by Cloudflare Access. Only the public RSVP page, its API, and static frontend assets are bypassed.

## 1. Apply migration 0004

From Codespaces with the Cloudflare API token exported:

```bash
npm run db:migrate:remote
```

Confirm that `0004_private_rsvp_links.sql` was applied. The migration adds:

- `event_invites`
- `events.rsvp_location_visibility`
- the inactive `Public RSVP service` audit identity

The production health banner remains active until schema version 4 is present.

## 2. Add three path-specific Cloudflare Access applications

In Zero Trust, create self-hosted Access applications for these exact paths:

```text
poker.skpfam.com/rsvp/*
poker.skpfam.com/rsvp-api/*
poker.skpfam.com/assets/*
```

For each application, add a policy with:

```text
Action: Bypass
Selector: Everyone
```

The `/assets/*` bypass exposes only the compiled JavaScript and CSS needed to render the public RSVP page. It does not bypass any API or expose organizer data.

Do not bypass any of these paths:

```text
/events/*
/rsvp-admin-api/*
/api/*
/ops-api/*
/money-api/*
```

Organizer link management is located at `/events/<event-id>/rsvp-links`, outside the public `/rsvp/*` path.

The path-specific applications must be more specific than the existing organizer application protecting `poker.skpfam.com`.

## 3. Verify organizer controls

Open an event and select **RSVP links**.

1. Mark at least one rostered player as invited.
2. Choose whether the address is always visible or shown only after a Yes response.
3. Generate one link or generate all personalized links.
4. Confirm the invitation text copies to the clipboard.
5. Confirm link status, expiry, and last-response time appear.

Raw tokens are returned only when generated. D1 stores SHA-256 token hashes, not reusable raw links. Regenerating a link invalidates the previous one.

## 4. Verify public behavior

Use an incognito window that is not logged into Cloudflare Access.

1. Open a freshly generated `/rsvp/<token>` link.
2. Confirm the page and its styling load without an organizer login.
3. Submit Yes, Maybe, or No.
4. Confirm the organizer RSVP summary updates.
5. Confirm the event audit history contains `public rsvp updated` by `Public RSVP service`.
6. Revoke the link and confirm it no longer loads.
7. For address privacy, verify the location appears only after a Yes response.

## Security properties

- Tokens contain 256 bits of randomness.
- Only SHA-256 token hashes are stored.
- Links expire 36 hours after the scheduled start time.
- Cancelled, archived, and completed events reject new responses.
- Valid links are throttled to one response change every five seconds.
- Every public response creates an event audit entry.
- The public API never returns the roster, contact information, financial history, or organizer records.
