PRAGMA foreign_keys = ON;

ALTER TABLE events
ADD COLUMN money_tracking_enabled INTEGER NOT NULL DEFAULT 0
CHECK (money_tracking_enabled IN (0, 1));

ALTER TABLE events
ADD COLUMN default_buy_in_cents INTEGER NOT NULL DEFAULT 0
CHECK (default_buy_in_cents >= 0);

ALTER TABLE events
ADD COLUMN stakes_notes TEXT;

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('buy_in', 'rebuy', 'cash_out', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  note TEXT,
  created_by_organizer_id TEXT NOT NULL REFERENCES organizers(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (entry_type IN ('buy_in', 'rebuy') AND amount_cents > 0) OR
    (entry_type = 'cash_out' AND amount_cents >= 0) OR
    (entry_type = 'adjustment' AND amount_cents <> 0 AND note IS NOT NULL AND length(trim(note)) > 0)
  )
);

CREATE INDEX ledger_entries_event_created_idx
ON ledger_entries(event_id, created_at);

CREATE INDEX ledger_entries_player_event_idx
ON ledger_entries(player_id, event_id);

CREATE TRIGGER prevent_unresolved_money_closeout
BEFORE UPDATE OF status ON events
WHEN NEW.status = 'completed'
  AND OLD.status <> 'completed'
  AND NEW.money_tracking_enabled = 1
  AND (
    EXISTS (
      SELECT 1
      FROM event_players ep
      WHERE ep.event_id = NEW.id
        AND ep.attended = 1
        AND NOT EXISTS (
          SELECT 1
          FROM ledger_entries le
          WHERE le.event_id = NEW.id
            AND le.player_id = ep.player_id
            AND le.entry_type = 'cash_out'
        )
    )
    OR
    COALESCE((
      SELECT SUM(
        CASE
          WHEN entry_type IN ('buy_in', 'rebuy') THEN amount_cents
          WHEN entry_type = 'adjustment' AND amount_cents > 0 THEN amount_cents
          ELSE 0
        END
      )
      FROM ledger_entries
      WHERE event_id = NEW.id
    ), 0)
    <>
    COALESCE((
      SELECT SUM(
        CASE
          WHEN entry_type = 'cash_out' THEN amount_cents
          WHEN entry_type = 'adjustment' AND amount_cents < 0 THEN -amount_cents
          ELSE 0
        END
      )
      FROM ledger_entries
      WHERE event_id = NEW.id
    ), 0)
  )
BEGIN
  SELECT RAISE(ABORT, 'Money closeout is unresolved');
END;
