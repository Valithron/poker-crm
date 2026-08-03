# BroTM Poker v2 product phases

## Phase 1: Organizer foundation

- Cloudflare Access
- organizer identity
- players
- events
- event-player attendance
- event completion
- history

## Phase 2: Live money tracking

- buy-ins
- rebuys
- cash-outs
- adjustments
- event balance validation
- player net results

## Phase 3: Invitation delivery

- player-specific RSVP links
- manual email delivery through Resend
- delivery history and failure reporting
- development delivery sink for local and preview testing
- email-first roster invite action with confirmation
- delivery batches, idempotency, and failed-send retry
- private RSVP token rotation and response tracking

SMS delivery, preferred-channel fallback, and scheduled reminders remain the next delivery extensions using the same batch and token contracts.

Recurring campaigns and general-purpose bulk messaging remain later features. Automated invitation delivery is now part of the active product roadmap rather than a deferred non-goal.

## Phase 4: Useful analytics

- phone-first Live Night workspace and resilient installable shell
- roster search, attendance filters, and live refresh state
- local planning drafts and duplicate-night setup
- attendance trends
- hosting frequency
- RSVP conversion
- player participation summaries
- event-balance health

## Phase 5: Optional community features

Only after the organizer workflow is mature:

- player accounts
- public or group-visible statistics
- achievements
- leaderboards
- richer profiles
