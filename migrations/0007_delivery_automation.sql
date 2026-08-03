PRAGMA foreign_keys = ON;

CREATE TABLE delivery_schedules (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_player_id TEXT NOT NULL REFERENCES event_players(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('twenty_four_hours')),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'sent', 'skipped', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, event_player_id, reminder_type)
);

CREATE INDEX delivery_schedules_due_idx
ON delivery_schedules(status, scheduled_for);

CREATE INDEX delivery_schedules_event_idx
ON delivery_schedules(event_id, reminder_type, scheduled_for);
