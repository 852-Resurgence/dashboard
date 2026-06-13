CREATE TABLE IF NOT EXISTS member_levels (
  discord_id  TEXT    PRIMARY KEY,
  username    TEXT    NOT NULL,                  
  level       INTEGER NOT NULL,
  seen_at     TEXT    NOT NULL DEFAULT (datetime('now'))  -- date of level update
);