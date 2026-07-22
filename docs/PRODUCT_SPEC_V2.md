# BroTM Poker v2 product specification

Status: Proposed for approval  
Owner: Sterling  
Production URL: `https://poker.skpfam.com`

## 1. Product purpose

**BroTM Poker is a private, mobile-first organizer tool for planning, running, and closing recurring home poker nights without scattered texts, paper notes, or duplicated bookkeeping.**

The product is not a general CRM. It is the operating system for one small poker community.

## 2. Primary user

The primary user is a trusted BroTM Poker organizer.

The first release should support Sterling and a small number of additional organizers. Players do not need accounts in the first release.

### Organizer permissions

Organizers can:

- manage the player directory
- create and edit poker nights
- choose invitees
- record invitation and RSVP status
- check players in during the night
- optionally record buy-ins, rebuys, cash-outs, and adjustments
- close and lock an event
- review event and player history

### Player access

Player accounts, self-service RSVP, and public statistics are later features. The MVP should not carry the complexity of custom player authentication.

## 3. Core job

The application must make this sequence fast and reliable:

> Decide when poker night is happening, decide who is invited, see who is coming, run check-in and money tracking from a phone, then close the night with a clean permanent record.

If the application does this well, it is useful even without advanced analytics.

## 4. Product principles

1. **Mobile first.** The live-night screen must be comfortable to use one-handed at the table.
2. **One source of truth.** Attendance, RSVP state, and money records each exist in one authoritative place.
3. **No rote duplicate entry.** Data entered during the night becomes the permanent event record.
4. **Fast over elaborate.** Common actions should take one or two taps.
5. **Private by default.** Contact information and financial results are organizer-only.
6. **Archive, do not destroy.** Players and completed nights should normally be archived or locked, not deleted.
7. **Optional money tracking.** A poker night can be completed with attendance only, or with a balanced cash ledger.
8. **Purpose before statistics.** Analytics are derived from operational records and never become a second data store.

## 5. Complete poker-night workflow

### Phase A: Plan

An organizer creates a poker night with:

- date and start time
- host
- location
- game or format notes
- stakes and house-rule notes
- optional capacity
- optional money tracking toggle

Initial status: `draft`.

### Phase B: Invite

The organizer selects players from the directory and assigns an invitation state:

- `invited`
- `not invited`

Each invited player can then receive an RSVP state:

- `pending`
- `yes`
- `maybe`
- `no`

The MVP does not need to send messages. It should provide a clean invite summary and copyable invite text. Automatic email, SMS, and player RSVP links belong to a later phase.

When the invite list is ready, the event becomes `open`.

### Phase C: Run the night

The organizer opens **Live Night** on a phone.

Each player row shows:

- name
- RSVP state
- checked-in state
- current money position when money tracking is enabled

Primary actions:

- check in or undo check-in
- add buy-in
- add rebuy
- record cash-out
- add a labeled adjustment
- add a quick event note

The screen should prioritize active attendees and hide unnecessary profile details.

### Phase D: Close

The organizer reviews:

- final attendance
- unresolved RSVP states
- players missing cash-out values
- total money in
- total money out
- any imbalance

The organizer can complete an attendance-only event without money records.

For a money-tracked event, the app should warn when cash-in and cash-out do not balance. An organizer may close with an explicit adjustment and note, but the imbalance must never be silently ignored.

Final status: `completed`.

Completed events are locked against accidental edits. An organizer can deliberately reopen one with an audit note.

### Phase E: Review

The completed record powers:

- event history
- player attendance history
- last attended date
- attendance rate
- host frequency
- total buy-ins and cash-outs
- derived net result
- unresolved or adjusted event warnings

No player-level totals are manually stored.

## 6. MVP features

### Required

- organizer-only access
- dashboard with next or active poker night
- player directory
- create and edit poker night
- invite roster and RSVP states
- mobile Live Night mode
- attendance check-in
- optional cash ledger
- event closeout validation
- completed event history
- player history
- search and filtering
- archive players
- responsive design
- loading, empty, success, and error states

### Explicitly later

- player accounts
- self-service RSVP links
- automated email or text delivery
- public leaderboards
- achievements or badges
- poker strategy tools
- online poker gameplay
- payment processing
- tournament clock or blind structure
- historical Firebase data migration

## 7. Screen inventory

### Dashboard

- next upcoming event
- active event entry point
- RSVP totals
- expected attendance
- incomplete closeouts
- recent events
- quick actions

### Night Builder

- details
- invitees
- RSVP status
- copied invite summary
- open, cancel, or archive controls

### Live Night

