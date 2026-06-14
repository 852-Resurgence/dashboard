CREATE TABLE IF NOT EXISTS pending_vents (
  id           TEXT    PRIMARY KEY,               
  discord_id   TEXT    NOT NULL,                 
  submitted_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- is_current = 1 for the most recent valid introduction per user.
CREATE TABLE IF NOT EXISTS member_introductions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id   TEXT    NOT NULL,
  username     TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  submitted_at TEXT    NOT NULL DEFAULT (datetime('now')),
  is_current   INTEGER NOT NULL DEFAULT 1         -- 0 = historical, 1 = active
);

CREATE INDEX IF NOT EXISTS idx_introductions_discord_id  ON member_introductions(discord_id);
CREATE INDEX IF NOT EXISTS idx_introductions_is_current  ON member_introductions(discord_id, is_current);