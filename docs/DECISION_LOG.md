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
- Invitation delivery stays outside the application initially.
- Attendance is core.
- Money tracking is optional by event and follows after the first vertical slice.
- D1 is the authoritative relational database.
- Pages Functions form the server-side API.
- Cloudflare Access is the MVP authentication boundary.
- API routes independently validate the Access JWT and organizer authorization.
