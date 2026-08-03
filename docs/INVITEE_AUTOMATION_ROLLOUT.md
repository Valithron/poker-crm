# Invitee experience and automation rollout

This release improves the player-facing RSVP page and adds opt-in email follow-up.

## Database

Apply migrations `0007_delivery_automation.sql` and `0008_invitee_automation.sql` to the same D1 database used by Pages. Confirm `/api/health` reports schema version 8 and `ok: true`.

Migration 0008 adds the event automation flag, encrypted RSVP-token storage, the delivery notification type, and the event-update queue.

## Pages configuration

Keep the existing production values and add:

```text
RSVP_TOKEN_ENCRYPTION_KEY=<long random secret>
```

The value must be identical for Pages Functions and the Worker. Never commit it. Existing invites created before this release do not have an encrypted token copy; resend those invitations once after deployment before expecting automated follow-up for them.

## Worker deployment

1. Copy the production D1 `database_id` into `wrangler.worker.jsonc`.
2. Deploy the Worker with `npm run deploy:worker`.
3. Add Worker secrets for `RESEND_API_KEY`, `EMAIL_FROM`, and `RSVP_TOKEN_ENCRYPTION_KEY`.
4. Set `PUBLIC_APP_ORIGIN=https://poker.skpfam.com` and `DELIVERY_MODE=live` in the Worker production environment.
5. Confirm the Cron Trigger is present and run the Worker once manually if a smoke test is needed.

The Worker runs every 15 minutes. It sends only email. Pending players receive one reminder 24 hours before an enabled event. Material event changes queue update messages for invited players. Provider failures are persisted and retried up to three times.

## Organizer smoke test

1. Create or open a future event and add only the organizer’s own player record.
2. Enable **Automate invitee emails** on the event setup page.
3. Send one invitation and confirm the received RSVP link works.
4. Use **Add to calendar** and confirm the `.ics` file opens with the four-hour default duration.
5. Submit an RSVP and confirm the organizer roster updates while attendance remains unchecked.
6. Change the location or start time and confirm a queued event-update batch appears after the Worker runs.
7. For a reminder test, use an event whose start is 24 hours away and leave the RSVP pending.

If an automated row says the player needs a fresh invitation, resend the organizer invitation. That creates the encrypted token copy needed to reuse the same link safely.
