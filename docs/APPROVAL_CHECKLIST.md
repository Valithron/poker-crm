# BroTM Poker v2 approval checklist

Approve or revise these decisions before implementation begins.

- [ ] The product is a private organizer tool, not a general CRM.
- [ ] The core workflow is plan, invite, run, close, and review.
- [ ] The MVP supports trusted organizers only.
- [ ] Players do not need accounts in the MVP.
- [ ] The app prepares invitation information but does not send email or SMS initially.
- [ ] Attendance tracking is required.
- [ ] Money tracking is optional by event.
- [ ] The first vertical slice excludes money tracking.
- [ ] Cloudflare Pages hosts the frontend.
- [ ] Pages Functions provide the API.
- [ ] D1 is the authoritative database.
- [ ] Cloudflare Access provides MVP authentication.
- [ ] Pages Functions validate Access JWTs and organizer status server-side.
- [ ] Advanced analytics and public leaderboards are later features.

Implementation may begin after Sterling approves this checklist or records specific revisions.
