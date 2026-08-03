PRAGMA foreign_keys = ON;

ALTER TABLE events
ADD COLUMN invite_automation_enabled INTEGER NOT NULL DEFAULT 0
CHECK (invite_automation_enabled IN (0, 1));

ALTER TABLE event_invites
ADD COLUMN token_ciphertext TEXT;

ALTER TABLE delivery_batches
ADD COLUMN notification_type TEXT NOT NULL DEFAULT 'invite'
CHECK (notification_type IN ('invite', 'reminder', 'event_update'));

CREATE TABLE event_update_notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_player_id TEXT NOT NULL REFERENCES event_players(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'sent', 'skipped', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, event_player_id, notification_key)
);

CREATE INDEX event_update_notifications_due_idx
ON event_update_notifications(status, created_at);

CREATE INDEX event_update_notifications_event_idx
ON event_update_notifications(event_id, created_at DESC);
