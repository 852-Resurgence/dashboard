CREATE TABLE IF NOT EXISTS warnings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id      TEXT    NOT NULL,
  username        TEXT    NOT NULL,               
  level           INTEGER NOT NULL,               -- references warning_config.level
  reason          TEXT    NOT NULL,
  issued_by_id    TEXT    NOT NULL,               -- staff discord user ID
  issued_by_name  TEXT    NOT NULL,               -- staff username
  issued_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT,                           -- NULL = no automatic expiry
  expired         INTEGER NOT NULL DEFAULT 0,     -- 0 = active, 1 = expired
  expired_at      TEXT,
  sheets_row      INTEGER,                        -- row index in sheets
  escalated_from  INTEGER REFERENCES warnings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_warnings_discord_id ON warnings(discord_id);
CREATE INDEX IF NOT EXISTS idx_warnings_expired    ON warnings(expired);
CREATE INDEX IF NOT EXISTS idx_warnings_issued_at  ON warnings(issued_at);

CREATE TABLE IF NOT EXISTS scheduled_unbans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id  TEXT    NOT NULL UNIQUE,
  username    TEXT    NOT NULL,
  unban_at    TEXT    NOT NULL,
  warning_id  INTEGER REFERENCES warnings(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sheet_locks (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  locked    INTEGER NOT NULL DEFAULT 0,
  locked_by TEXT,
  locked_at TEXT
);

INSERT OR IGNORE INTO sheet_locks (id, locked) VALUES (1, 0);