# BroTM Poker decision log

## 2026-07-21: Hosting reset

- Hosting moved from Firebase Hosting to Cloudflare Pages.
- Historical attendance and earnings data are not migration requirements.
- The old Firebase application does not constrain v2.

## 2026-07-21: V2 product direction approved

Sterling approved the following direction:

- BroTM Poker is an organizer tool, not a general CRM.
- The primary workflow runs from planning through event closeout.
- The MVP is organizer-only.
- Players do not need accounts in the MVP.
- Initial delivery is organizer-triggered from within the application; automated reminders are an active follow-on phase.
- Attendance is core.
- Money tracking is optional by event and follows after the first vertical slice.
- D1 is the authoritative relational database.
- Pages Functions form the server-side API.
- Cloudflare Access is the MVP authentication boundary.
- API routes independently validate the Access JWT and organizer authorization.

## 2026-08-02: Delivery is manual-first, automation-ready

- Initial invitation sends remain an explicit organizer action so opening an event never accidentally messages the roster.
- A player-level preferred channel determines scheduled delivery; the other contact method is a fallback.
- Scheduled reminders run in a separate Cloudflare Cron Worker backed by D1.
- Development uses the message sink and public organizer identity; production can later re-enable Access and live providers.

## 2026-07-22: One remote D1 database

- Production uses one remote D1 database named `brotm-poker`.
- Local development uses Wrangler local D1 storage and consumes no remote database slot.
- Preview deployments do not bind to production data.
- Pages bindings are managed in the Cloudflare dashboard rather than a deployed `wrangler.toml`.

## 2026-08-02: Manual invitation delivery

- The current workflow milestone includes manual email delivery for invited players; SMS follows on the same delivery contracts.
- Resend is the default email provider and Twilio is the default SMS provider.
- A development delivery sink allows local and preview testing without provider credentials.
- Delivery is synchronous and organizer-triggered for initial invitations; scheduled reminders are now implemented as a follow-on Cron Worker workflow.
- Build and preview environments may use `AUTH_MODE=public` with `DEV_ORGANIZER_EMAIL` so login setup does not block construction.
