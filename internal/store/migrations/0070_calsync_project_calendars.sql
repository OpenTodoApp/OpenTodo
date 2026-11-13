-- A calendar per project in one calendar sync connection (OpenSpec change
-- calsync-project-calendars, D2): which writable calendar of the connection's
-- account each matched project (or Inbox) writes to, and the sync state of every
-- target calendar other than the connection's own. No rows is the one-calendar
-- behaviour. Removed with the connection. Idempotent.

CREATE TABLE IF NOT EXISTS calsync_project_targets (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL,
  calendar_url  TEXT NOT NULL,
  PRIMARY KEY (connection_id, project_id)
);

CREATE TABLE IF NOT EXISTS calsync_target_state (
  connection_id TEXT NOT NULL REFERENCES calsync_connections(id) ON DELETE CASCADE,
  calendar_url  TEXT NOT NULL,
  sync_token    TEXT NOT NULL DEFAULT '',
  ctag          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (connection_id, calendar_url)
);
