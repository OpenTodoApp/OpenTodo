-- Scheduled backups (OpenSpec change `backups`).
-- `settings` is the shared owner-level key/value store (also used by webhooks,
-- CalDAV, MCP...); IF NOT EXISTS keeps the shape identical whichever change lands first.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- The log generation identifies this incarnation of the op log. It changes on every
-- restore so devices know to re-seed (see docs/sync.md). Created once here.
INSERT OR IGNORE INTO settings(key, value, updated_at)
  VALUES ('generation', lower(hex(randomblob(16))), CAST(strftime('%s','now') AS INTEGER) * 1000);

-- One row per backup attempt, kept for 90 days.
CREATE TABLE backup_runs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'manual',   -- manual | scheduled
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  status       TEXT NOT NULL,                    -- running | succeeded | failed
  bytes        INTEGER NOT NULL DEFAULT 0,
  destination  TEXT NOT NULL DEFAULT '',
  archive_name TEXT NOT NULL DEFAULT '',
  error        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX backup_runs_started ON backup_runs(started_at);
