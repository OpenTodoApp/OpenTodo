-- CalDAV two-way sync (OpenSpec change `caldav`). Additive and idempotent: every
-- statement can run again without error, so the file survives renumbering when
-- sibling changes land first. Nothing here is synced: app passwords are account
-- credentials like API tokens, and resource names are WebDAV bookkeeping.

-- Shared owner-level key/value settings (key `caldav.enabled`). Created only if
-- an earlier migration has not.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER
);

-- Per-user app passwords (design D2): CalDAV-only credentials used with HTTP
-- Basic. Only the SHA-256 hash of the 256-bit random secret is stored. Revoked
-- rows are kept (revoked_at set) so the list can show them until deleted with
-- the account.
CREATE TABLE IF NOT EXISTS app_passwords (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS app_passwords_user ON app_passwords(user_id);

-- Resource names chosen by calendar clients. A task is served as <task-id>.ics
-- with UID = task id unless a client created it under another name or with a
-- UID that is not a usable task id; then the name and UID it used are kept here
-- so the client finds the resource where it put it. Keyed by task id: the row
-- goes with the task's purge (rows for unknown tasks are ignored).
CREATE TABLE IF NOT EXISTS caldav_resources (
  task_id TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  uid     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS caldav_resources_name ON caldav_resources(name);
CREATE INDEX IF NOT EXISTS caldav_resources_uid ON caldav_resources(uid);
