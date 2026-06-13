CREATE TABLE IF NOT EXISTS warning_config (
  level             TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL,             -- e.g. 'verbal warning'
  description       TEXT    NOT NULL,
  send_dm           INTEGER NOT NULL DEFAULT 1,   -- 0/1 bool
  post_mod_log      INTEGER NOT NULL DEFAULT 0,
  restrict_channels INTEGER NOT NULL DEFAULT 0,   -- active_restriction_channels list
  ban_duration_hrs  INTEGER,                      -- NULL = no ban; >0 = temp ban duration
  permanent_ban     INTEGER NOT NULL DEFAULT 0,   -- 1 = permanent ban, overrides ban_duration_hrs
  auto_expire_days  INTEGER,                      -- NULL = never auto-expires
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS restriction_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  TEXT    NOT NULL UNIQUE,            -- discord channel ID
  channel_name TEXT   NOT NULL,                   -- display name
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id     TEXT    PRIMARY KEY,                -- discord role ID
  role_name   TEXT    NOT NULL,                   -- display name
  permission  TEXT    NOT NULL                    -- 'admin' | 'mod'
    CHECK (permission IN ('admin', 'mod')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);