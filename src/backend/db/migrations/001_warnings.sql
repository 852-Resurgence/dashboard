CREATE TABLE IF NOT EXISTS warnings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id      TEXT    NOT NULL,
  username        TEXT    NOT NULL,               
  level           TEXT    NOT NULL,
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

CREATE TABLE IF NOT EXISTS appeals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warning_id    INTEGER NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
  discord_id    TEXT    NOT NULL,
  username      TEXT    NOT NULL,
  submitted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  eligible_at   TEXT    NOT NULL,                -- 6 months after the ban was issued
  status        TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by   TEXT,                            -- Moderator Discord ID
  reviewed_at   TEXT,
  notes         TEXT                             -- Internal mod notes on the appeal
);
 
CREATE INDEX IF NOT EXISTS idx_appeals_discord_id  ON appeals(discord_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status      ON appeals(status);

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