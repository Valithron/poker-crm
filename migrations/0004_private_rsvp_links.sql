PRAGMA foreign_keys = ON;

ALTER TABLE events
ADD COLUMN rsvp_location_visibility TEXT NOT NULL DEFAULT 'always'
CHECK (rsvp_location_visibility IN ('always', 'after_yes'));

CREATE TABLE event_invites (
  id TEXT PRIMARY KEY,
  event_player_id TEXT NOT NULL UNIQUE REFERENCES event_players(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_response_at TEXT,
  response_count INTEGER NOT NULL DEFAULT 0 CHECK (response_count >= 0),
  created_by_organizer_id TEXT NOT NULL REFERENCES organizers(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX event_invites_token_idx ON event_invites(token_hash);
CREATE INDEX event_invites_expiry_idx ON event_invites(expires_at, revoked_at);

INSERT OR IGNORE INTO organizers
  (id, email, display_name, role, active, created_at, updated_at)
VALUES
  ('public-rsvp-service', 'public-rsvp@system.invalid', 'Public RSVP service', 'organizer', 0,
   '2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z');
