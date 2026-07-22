PRAGMA foreign_keys = ON;

CREATE TABLE organizers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'organizer' CHECK (role IN ('admin', 'organizer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX players_status_name_idx ON players(status, display_name COLLATE NOCASE);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Poker Night',
  starts_at TEXT NOT NULL,
  host_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  location TEXT NOT NULL DEFAULT '',
  game_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'active', 'completed', 'cancelled', 'archived')),
  notes TEXT,
  created_by_organizer_id TEXT NOT NULL REFERENCES organizers(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX events_status_starts_idx ON events(status, starts_at);

CREATE TABLE event_players (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  invitation_status TEXT NOT NULL DEFAULT 'invited' CHECK (invitation_status IN ('invited', 'not_invited')),
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'yes', 'maybe', 'no')),
  attended INTEGER NOT NULL DEFAULT 0 CHECK (attended IN (0, 1)),
  checked_in_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, player_id)
);

CREATE INDEX event_players_event_idx ON event_players(event_id);
CREATE INDEX event_players_player_idx ON event_players(player_id);

CREATE TABLE event_audit_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id TEXT NOT NULL REFERENCES organizers(id),
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX event_audit_event_idx ON event_audit_log(event_id, created_at);
