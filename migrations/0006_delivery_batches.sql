PRAGMA foreign_keys = ON;

ALTER TABLE players
ADD COLUMN preferred_channel TEXT NOT NULL DEFAULT 'email'
CHECK (preferred_channel IN ('email', 'sms'));

CREATE TABLE delivery_batches (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requested_by_organizer_id TEXT NOT NULL REFERENCES organizers(id),
  requested_channels_json TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy IN ('requested_channels', 'preferred_with_fallback')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('sending', 'completed', 'partial', 'failed')),
  requested_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX delivery_batches_event_created_idx
ON delivery_batches(event_id, created_at DESC);

CREATE TABLE invite_delivery_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  event_player_id TEXT NOT NULL REFERENCES event_players(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  destination TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  delivery_id TEXT,
  error_message TEXT,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(batch_id, event_player_id, channel)
);

CREATE INDEX invite_delivery_results_batch_idx
ON invite_delivery_results(batch_id, created_at);

CREATE INDEX invite_delivery_results_player_idx
ON invite_delivery_results(event_player_id, created_at DESC);

ALTER TABLE invite_deliveries
ADD COLUMN batch_id TEXT REFERENCES delivery_batches(id) ON DELETE SET NULL;

ALTER TABLE invite_deliveries
ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;

ALTER TABLE invite_deliveries
ADD COLUMN idempotency_key TEXT;

ALTER TABLE invite_deliveries
ADD COLUMN provider_status TEXT;

ALTER TABLE invite_deliveries
ADD COLUMN provider_status_at TEXT;

CREATE INDEX invite_deliveries_batch_idx
ON invite_deliveries(batch_id, created_at);

CREATE INDEX invite_deliveries_idempotency_idx
ON invite_deliveries(idempotency_key);
