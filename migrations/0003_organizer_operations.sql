PRAGMA foreign_keys = ON;

ALTER TABLE events
ADD COLUMN capacity INTEGER
CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 200));

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_location TEXT NOT NULL DEFAULT '',
  default_game_notes TEXT,
  default_stakes_notes TEXT,
  default_money_tracking_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (default_money_tracking_enabled IN (0, 1)),
  default_buy_in_cents INTEGER NOT NULL DEFAULT 0
    CHECK (default_buy_in_cents >= 0),
  updated_by_organizer_id TEXT REFERENCES organizers(id),
  updated_at TEXT NOT NULL
);

INSERT INTO app_settings (
  id,
  default_location,
  default_game_notes,
  default_stakes_notes,
  default_money_tracking_enabled,
  default_buy_in_cents,
  updated_by_organizer_id,
  updated_at
)
VALUES (1, '', NULL, NULL, 0, 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
