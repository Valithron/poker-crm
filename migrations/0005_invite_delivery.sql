PRAGMA foreign_keys = ON;

CREATE TABLE invite_deliveries (
  id TEXT PRIMARY KEY,
  event_invite_id TEXT NOT NULL REFERENCES event_invites(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  destination TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  token_hash TEXT NOT NULL,
  requested_by_organizer_id TEXT NOT NULL REFERENCES organizers(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX invite_deliveries_invite_created_idx
ON invite_deliveries(event_invite_id, created_at);

CREATE INDEX invite_deliveries_channel_status_idx
ON invite_deliveries(channel, status, created_at);
