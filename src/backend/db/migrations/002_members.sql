CREATE TABLE IF NOT EXISTS members (
  discord_id          TEXT    PRIMARY KEY,
  username            TEXT    NOT NULL,
  discriminator       TEXT,                       -- legacy tag, empty for new usernames
  joined_at           TEXT,                       -- from discord guild member data
  rank                TEXT,                       -- e.g. 'citizen', 'senator' — derived from roles
  level               INTEGER,                    -- last known arcane level; NULL = not yet seen
  current_warning_id  INTEGER REFERENCES warnings(id) ON DELETE SET NULL,
  active_restrictions TEXT,                       -- JSON array of restricted channel IDs
  last_synced_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  aliases             TEXT,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_rank  ON members(rank);
CREATE INDEX IF NOT EXISTS idx_members_level ON members(level);