- large touch targets
- attendee-first sorting
- check-in
- buy-in, rebuy, cash-out, and adjustment actions
- running event totals
- close event action

### Players

- searchable directory
- active and archived filters
- contact information
- organizer notes
- attendance summary
- event history

### History

- completed events
- date, host, attendance, and balance status
- event detail view
- deliberate reopen action

### Settings

- organizer list
- default location
- default game and stakes text
- money-tracking defaults
- access and security status

## 8. Authoritative data model

The proposed database is relational because events, players, attendance, and ledger entries have clear relationships.

### `organizers`

- `id`
- `email`
- `display_name`
- `role`: `admin` or `organizer`
- `active`
- `created_at`
- `updated_at`

### `players`

- `id`
- `first_name`
- `last_name`
- `display_name`
- `email`
- `phone`
- `status`: `active` or `archived`
- `notes`
- `created_at`
- `updated_at`

### `events`

- `id`
- `title`
- `starts_at`
- `host_player_id`, nullable
- `location`
- `game_notes`
- `stakes_notes`
- `capacity`, nullable
- `money_tracking_enabled`
- `status`: `draft`, `open`, `active`, `completed`, `cancelled`, or `archived`
- `notes`
- `created_by_organizer_id`
- `created_at`
- `updated_at`
- `completed_at`, nullable

### `event_players`

Composite uniqueness: one row per event and player.

- `id`
- `event_id`
- `player_id`
- `invitation_status`: `invited` or `not_invited`
- `rsvp_status`: `pending`, `yes`, `maybe`, or `no`
- `attended`
- `checked_in_at`, nullable
- `notes`
- `created_at`
- `updated_at`

### `ledger_entries`

Money is stored as integer cents.

- `id`
- `event_id`
- `player_id`
- `entry_type`: `buy_in`, `rebuy`, `cash_out`, or `adjustment`
- `amount_cents`
- `note`, nullable
- `created_by_organizer_id`
- `created_at`

### `event_audit_log`

- `id`
- `event_id`
- `organizer_id`
- `action`
- `details_json`
- `created_at`

## 9. Derived values

The application derives these values rather than storing competing copies:

- attendance count from `event_players.attended`
- player attendance total from completed event-player rows
- last attended date from completed events
- total cash in from buy-ins, rebuys, and positive adjustments
- total cash out from cash-outs and negative adjustments
- player net from ledger entries
- event balance from total cash in minus total cash out
- RSVP totals from event-player rows

## 10. Cloudflare architecture

### Frontend

- Cloudflare Pages
- TypeScript application
- mobile-first component architecture
- production at `poker.skpfam.com`

### Server-side API

- Cloudflare Pages Functions under `/api/*`
- all writes handled server-side
- request validation on every mutation
- no direct browser access to the database

### Database

- Cloudflare D1
- SQL migrations committed to the repository
- local development database separate from production
- preview and production bindings kept separate

### Authentication

For the MVP, protect the organizer application with Cloudflare Access using approved organizer email addresses.

Pages Functions must still validate the signed Access JWT for API requests and use the verified email identity to resolve an active organizer record.

This avoids building a custom password system while preserving server-side authorization.

### Not needed for MVP

- KV
- R2
- Durable Objects
- Queues
- custom OAuth provider

These services should only be added when a concrete workflow requires them.

## 11. First vertical slice

The first implementation should prove one complete path rather than build disconnected screens.

### Slice scope

1. Organizer passes Cloudflare Access.
2. Dashboard loads from a Pages Function.
3. Organizer creates a player.
4. Organizer creates a draft event.
5. Organizer adds that player to the event.
6. Organizer marks the player as attending.
7. Organizer completes the event.
8. History shows the completed event and attendance.

### Included technical work

- TypeScript frontend foundation
- Pages Functions API foundation
- D1 schema and migrations
- Access JWT validation middleware
- organizer identity resolution
- players API
- events API
- event-player API
- dashboard, player, event, and history UI for the slice
- unit tests for validation and calculations
- API tests against local D1
- smoke test for the complete path

### Excluded from the first slice

- cash ledger
- automatic invitations
- player accounts
- analytics dashboards
- public pages

## 12. Acceptance criteria for product approval

This specification is approved when the following are accepted:

- organizer-first scope
- planning through closeout as the core workflow
- players do not need accounts in the MVP
- invitation delivery remains outside the app initially
- attendance is required and money tracking is optional
- D1 is the authoritative data store
- Cloudflare Access protects the organizer application
- the first vertical slice excludes advanced analytics and money tracking

After approval, implementation may begin on a new feature branch.